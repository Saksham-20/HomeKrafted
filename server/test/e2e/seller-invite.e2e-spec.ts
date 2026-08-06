import { API_PREFIX, Actor, Harness, auth, createActor, createHarness, resetDatabase } from './harness';

/**
 * Approval has to hand over a way in.
 *
 * Until M21 it did not. `approveApplication` minted the account with
 * `authProviders: ['phone']` and no credential, then posted a welcome
 * notification saying "add your first items from the Listings tab" — into
 * the **in-app inbox, which sits behind the login that account cannot
 * pass**. Phone OTP was the only route, and with Twilio unset a real OTP
 * reaches the server log and nowhere else. `CLAUDE.md` carried this as the
 * standing blocker capping supply growth, and `seller-onboarding.e2e-spec`
 * asserted the lockout as *by design* without anything closing it.
 *
 * The e2e environment pins every provider to its stub (`test/e2e/env.ts`),
 * which is exactly the condition these specs need: a stubbed send is a
 * send that did not happen, and the whole point is that the system says so
 * instead of reporting success.
 */
describe('approval hands the HomeKrafter a way in', () => {
  let h: Harness;
  let admin: Actor;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    admin = await createActor(h, 'admin');
  });

  async function apply(overrides: { email?: string; phone?: string } = {}) {
    return h.prisma.sellerApplication.create({
      data: {
        businessName: "Candle & Clay",
        contactName: 'New Maker',
        email: overrides.email ?? 'newmaker@example.test',
        phone: overrides.phone ?? '+919000111444',
        category: 'maker',
        specialties: ['crafts'],
        city: 'Chandigarh',
        area: 'chd-sector-34',
        deliveryRadiusKm: 10,
        description: 'Hand-poured soy candles and small stoneware.',
        status: 'new',
      },
    });
  }

  const approve = (id: string) =>
    h.api().post(`${API_PREFIX}/admin/sellers/applications/${id}/approve`).set(auth(admin)).send({});

  it('mints a single-use invite token the new HomeKrafter can set a password with', async () => {
    const application = await apply();
    const res = await approve(application.id).expect(201);

    const user = await h.prisma.user.findUniqueOrThrow({ where: { email: application.email } });
    const tokens = await h.prisma.passwordResetToken.findMany({ where: { userId: user.id } });

    expect(tokens).toHaveLength(1);
    expect(tokens[0].consumedAt).toBeNull();
    // Hashed at rest — the raw token exists only inside the message sent.
    expect(tokens[0].tokenHash).not.toContain(res.body.invite?.fallbackLink ?? 'no-link');
    expect(tokens[0].tokenHash).toHaveLength(64);
  });

  it('gives the invite a week, not the reset flow’s hour', async () => {
    // An admin clicks approve on a weekday afternoon; the person receiving
    // it may be cooking. An hour would mean most invites die unread.
    const application = await apply();
    await approve(application.id).expect(201);

    const user = await h.prisma.user.findUniqueOrThrow({ where: { email: application.email } });
    const token = await h.prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });

    const daysOut = (token.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(6);
    expect(daysOut).toBeLessThanOrEqual(7);
  });

  it('says out loud that nobody was reached when the providers are stubs', async () => {
    // The failure that used to pass silently. In this environment both
    // providers are placeholders, so nothing leaves the building — and the
    // admin has to be told, because that person cannot sign in until
    // somebody hands them the link.
    const application = await apply();
    const res = await approve(application.id).expect(201);

    expect(res.body.invite.reached).toBe(false);
    expect(res.body.invite.email.attempted).toBe(true);
    expect(res.body.invite.email.stubbed).toBe(true);
    expect(res.body.invite.sms.attempted).toBe(true);
    expect(res.body.invite.sms.stubbed).toBe(true);
    // The link comes back only in this case, so an admin can pass it on.
    expect(res.body.invite.fallbackLink).toContain('/reset-password?token=');
    expect(res.body.invite.fallbackLink).toContain('welcome=1');
  });

  it('never writes the invite link into the audit log', async () => {
    // It is a live single-use credential, and the audit log is read by
    // more people than the one it belongs to. Whether they were *reached*
    // is the part that belongs on the record.
    const application = await apply();
    await approve(application.id).expect(201);

    const entry = await h.prisma.adminAuditLog.findFirstOrThrow({
      where: { action: 'seller_application.approve' },
    });
    const metadata = JSON.stringify(entry.metadata);
    expect(metadata).not.toContain('reset-password');
    expect(metadata).not.toContain('token=');
    expect(metadata).toContain('inviteReached');
  });

  it('lets the invite actually set a password, which is the whole point', async () => {
    // End to end: approve → take the token out of the invite link → set a
    // password → sign in with email and password. This is the path that
    // did not exist.
    const application = await apply();
    const res = await approve(application.id).expect(201);
    const token = new URL(res.body.invite.fallbackLink).searchParams.get('token');

    await h
      .api()
      .post(`${API_PREFIX}/auth/password/reset`)
      .send({ token, password: 'a-real-password-123' })
      .expect(200);

    const signedIn = await h
      .api()
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: application.email, password: 'a-real-password-123' })
      .expect(200);

    expect(signedIn.body.user.role).toBe('seller');

    // `email` joined `authProviders` — the account no longer claims to be
    // phone-only, which is what `resetPassword` already handled and what
    // makes this the right mechanism to have reused.
    const user = await h.prisma.user.findUniqueOrThrow({ where: { email: application.email } });
    expect(user.authProviders).toContain('email');
    expect(user.passwordHash).not.toBeNull();
  });

  it('burns the invite once used', async () => {
    const application = await apply();
    const res = await approve(application.id).expect(201);
    const token = new URL(res.body.invite.fallbackLink).searchParams.get('token');

    await h
      .api()
      .post(`${API_PREFIX}/auth/password/reset`)
      .send({ token, password: 'a-real-password-123' })
      .expect(200);

    // A forwarded email must not open the account a second time.
    await h
      .api()
      .post(`${API_PREFIX}/auth/password/reset`)
      .send({ token, password: 'someone-elses-password-123' })
      .expect(401);
  });

  it('refuses a duplicate application instead of throwing a 500', async () => {
    // Found by this spec. `Seller.userId` is unique, so approving a second
    // application from an address that already has an account hit a raw
    // unique violation inside the transaction and the admin got a 500 with
    // nothing actionable in it. Reachable without doing anything strange:
    // an applicant who does not hear back applies again, and both rows sit
    // in the queue.
    const first = await apply({ email: 'twice@example.test', phone: '+919000111555' });
    await approve(first.id).expect(201);

    const second = await apply({ email: 'twice@example.test', phone: '+919000111555' });
    const res = await approve(second.id).expect(409);
    expect(res.body.error.message).toMatch(/already has a HomeKrafter account/i);
  });

  it('re-sends the invite, and the previous link stops working', async () => {
    // The remedy for "the approval email never arrived" — otherwise
    // unfixable, now that a duplicate application is correctly refused.
    const application = await apply();
    const approved = await approve(application.id).expect(201);
    const firstToken = new URL(approved.body.invite.fallbackLink).searchParams.get('token');
    const sellerId = approved.body.seller.id;

    const resent = await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/${sellerId}/resend-invite`)
      .set(auth(admin))
      .send({})
      .expect(201);

    const secondToken = new URL(resent.body.invite.fallbackLink).searchParams.get('token');
    expect(secondToken).not.toBe(firstToken);

    // Exactly one live invite — a re-send must not leave the older link
    // alive, or a forwarded message still opens the account.
    const user = await h.prisma.user.findUniqueOrThrow({ where: { email: application.email } });
    const live = await h.prisma.passwordResetToken.findMany({
      where: { userId: user.id, consumedAt: null },
    });
    expect(live).toHaveLength(1);

    await h
      .api()
      .post(`${API_PREFIX}/auth/password/reset`)
      .send({ token: firstToken, password: 'stale-link-password-123' })
      .expect(401);
    await h
      .api()
      .post(`${API_PREFIX}/auth/password/reset`)
      .send({ token: secondToken, password: 'fresh-link-password-123' })
      .expect(200);
  });

  it('will not re-send a sign-in link to a suspended account', async () => {
    // Same rule `forgotPassword` already applies: a reset must not be a
    // way back in for an account an admin has closed.
    const application = await apply();
    const approved = await approve(application.id).expect(201);
    await h.prisma.seller.update({
      where: { id: approved.body.seller.id },
      data: { user: { update: { suspended: true } } },
    });

    await h
      .api()
      .post(`${API_PREFIX}/admin/sellers/${approved.body.seller.id}/resend-invite`)
      .set(auth(admin))
      .send({})
      .expect(409);
  });

  it('still posts the in-app welcome, as the second copy rather than the only one', async () => {
    const application = await apply();
    await approve(application.id).expect(201);

    const user = await h.prisma.user.findUniqueOrThrow({ where: { email: application.email } });
    const notifications = await h.prisma.notification.findMany({ where: { userId: user.id } });
    expect(notifications.some((n) => n.title === 'You are a HomeKrafter')).toBe(true);
  });
});
