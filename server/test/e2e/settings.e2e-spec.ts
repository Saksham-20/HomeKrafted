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
 * Platform settings, and the public subset behind the runtime feature
 * flags (M17).
 *
 * The rule worth guarding hardest is the **allowlist**:
 * `GET /settings/public` is unauthenticated, so it is built by picking
 * keys rather than by deleting them. A denylist would leak the next
 * setting somebody adds and forgets about — and the setting sitting next
 * to the flag is the commission rate, a commercial term.
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
      // The root layout reads it on every render, including for a visitor
      // who has never signed in.
      const res = await publicSettings().expect(200);
      expect(res.body).toEqual({ hamperBuilderEnabled: false });
    });

    it('never publishes the commission rate or the delivery radius', async () => {
      await update(admin, { commissionPct: 17, defaultDeliveryRadiusKm: 22 }).expect(200);
      const res = await publicSettings().expect(200);

      expect(res.body).not.toHaveProperty('commissionPct');
      expect(res.body).not.toHaveProperty('defaultDeliveryRadiusKm');
      // Belt and braces: the values themselves must not appear anywhere in
      // the payload under any key.
      expect(JSON.stringify(res.body)).not.toContain('17');
      expect(JSON.stringify(res.body)).not.toContain('22');
    });

    it('exposes exactly one key, so a new private setting cannot leak by default', async () => {
      expect(Object.keys((await publicSettings().expect(200)).body)).toEqual([
        'hamperBuilderEnabled',
      ]);
    });
  });

  describe('flipping a feature flag', () => {
    it('takes effect on the public endpoint immediately', async () => {
      await update(admin, { hamperBuilderEnabled: true }).expect(200);
      expect((await publicSettings().expect(200)).body.hamperBuilderEnabled).toBe(true);

      await update(admin, { hamperBuilderEnabled: false }).expect(200);
      expect((await publicSettings().expect(200)).body.hamperBuilderEnabled).toBe(false);
    });

    it('is held by default, so an empty settings table ships nothing', async () => {
      // The safe direction. A flag that fails open is a flag that ships
      // itself during an outage or a fresh deploy.
      expect(await h.prisma.platformSetting.count()).toBe(0);
      expect((await publicSettings().expect(200)).body.hamperBuilderEnabled).toBe(false);
    });

    it('stays held for any stored value that is not exactly "true"', async () => {
      // A hand-edited row, a typo, a `'yes'`. Strict on the enabling side.
      for (const value of ['yes', 'TRUE', '1', 'on', '']) {
        await h.prisma.platformSetting.upsert({
          where: { key: 'hamperBuilderEnabled' },
          create: { key: 'hamperBuilderEnabled', value, updatedBy: admin.userId },
          update: { value },
        });
        expect((await publicSettings().expect(200)).body.hamperBuilderEnabled).toBe(false);
      }
    });

    it('rejects an ambiguous value rather than coercing it', async () => {
      // `'true'` and `'false'` are accepted spellings (see
      // `BooleanField`); anything else is a guess this refuses to make.
      await update(admin, { hamperBuilderEnabled: 'yes' }).expect(400);
      await update(admin, { hamperBuilderEnabled: 1 }).expect(400);
      expect((await publicSettings().expect(200)).body.hamperBuilderEnabled).toBe(false);
    });

    it('reads the string "false" as held, not as live', async () => {
      // The bug this endpoint would otherwise have shared with every
      // other boolean field — see `boolean-coercion.e2e-spec.ts`.
      await update(admin, { hamperBuilderEnabled: 'false' }).expect(200);
      expect((await publicSettings().expect(200)).body.hamperBuilderEnabled).toBe(false);
    });

    it('audits the flip with its before and after state', async () => {
      await update(admin, { hamperBuilderEnabled: true }).expect(200);
      const entry = await h.prisma.adminAuditLog.findFirst({
        where: { action: 'platform_settings.update' },
      });
      expect(entry!.actorId).toBe(admin.userId);
      expect(JSON.stringify(entry!.metadata)).toMatch(/hamperBuilderEnabled/);
    });
  });

  describe('the private settings', () => {
    it('reads back what was written', async () => {
      await update(admin, { commissionPct: 12.5, defaultDeliveryRadiusKm: 8 }).expect(200);
      const res = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(res.body.commissionPct).toBe(12.5);
      expect(res.body.defaultDeliveryRadiusKm).toBe(8);
    });

    it('leaves the other settings alone on a partial update', async () => {
      await update(admin, { commissionPct: 12, defaultDeliveryRadiusKm: 8 }).expect(200);
      await update(admin, { hamperBuilderEnabled: true }).expect(200);

      const res = await h.api().get(`${API_PREFIX}/admin/settings`).set(auth(admin)).expect(200);
      expect(res.body.commissionPct).toBe(12);
      expect(res.body.defaultDeliveryRadiusKm).toBe(8);
      expect(res.body.hamperBuilderEnabled).toBe(true);
    });

    it('rejects a commission outside 0–100', async () => {
      await update(admin, { commissionPct: 101 }).expect(400);
      await update(admin, { commissionPct: -1 }).expect(400);
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
