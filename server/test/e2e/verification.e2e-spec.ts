import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createHarness,
  createKitchen,
  errorOf,
  resetDatabase,
} from './harness';

/**
 * **The badge is the product.**
 *
 * A buyer ordering food from a stranger's kitchen is trusting a badge they
 * cannot check themselves, so the entire value of "FSSAI registered" rests
 * on one property: a HomeKrafter cannot grant it to themselves. That is
 * enforced by *absence* — the three verification flags are simply not on
 * `UpdateSellerProfileDto`, and the global `ValidationPipe`'s
 * `forbidNonWhitelisted` turns an attempt into a 400.
 *
 * Enforcement-by-absence is exactly the kind that gets undone by accident:
 * adding the fields "for convenience", or relaxing the pipe, would break
 * it with no error and no failing type. Hence these tests.
 */
describe('HomeKrafter verification', () => {
  let h: Harness;
  let seller: Actor;
  let admin: Actor;
  let sellerId: string;
  let vendorSlug: string;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    const kitchen = await createKitchen(h);
    sellerId = kitchen.seller.id;
    vendorSlug = kitchen.vendor.slug;
    seller = await createActor(h, 'seller', { sellerId });
    admin = await createActor(h, 'admin');
  });

  const patchProfile = (actor: Actor, body: object) =>
    h.api().patch(`${API_PREFIX}/seller/profile`).set(auth(actor)).send(body);

  const setVerification = (actor: Actor, id: string, body: object) =>
    h.api().patch(`${API_PREFIX}/admin/sellers/${id}/verification`).set(auth(actor)).send(body);

  const publicProfile = () => h.api().get(`${API_PREFIX}/vendors/${vendorSlug}/profile`);

  describe('a seller cannot verify themselves', () => {
    it.each(['fssaiVerified', 'identityVerified', 'addressVerified'])(
      'rejects an attempt to set %s outright, rather than silently stripping it',
      async (field) => {
        // A silent strip would be far worse than a 400: the seller would
        // see a success, and only a buyer would ever notice the badge
        // never appeared.
        const res = await patchProfile(seller, { [field]: true }).expect(400);
        expect(errorOf(res).message).toMatch(new RegExp(field, 'i'));

        const profile = await h.prisma.vendorProfile.findFirst();
        expect(profile?.[field as 'fssaiVerified'] ?? false).toBe(false);
      },
    );

    it('rejects the whole request when a forbidden field rides along with legitimate ones', async () => {
      // All-or-nothing. Accepting the valid half would let an attacker
      // learn exactly which field was dropped, and would half-apply an
      // edit the seller thinks succeeded entirely.
      await patchProfile(seller, {
        tagline: 'Pickles from Sector 34',
        fssaiVerified: true,
      }).expect(400);
      expect(await h.prisma.vendorProfile.count()).toBe(0);
    });

    it('accepts the same edit without the forbidden field', async () => {
      await patchProfile(seller, { tagline: 'Pickles from Sector 34' }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.tagline).toBe('Pickles from Sector 34');
    });

    it('refuses a seller reaching for the admin route directly', async () => {
      await setVerification(seller, sellerId, { fssaiVerified: true }).expect(403);
    });

    it('refuses an ordinary buyer, and an anonymous caller', async () => {
      const buyer = await createActor(h);
      await setVerification(buyer, sellerId, { fssaiVerified: true }).expect(403);
      await h
        .api()
        .patch(`${API_PREFIX}/admin/sellers/${sellerId}/verification`)
        .send({ fssaiVerified: true })
        .expect(401);
    });
  });

  describe('the admin write path', () => {
    it('grants the badge and stamps when it happened', async () => {
      await setVerification(admin, sellerId, { fssaiVerified: true, note: 'Licence checked' }).expect(200);
      const profile = await h.prisma.vendorProfile.findFirst();
      expect(profile?.fssaiVerified).toBe(true);
      expect(profile?.verifiedAt).toBeInstanceOf(Date);
      expect(profile?.verificationNote).toBe('Licence checked');
    });

    it('verifies one thing at a time without clearing the others', async () => {
      // An admin checks identity today and the licence next week. A patch
      // that reset the untouched flags would make the second check undo
      // the first.
      await setVerification(admin, sellerId, { identityVerified: true }).expect(200);
      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);
      const profile = await h.prisma.vendorProfile.findFirst();
      expect(profile?.identityVerified).toBe(true);
      expect(profile?.fssaiVerified).toBe(true);
    });

    it('can withdraw a badge as well as grant one', async () => {
      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);
      await setVerification(admin, sellerId, { fssaiVerified: false, note: 'Licence lapsed' }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.fssaiVerified).toBe(false);
    });

    it('audits the change with its before and after state', async () => {
      // "Who verified this kitchen, and on what basis" has to be
      // answerable after the fact — including when the answer is that
      // nobody should have.
      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);
      const entry = await h.prisma.adminAuditLog.findFirst({
        where: { targetType: 'Seller', targetId: sellerId },
      });
      expect(entry).toBeTruthy();
      expect(entry!.actorId).toBe(admin.userId);
      expect(JSON.stringify(entry!.metadata)).toMatch(/before/);
      expect(JSON.stringify(entry!.metadata)).toMatch(/after/);
    });

    it('404s for a seller that does not exist', async () => {
      await setVerification(admin, 'no-such-seller', { fssaiVerified: true }).expect(404);
    });
  });

  describe('editing the thing being verified', () => {
    it('clears the badge when the FSSAI number changes', async () => {
      // Otherwise editing the licence number preserves the badge that
      // verified the old one — the single most valuable edit an
      // unscrupulous seller could make.
      await patchProfile(seller, { fssaiNumber: '11111111111111' }).expect(200);
      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.fssaiVerified).toBe(true);

      await patchProfile(seller, { fssaiNumber: '22222222222222' }).expect(200);

      const after = await h.prisma.vendorProfile.findFirst();
      expect(after!.fssaiVerified).toBe(false);
      expect(after!.verifiedAt).toBeNull();
      expect(after!.verificationNote).toBeNull();
    });

    it('keeps the badge when the number is resubmitted unchanged', async () => {
      // Saving the profile form without touching the licence field is the
      // common case, and clearing on every save would make the badge
      // unkeepable.
      await patchProfile(seller, { fssaiNumber: '11111111111111' }).expect(200);
      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);

      await patchProfile(seller, { fssaiNumber: '11111111111111', tagline: 'New tagline' }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.fssaiVerified).toBe(true);
    });

    it('keeps the badge when an unrelated field changes', async () => {
      await patchProfile(seller, { fssaiNumber: '11111111111111' }).expect(200);
      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);

      await patchProfile(seller, { story: 'I started cooking in 2019.' }).expect(200);
      expect((await h.prisma.vendorProfile.findFirst())?.fssaiVerified).toBe(true);
    });
  });

  describe('what the buyer is shown', () => {
    beforeEach(async () => {
      await patchProfile(seller, {
        fssaiNumber: '12345678901234',
        tagline: 'Pickles from Sector 34',
      }).expect(200);
    });

    it('never publishes the licence number, verified or not', async () => {
      // The buyer needs the verified *fact*. The identifier itself belongs
      // to the HomeKrafter, and publishing it on a scrapeable page buys
      // the buyer nothing the badge does not.
      const claimed = await publicProfile().expect(200);
      expect(JSON.stringify(claimed.body)).not.toContain('12345678901234');

      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);
      const verified = await publicProfile().expect(200);
      expect(JSON.stringify(verified.body)).not.toContain('12345678901234');
      expect(verified.body.fssaiVerified).toBe(true);
    });

    it('shows the seller their own submitted number', async () => {
      const own = await h.api().get(`${API_PREFIX}/seller/profile`).set(auth(seller)).expect(200);
      expect(own.body.fssaiNumber).toBe('12345678901234');
    });

    it('shows a submitted-but-unchecked licence as a claim, not a badge', async () => {
      const res = await publicProfile().expect(200);
      const fssai = res.body.trust.signals.find((s: { key: string }) => s.key === 'fssai');
      expect(res.body.fssaiVerified).toBe(false);
      expect(fssai.earned).toBe(false);
      expect(fssai.detail).toMatch(/awaiting/i);
    });

    it('moves the trust score when a badge is granted, and back when withdrawn', async () => {
      const before = (await publicProfile().expect(200)).body.trust;

      await setVerification(admin, sellerId, { fssaiVerified: true }).expect(200);
      const granted = (await publicProfile().expect(200)).body.trust;
      expect(granted.score).toBe(before.score + 20);

      await setVerification(admin, sellerId, { fssaiVerified: false }).expect(200);
      const withdrawn = (await publicProfile().expect(200)).body.trust;
      // Computed on read, so a withdrawal takes effect immediately rather
      // than waiting for something to recompute a stored number.
      expect(withdrawn.score).toBe(before.score);
    });

    it('renders every signal, met and unmet, rather than a bare number', async () => {
      const res = await publicProfile().expect(200);
      expect(res.body.trust.signals.length).toBeGreaterThanOrEqual(7);
      expect(res.body.trust.signals.every((s: { detail: string }) => s.detail.length > 0)).toBe(true);
      expect(res.body.trust.tier).toBeDefined();
    });

    it('renders a kitchen with no profile at all as an empty profile, not a 404', async () => {
      // A kitchen approved this morning is the normal case.
      const fresh = await createKitchen(h, { name: 'Brand New' });
      const res = await h.api().get(`${API_PREFIX}/vendors/${fresh.vendor.slug}/profile`).expect(200);
      expect(res.body.trust.tier).toBe('new');
      expect(res.body.stats.cancellationRate).toBeNull();
      expect(res.body.photos).toEqual([]);
    });
  });
});
