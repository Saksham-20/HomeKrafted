import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createHarness,
  createKitchen,
  resetDatabase,
} from './harness';

/**
 * Platform settings, and the public subset served unauthenticated.
 *
 * The rule worth guarding hardest is the **allowlist**:
 * `GET /settings/public` is unauthenticated, so it is built by picking
 * keys rather than by deleting them. A denylist would leak the next
 * setting somebody adds and forgets about — and the settings sitting
 * alongside are the commission rate, a commercial term, and the default
 * delivery radius.
 *
 * M18 emptied that allowlist: the hamper-builder flag was its only entry
 * and it left with the builder it gated. **These tests were kept and
 * rewritten rather than deleted.** The property they check — that nothing
 * private is reachable anonymously — is true at zero keys and is exactly
 * what needs to still be true when the next public setting is added; a
 * suite that only tested the flag would have been deleted along with it,
 * taking the guard with it.
 */
describe('platform settings', () => {
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

  const update = (actor: Actor, body: object) =>
    h.api().patch(`${API_PREFIX}/admin/settings`).set(auth(actor)).send(body);

  const publicSettings = () => h.api().get(`${API_PREFIX}/settings/public`);

  describe('the public subset', () => {
    it('is readable without signing in', async () => {
      await publicSettings().expect(200);
    });

    it('never publishes the commission rate or the delivery radius', async () => {
      await update(admin, { commissionPct: 17, defaultDeliveryRadiusKm: 22 }).expect(200);
      const res = await publicSettings().expect(200);

      expect(res.body).not.toHaveProperty('commissionPct');
      expect(res.body).not.toHaveProperty('commissionEnabled');
      expect(res.body).not.toHaveProperty('defaultDeliveryRadiusKm');
      // Belt and braces: the values themselves must not appear anywhere in
      // the payload under any key.
      expect(JSON.stringify(res.body)).not.toContain('17');
      expect(JSON.stringify(res.body)).not.toContain('22');
    });

    it('publishes nothing that was not explicitly allowlisted', async () => {
      // The allowlist is empty today, so the payload is empty. Written as
      // "every key present must be allowlisted" rather than `toEqual({})`,
      // so adding a legitimate public setting doesn't fail this test while
      // adding a private one still does.
      const { PUBLIC_SETTING_KEYS } = await import('../../src/admin/settings.service');
      const allowed = new Set<string>(PUBLIC_SETTING_KEYS);

      await update(admin, { commissionPct: 33, defaultDeliveryRadiusKm: 44 }).expect(200);
      for (const key of Object.keys((await publicSettings().expect(200)).body)) {
        expect(allowed.has(key)).toBe(true);
      }
    });

    it('stays readable when the settings table is completely empty', async () => {
      // The fresh-deploy case. Missing rows fall back to defaults rather
      // than erroring, so a database that has never had a setting written
      // behaves like the hardcoded constants this replaced.
      expect(await h.prisma.platformSetting.count()).toBe(0);
      await publicSettings().expect(200);
    });
  });

  describe('the private settings', () => {
    it('reads back what was written', async () => {
      await update(admin, { commissionPct: 12.5, defaultDeliveryRadiusKm: 8 }).expect(200);
      const res = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(res.body.commissionPct).toBe(12.5);
      expect(res.body.defaultDeliveryRadiusKm).toBe(8);
    });

    it('round-trips the menu lock time, defaulting to 20:00 (M37)', async () => {
      const before = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(before.body.menuLockTime).toBe('20:00');

      await update(admin, { menuLockTime: '18:30' }).expect(200);
      const after = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(after.body.menuLockTime).toBe('18:30');
    });

    it('round-trips commissionEnabled, defaulting to off (M37)', async () => {
      const before = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      // Off until an admin decides otherwise — flipping it is a business
      // decision, and the engine ships dark.
      expect(before.body.commissionEnabled).toBe(false);

      await update(admin, { commissionEnabled: true }).expect(200);
      const on = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(on.body.commissionEnabled).toBe(true);

      // The M17 boolean trap: `"false"` as a string must read as off, not
      // as a truthy non-empty string.
      await update(admin, { commissionEnabled: false }).expect(200);
      const off = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(off.body.commissionEnabled).toBe(false);
    });

    it('refuses a menu lock time that is not a 24-hour clock time', async () => {
      const res = await update(admin, { menuLockTime: '8pm' }).expect(400);
      expect(res.body.error.message).toContain('24-hour');
      // 25:99 parses the regex shape check but not the range.
      await update(admin, { menuLockTime: '25:99' }).expect(400);
    });

    it('leaves the other settings alone on a partial update', async () => {
      await update(admin, { commissionPct: 12, defaultDeliveryRadiusKm: 8 }).expect(200);
      await update(admin, { commissionPct: 15 }).expect(200);

      const res = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(res.body.commissionPct).toBe(15);
      // The one that would break: a partial PATCH must not reset the key
      // it didn't mention back to its default.
      expect(res.body.defaultDeliveryRadiusKm).toBe(8);
    });

    it('falls back to defaults for a setting never written', async () => {
      const res = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(res.body.commissionPct).toBe(10);
      expect(res.body.defaultDeliveryRadiusKm).toBe(10);
    });

    it('rejects a commission outside 0–100', async () => {
      // Over 100% would pay a HomeKrafter to sell nothing; negative is a
      // rebate. Neither is a setting, both are typos.
      await update(admin, { commissionPct: 101 }).expect(400);
      await update(admin, { commissionPct: -1 }).expect(400);
    });

    it('rejects an unknown key rather than silently ignoring it', async () => {
      // `forbidNonWhitelisted`. A settings PATCH that accepts a misspelled
      // key and returns 200 tells an admin their change took effect.
      await update(admin, { hamperBuilderEnabled: true }).expect(400);
      await update(admin, { commisionPct: 5 }).expect(400);
    });

    it('audits an update with its before and after state', async () => {
      await update(admin, { commissionPct: 14 }).expect(200);
      const entry = await h.prisma.adminAuditLog.findFirst({
        where: { action: 'platform_settings.update' },
      });
      expect(entry!.actorId).toBe(admin.userId);
      expect(JSON.stringify(entry!.metadata)).toMatch(/commissionPct/);
    });

    it('refuses a consumer and a HomeKrafter', async () => {
      const buyer = await createActor(h);
      const kitchen = await createKitchen(h);
      const seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });

      await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(buyer)).expect(403);
      await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(seller)).expect(403);
      await update(seller, { commissionPct: 0 }).expect(403);
    });
  });
});
