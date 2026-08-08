/**
 * Bulk marketplace orders, so `/admin/orders` has more than one page.
 *
 *   npx ts-node prisma/seed-browser-orders.ts
 *
 * **Why this exists.** `e2e/tests/audit-regressions.spec.ts` has a test —
 * "search reaches an order that is not on the first page" — that guards a
 * real bug: admin order search used to be a client-side filter over the
 * page you were already looking at, so an order buried on page 2 answered
 * "no orders match". Proving that requires a page 2.
 *
 * The documented demo dataset cannot produce one. `seed.ts` + the laundry
 * bookings + the snack orders come to **21** rows, and
 * `DEFAULT_ORDER_PAGE_SIZE` is **25** — so the pager reads "Page 1 of 1"
 * and the test times out waiting for a "Next" that is correctly absent.
 * It went unnoticed because the CI browser job never booted its API (it
 * set `JWT_SECRET` where `env.validation.ts` requires `JWT_ACCESS_SECRET`),
 * so this suite has not run in CI since it was written.
 *
 * **Kept out of `seed.ts` deliberately.** Those 20 rows would land in every
 * demo account's order history, every screenshot and every tester's
 * `/account/orders` — noise, to make one test's precondition true. This is
 * opt-in: the browser stack runs it, the demo stack does not.
 *
 * Idempotent: it removes its own rows (`ord-bulk-*`) and re-creates them,
 * and it touches nothing it did not create. Safe to run twice; **not**
 * intended for production, where it would put 20 fake orders in a real
 * person's history.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 20 puts the three sources at 41 against a page size of 25 — comfortably
 * two pages, and still two pages if a later seed adds or drops a handful.
 * A count that only just clears the boundary is a test that breaks the
 * next time anybody edits `seed.ts`.
 */
const COUNT = 20;

async function main() {
  const consumer = await prisma.user.findFirst({
    where: { email: 'ananya.iyer@example.com' },
    select: { id: true },
  });
  if (!consumer) {
    throw new Error('Demo shopper not found — run `npx ts-node prisma/seed.ts` first.');
  }

  const address = await prisma.address.findFirst({
    where: { userId: consumer.id },
    select: { id: true },
  });
  if (!address) throw new Error('Demo shopper has no address — re-run prisma/seed.ts.');

  // Price lives on `WeightOption`, not on `Product` — a listing is priced
  // per SKU. Take the product's default one so the row reads like a real
  // order rather than one for a weight nobody sells.
  const product = await prisma.product.findFirst({
    where: { moderationStatus: 'active' },
    select: { id: true, name: true, defaultWeightSku: true },
  });
  if (!product) throw new Error('No active product to order — re-run prisma/seed.ts.');

  const weight = await prisma.weightOption.findUnique({
    where: { sku: product.defaultWeightSku },
    select: { sku: true, price: true },
  });
  if (!weight) throw new Error(`No WeightOption for ${product.defaultWeightSku}.`);

  // Its own rows only. `deleteMany` on the whole table is what `seed.ts`
  // does, and doing it here would silently wipe the demo order history
  // this file is supposed to sit alongside.
  const mine = await prisma.order.findMany({
    where: { id: { startsWith: 'ord-bulk-' } },
    select: { id: true },
  });
  if (mine.length) {
    const ids = mine.map((o) => o.id);
    await prisma.orderShipment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }

  const unitPrice = Number(weight.price);

  for (let i = 0; i < COUNT; i += 1) {
    const n = String(i + 1).padStart(3, '0');
    const subtotal = unitPrice;

    await prisma.order.create({
      data: {
        id: `ord-bulk-${n}`,
        // A distinct prefix so a human reading the queue can tell bulk
        // filler from the hand-written demo orders at a glance.
        orderNumber: `HKB${n}`,
        userId: consumer.id,
        status: 'delivered',
        shippingAddressIds: [address.id],
        // Spread backwards a day apart so the list has a real ordering to
        // page through rather than 20 rows sharing one timestamp.
        placedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        deliveredAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        subtotal,
        shippingFee: 0,
        total: subtotal,
        walletApplied: 0,
        cashbackEarned: 0,
        paymentMethod: 'razorpay',
        items: {
          create: [
            {
              productId: product.id,
              sku: weight.sku,
              name: product.name,
              quantity: 1,
              price: unitPrice,
              addressId: address.id,
              giftWrap: false,
            },
          ],
        },
        shipments: { create: [{ addressId: address.id, deliveryDate: new Date() }] },
      },
    });
  }

  const total = await prisma.order.count();
  console.log(`Done. ${COUNT} bulk orders (HKB001–HKB${String(COUNT).padStart(3, '0')}).`);
  console.log(`Orders now: ${total}. Admin page size is 25 — the queue should span 2 pages.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
