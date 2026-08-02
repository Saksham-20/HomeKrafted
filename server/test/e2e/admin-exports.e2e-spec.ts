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
 * CSV exports, end to end.
 *
 * `csv.spec.ts` pins down the escaping function; this checks that the
 * function is actually *reached* by a real export of real rows, and that
 * the response is a file rather than JSON someone has to turn into one.
 * The two halves matter separately: a perfectly correct `csvCell` helps
 * nobody if one column is interpolated directly into the line.
 *
 * The attack being prevented is invisible in the product. A HomeKrafter
 * naming their shop `=cmd|'/c calc'!A1` sees a normal shop name on every
 * screen; the payload only fires on the machine of whoever opens the
 * export.
 */
describe('admin CSV exports', () => {
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

  const download = (actor: Actor, kind: string, query = '') =>
    h.api().get(`${API_PREFIX}/admin/exports/${kind}${query}`).set(auth(actor));

  describe('the file itself', () => {
    it('comes back as a download, not as JSON', async () => {
      // An accountant asking for "last quarter's orders" should be able to
      // be sent a URL.
      const res = await download(admin, 'orders').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=".*\.csv"/);
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    it('starts with a BOM so Excel reads the UTF-8 in a name', async () => {
      const res = await download(admin, 'sellers').expect(200);
      expect(res.text.charCodeAt(0)).toBe(0xfeff);
    });

    it('uses CRLF line endings', async () => {
      const res = await download(admin, 'sellers').expect(200);
      expect(res.text).toContain('\r\n');
    });

    it('accepts the .csv suffix as well as the bare kind', async () => {
      await download(admin, 'payouts.csv').expect(200);
      await download(admin, 'payouts').expect(200);
    });

    it('returns a header row rather than an empty file when there is nothing to export', async () => {
      // An empty file reads as a failed export; a header row reads as "no
      // payouts in that window", which is the truth.
      const res = await download(admin, 'payouts').expect(200);
      expect(res.text).toContain('Payout ID');
      expect(res.text.trim().split('\r\n')).toHaveLength(1);
    });
  });

  describe('formula injection', () => {
    it('neutralises a shop name that is a spreadsheet formula', async () => {
      await createKitchen(h, { name: `=cmd|'/c calc'!A1` });

      const res = await download(admin, 'sellers').expect(200);
      expect(res.text).toContain(`"'=cmd|'/c calc'!A1"`);
      // The unguarded form must not appear anywhere: that is the string a
      // spreadsheet would evaluate.
      expect(res.text).not.toContain(`"=cmd`);
    });

    it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('guards a name beginning %s', async (name) => {
      await createKitchen(h, { name });
      const res = await download(admin, 'sellers').expect(200);
      expect(res.text).toContain(`"'${name}"`);
    });

    it('leaves an ordinary name untouched', async () => {
      // Over-escaping would put a stray quote in front of every real name.
      await createKitchen(h, { name: "Sunita's Kitchen" });
      const res = await download(admin, 'sellers').expect(200);
      expect(res.text).toContain(`"Sunita's Kitchen"`);
      expect(res.text).not.toContain(`"'Sunita`);
    });

    it('keeps a comma inside a name inside its own cell', async () => {
      await createKitchen(h, { name: 'Pickles, Jams & More' });
      const res = await download(admin, 'sellers').expect(200);
      expect(res.text).toContain('"Pickles, Jams & More"');
      // One data row, so the comma did not split it into two.
      expect(res.text.trim().split('\r\n')).toHaveLength(2);
    });

    it('doubles a quote inside a name rather than ending the cell', async () => {
      await createKitchen(h, { name: 'The "Best" Kitchen' });
      const res = await download(admin, 'sellers').expect(200);
      expect(res.text).toContain('"The ""Best"" Kitchen"');
      expect(res.text.trim().split('\r\n')).toHaveLength(2);
    });
  });

  describe('who can export', () => {
    it.each(['orders', 'sellers', 'payouts'])('refuses a consumer the %s export', async (kind) => {
      // These sheets carry every buyer's name and every HomeKrafter's
      // email and phone in one file.
      const buyer = await createActor(h);
      await download(buyer, kind).expect(403);
    });

    it('refuses a HomeKrafter, who would otherwise get every rival\'s numbers', async () => {
      const kitchen = await createKitchen(h);
      const seller = await createActor(h, 'seller', { sellerId: kitchen.seller.id });
      await download(seller, 'sellers').expect(403);
    });

    it('refuses an anonymous caller', async () => {
      await h.api().get(`${API_PREFIX}/admin/exports/sellers`).expect(401);
    });
  });
});
