import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, ProductModerationStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * End-to-end harness — a real Nest app, a real Postgres database, real
 * HTTP.
 *
 * **Why not mock Prisma.** Everything worth guarding on this server is a
 * rule enforced *by a query*: a review needs a delivered order, a seller
 * sees only their own kitchen's rows, a return window counts from
 * `deliveredAt`. A mocked Prisma would let those tests pass while the
 * query said something else entirely — it would test the mock. So the
 * suite boots the same module graph `main.ts` boots, against a database
 * whose only job is being thrown away.
 *
 * The app is built with the same pipeline as `main.ts` (global prefix,
 * whitelisting `ValidationPipe`), because half of what is under test is
 * that pipeline: `forbidNonWhitelisted` is what turns a seller's attempt
 * to set their own verification flag into a 400 rather than a silent strip.
 */

export interface Harness {
  app: INestApplication;
  prisma: PrismaClient;
  /** `request(app.getHttpServer())` with the `/api/v1` prefix already applied. */
  api: () => request.Agent;
  close: () => Promise<void>;
}

export const API_PREFIX = '/api/v1';

export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/db'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  /**
   * Listen once, for the whole spec file, instead of letting supertest
   * open and close a port per request.
   *
   * `request(server)` checks `server.address()`; when it is null it calls
   * `server.listen(0)`, remembers that listener, and **closes it again as
   * soon as that one response lands** (`supertest/lib/test.js` —
   * `serverAddress()` and `end()`). So with an un-listened server, request
   * A binds an ephemeral port, request B is constructed while A's port is
   * still up, sees a non-null address, reuses the port and adopts no
   * listener of its own — and then A finishes and closes it out from under
   * B.
   *
   * B does not simply fail. The port is released back to the OS, which on
   * a normal developer machine hands ephemeral ports to whatever asks next
   * — so B's request can reach an entirely unrelated local server. That is
   * not hypothetical: this suite was intermittently failing with
   * `405 {"code":"MethodNotAllowed"}`, an envelope this API cannot produce,
   * and before that a bare 404. It read as a timing flake in notification
   * delivery for exactly as long as nobody printed the response body.
   *
   * The dangerous half is the one that does not fail: a request answered
   * by a foreign server could also return a status a test happens to
   * accept. Binding once removes the whole class — `address()` is never
   * null, so supertest never opens or closes anything, and every request
   * in the file goes to this app.
   */
  await app.listen(0);

  const prisma = new PrismaClient();

  return {
    app,
    prisma,
    api: () => request(app.getHttpServer()),
    close: async () => {
      await prisma.$disconnect();
      await app.close();
    },
  };
}

/**
 * Empties every table between suites.
 *
 * One statement, so foreign keys never dictate an order that has to be
 * maintained by hand as the schema grows — a truncation list that silently
 * stops covering a new table is how tests start leaking into each other.
 * `_prisma_migrations` is excluded: dropping it would strand the database
 * mid-lineage.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');

  // Retried on deadlock, because some writes deliberately outlive the
  // request that triggered them.
  //
  // Order notifications (M18) are fire-and-forget — a paid order must not
  // roll back because a WhatsApp message failed — so an `INSERT` into
  // `Notification` can still be in flight when the *next* test's reset
  // starts. `TRUNCATE ... CASCADE` takes an ACCESS EXCLUSIVE lock on every
  // table at once and deadlocks against it (Postgres `40P01`).
  //
  // Retrying is the right fix rather than making delivery synchronous:
  // the asynchrony is a product decision worth keeping, and the loser of a
  // deadlock is always safe to repeat. Three attempts with a short backoff
  // — a genuinely stuck reset still fails rather than hanging the suite.
  /**
   * Wait a bounded time for the lock, then say why we could not get it.
   *
   * Without this the reset simply blocks. `TRUNCATE` needs ACCESS
   * EXCLUSIVE on every table at once, so *any* other session reading any
   * of them holds it off — and the only symptom is Jest's
   * `Exceeded timeout of 30000 ms for a hook`, attributed to whichever
   * test happened to be next. Measured here: a stray `ts-node src/main.ts`
   * left pointing at the test database stalled one reset for 151 seconds
   * and was reported as a failure in an unrelated RBAC assertion.
   *
   * Five seconds is far longer than a reset between two of our own tests
   * ever needs, so exceeding it means something outside the suite is
   * holding the database — which is exactly what the error should say.
   */
  await prisma.$executeRawUnsafe(`SET lock_timeout = '5s';`);

  // Retried on deadlock, because some writes deliberately outlive the
  // request that triggered them.
  //
  // Order notifications (M18) are fire-and-forget — a paid order must not
  // roll back because a WhatsApp message failed — so an `INSERT` into
  // `Notification` can still be in flight when the *next* test's reset
  // starts. `TRUNCATE ... CASCADE` takes an ACCESS EXCLUSIVE lock on every
  // table at once and deadlocks against it (Postgres `40P01`).
  //
  // Retrying is the right fix rather than making delivery synchronous:
  // the asynchrony is a product decision worth keeping, and the loser of a
  // deadlock is always safe to repeat. Three attempts with a short backoff
  // — a genuinely stuck reset still fails rather than hanging the suite.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
      return;
    } catch (err) {
      const text = String(err);

      // `55P03 lock_not_available` — the `lock_timeout` above fired.
      if (text.includes('55P03')) {
        throw new Error(
          'Could not reset the test database: TRUNCATE waited 5s for a lock and gave up.\n' +
            'Something outside the suite is connected to it — most often a dev server ' +
            'still pointing at TEST_DATABASE_URL. Check with:\n' +
            "  SELECT pid, state, query FROM pg_stat_activity WHERE datname = current_database();",
        );
      }

      const isDeadlock = text.includes('40P01');
      if (!isDeadlock || attempt >= 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

export interface Actor {
  userId: string;
  email: string;
  token: string;
  /** Present only for a HomeKrafter. */
  sellerId?: string;
  vendorId?: string;
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;

/**
 * Registers a user through the real auth endpoint, promotes them if
 * needed, then signs in again so the token carries the final role.
 *
 * The re-login matters: role lives in the JWT claims, so a token minted
 * before the promotion still says `consumer` — the same trap a real
 * operator hits when they promote someone who is already signed in.
 */
export async function createActor(
  h: Harness,
  role: UserRole = 'consumer',
  options: { sellerId?: string } = {},
): Promise<Actor> {
  const email = `${role}-${uniq()}@example.test`;
  const password = 'test-password-123';

  const registered = await h
    .api()
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: `Test ${role}`, email, password });

  // Assert with the body in hand, not `.expect(201)`.
  //
  // Every spec builds its actors here, so a failure in this one call
  // surfaces as an unexplained status on whichever test happened to run
  // first — `expected 201 "Created", got 404 "Not Found"` and nothing
  // else. The API's error envelope is exactly the diagnostic that was
  // missing, and throwing it away is what kept a flake here misfiled as
  // a timing problem elsewhere.
  if (registered.status !== 201) {
    throw new Error(
      `Registering ${email} failed: ${registered.status} ` +
        `${JSON.stringify(registered.body)}`,
    );
  }

  const userId: string = registered.body.user.id;

  if (role !== 'consumer') {
    await h.prisma.user.update({ where: { id: userId }, data: { role } });
  }
  if (options.sellerId) {
    await h.prisma.seller.update({ where: { id: options.sellerId }, data: { userId } });
  }

  const signedIn = await h
    .api()
    .post(`${API_PREFIX}/auth/login`)
    .send({ email, password })
    .expect(200);

  return {
    userId,
    email,
    // `AuthResult extends TokenPair` — the tokens are on the root, not
    // nested under a `tokens` key.
    token: signedIn.body.accessToken,
    sellerId: options.sellerId,
  };
}

export const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

/**
 * The message out of the API's error envelope.
 *
 * Every thrown error is normalised to `{ error: { code, message } }` by
 * `AllExceptionsFilter` — reading `body.message` instead silently yields
 * `undefined`, which makes a `toMatch` assertion fail for the wrong
 * reason.
 */
export const errorOf = (res: { body: { error?: { code?: string; message?: string } } }) =>
  res.body.error ?? {};

// ---------------------------------------------------------------------
// Fixtures — the smallest rows that make a rule reachable
// ---------------------------------------------------------------------

/** A HomeKrafter: vendor + seller, wired the way an approved application leaves them. */
export async function createKitchen(
  h: Harness,
  overrides: { name?: string; area?: string; lat?: number; lng?: number } = {},
) {
  const slug = `kitchen-${uniq()}`;
  const vendor = await h.prisma.vendor.create({
    data: {
      slug,
      name: overrides.name ?? 'Test Kitchen',
      type: 'maker',
      bio: 'A test kitchen',
      avatarPlaceholder: 'avatar',
      bannerPlaceholder: 'banner',
      location: 'Sector 34, Chandigarh',
      area: overrides.area ?? 'chd-sector-34',
      lat: overrides.lat ?? 30.7196,
      lng: overrides.lng ?? 76.7601,
    },
  });

  const sellerUser = await h.prisma.user.create({
    data: {
      name: overrides.name ?? 'Test Kitchen',
      email: `kitchen-${uniq()}@example.test`,
      role: 'seller',
      referralCode: `REF${uniq().toUpperCase()}`,
    },
  });

  const seller = await h.prisma.seller.create({
    data: {
      userId: sellerUser.id,
      vendorId: vendor.id,
      displayName: overrides.name ?? 'Test Kitchen',
      status: 'approved',
      specialties: ['pickles_preserves'],
    },
  });

  return { vendor, seller };
}

export async function createCategory(h: Harness) {
  return h.prisma.category.create({
    data: { slug: `cat-${uniq()}`, name: 'Pickles', imagePlaceholder: 'pickles' },
  });
}

/**
 * A live, approved listing — the fixture nearly every spec means when it
 * says "a product exists".
 *
 * `moderationStatus` is explicit because M22 changed the column default to
 * `pending`. Leaning on the default here would have quietly made every
 * fixture invisible to every browse surface, and the resulting failures
 * would have read as broken catalogue queries rather than as fixtures that
 * had never been approved. Pass `moderationStatus` to test the gate
 * itself.
 */
export async function createProduct(
  h: Harness,
  vendorId: string,
  categoryId: string,
  overrides: { name?: string; price?: number; moderationStatus?: ProductModerationStatus } = {},
) {
  // `WeightOption.sku` is globally unique, not unique per product — two
  // products in one test would collide on a shared literal.
  const sku = `sku-${uniq()}`;
  const product = await h.prisma.product.create({
    data: {
      slug: `product-${uniq()}`,
      vendorId,
      categoryId,
      name: overrides.name ?? 'Mango thokku pickle',
      defaultWeightSku: sku,
      description: 'Slow-cooked in small batches.',
      moderationStatus: overrides.moderationStatus ?? 'active',
    },
  });
  await h.prisma.weightOption.create({
    data: {
      productId: product.id,
      sku,
      label: '250 g',
      price: overrides.price ?? 250,
      mrp: overrides.price ?? 250,
      stock: 100,
    },
  });
  return product;
}

/**
 * Approves a listing created through the seller API, the way an admin
 * would. Specs that create a listing and then assert it is *visible* need
 * this — since M22 a new listing is `pending`, so without it they are
 * asserting on something the platform has deliberately not published yet.
 */
export async function approveProduct(h: Harness, productId: string) {
  return h.prisma.product.update({
    where: { id: productId },
    data: { moderationStatus: 'active', moderatedAt: new Date() },
  });
}

export async function createAddress(h: Harness, userId: string) {
  return h.prisma.address.create({
    data: {
      userId,
      label: 'Home',
      recipientName: 'Test Buyer',
      phone: '9000000000',
      line1: 'House 1',
      city: 'Chandigarh',
      state: 'Chandigarh',
      pincode: '160034',
    },
  });
}

/**
 * An order in whatever state a test needs.
 *
 * `items` carries real `productId`s, because the rules under test —
 * review eligibility, seller scoping, revenue attribution — are all
 * expressed as "an order containing one of my products".
 */
export async function createOrder(
  h: Harness,
  opts: {
    userId: string;
    addressId: string;
    items: { productId: string; name: string; price: number; quantity?: number }[];
    status?: 'pending_payment' | 'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
    placedAt?: Date;
    deliveredAt?: Date | null;
    /** What placement credited back as cashback — cancellation has to take it away again. */
    cashbackEarned?: number;
  },
) {
  const subtotal = opts.items.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0);
  // `'deliveredAt' in opts`, not `??`: an explicit `null` means "this row
  // predates the column", which is a case the return window has to handle
  // — and `??` would quietly replace it with a fresh timestamp.
  const deliveredAt =
    'deliveredAt' in opts ? opts.deliveredAt : opts.status === 'delivered' ? new Date() : null;
  const sku = `sku-${uniq()}`;
  return h.prisma.order.create({
    data: {
      orderNumber: `HK-${uniq().toUpperCase()}`,
      userId: opts.userId,
      status: opts.status ?? 'placed',
      placedAt: opts.placedAt ?? new Date(),
      deliveredAt,
      subtotal,
      total: subtotal,
      cashbackEarned: opts.cashbackEarned ?? 0,
      paymentMethod: 'wallet',
      shippingAddressIds: [opts.addressId],
      items: {
        create: opts.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity ?? 1,
          price: i.price,
          addressId: opts.addressId,
          sku,
        })),
      },
    },
    include: { items: true },
  });
}
