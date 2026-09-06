import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createAddress,
  createCategory,
  createHarness,
  createKitchen,
  createOrder,
  createProduct,
  resetDatabase,
} from './harness';

/**
 * The commission engine, transparency-first (M37).
 *
 * `commissionEnabled` defaults **off** — flipping it is a business
 * decision, not a code change. While off, payouts stay gross and every
 * figure is an estimate at the configured rate; while on, the split is
 * computed once at request time and stored on the row, so every payout
 * explains its own arithmetic forever. The mixed-era case is the one
 * that bites: pre-M37 rows have `amount` = gross and null columns, and
 * un-requested earnings must subtract `COALESCE(grossAmount, amount)` or
 * enabling the flag double-counts the deducted commission and re-offers
 * it as payable.
 */
describe('payout commission engine', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
  });

  /** A HomeKrafter with ₹`amount` of delivered earnings behind them. */
  async function kitchenWithEarnings(amount = 4500) {
    const { vendor, seller } = await createKitchen(h);
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id, { price: amount });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price: amount }],
      status: 'delivered',
    });
    return { seller, sellerActor };
  }

  const setCommission = async (patch: { commissionEnabled?: boolean; commissionPct?: number }) => {
    const admin = await createActor(h, 'admin');
    await h.api().patch(`${API_PREFIX}/admin/settings`).set(auth(admin)).send(patch).expect(200);
    return admin;
  };

  const request = (actor: Actor) =>
    h.api().post(`${API_PREFIX}/seller/payouts/request`).set(auth(actor));

  it('flag off (the default): payout is gross, and the row records that nothing was applied', async () => {
    const { sellerActor } = await kitchenWithEarnings(4500);

    const res = await request(sellerActor).expect(201);
    expect(res.body.amount).toBe(4500);
    expect(res.body.grossAmount).toBe(4500);
    expect(res.body.commissionAmount).toBe(0);
    expect(res.body.commissionPct).toBe(0);
    // No fee, so no tax on the fee — and the *applied* GST rate records
    // as 0 for the same reason the commission rate does: a disabled era
    // must never read as "18% was decided and came to nothing".
    expect(res.body.gstAmount).toBe(0);
    expect(res.body.gstPct).toBe(0);
  });

  it('flag on: the split is stored on the row and amount is net', async () => {
    await setCommission({ commissionEnabled: true, commissionPct: 10 });
    const { sellerActor } = await kitchenWithEarnings(4500);

    const res = await request(sellerActor).expect(201);
    // ₹4500 gross − ₹450 fee − ₹81 GST on that fee = ₹3969 payable.
    // GST rides on the commission and never on the gross (2026-09-02),
    // which is why the ₹4500 the buyer paid is untouched by it.
    expect(res.body.amount).toBe(3969);
    expect(res.body.grossAmount).toBe(4500);
    expect(res.body.commissionAmount).toBe(450);
    expect(res.body.commissionPct).toBe(10);
    expect(res.body.gstAmount).toBe(81);
    expect(res.body.gstPct).toBe(18);
  });

  it('GET /seller/payouts carries the arithmetic in both modes', async () => {
    const { sellerActor } = await kitchenWithEarnings(1000);

    const off = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(sellerActor)).expect(200);
    expect(off.body.commission).toEqual({
      enabled: false,
      pct: 10,
      gstPct: 18,
      grossPending: 1000,
      // Both of these are the *estimate* at the configured rates while
      // the flag is off — the transparency promise is that a kitchen can
      // see the whole deduction before anybody flips it, tax included.
      commissionOnPending: 100,
      gstOnPending: 18,
      netPending: 882,
    });
    // While off, what a request would actually pay is gross.
    expect(off.body.pendingBalance).toBe(1000);

    await setCommission({ commissionEnabled: true });
    const on = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(sellerActor)).expect(200);
    expect(on.body.commission.enabled).toBe(true);
    expect(on.body.commission.gstOnPending).toBe(18);
    expect(on.body.pendingBalance).toBe(882);
  });

  it('/seller/me hands the form its rate — never hardcoded client-side', async () => {
    await setCommission({ commissionPct: 12.5 });
    const { sellerActor } = await kitchenWithEarnings(500);

    const res = await h.api().get(`${API_PREFIX}/seller/me`).set(auth(sellerActor)).expect(200);
    // The whole deduction, in one place. A screen that had the
    // commission rate and not the GST rate would quote a number that is
    // 18% of the fee wrong, which is worse than quoting none.
    expect(res.body.commission).toEqual({ pct: 12.5, enabled: false, gstPct: 18 });
  });

  it('mixed eras never double-count: a gross-era payout claims its gross, not its net', async () => {
    const { seller, sellerActor } = await kitchenWithEarnings(1000);

    // Era 1 (pre-M37 shape): a paid payout whose amount WAS the gross —
    // seeded raw, columns null, exactly as production rows look.
    await h.prisma.payout.create({
      data: {
        sellerId: seller.id,
        amount: 600,
        status: 'paid',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      },
    });

    await setCommission({ commissionEnabled: true, commissionPct: 10 });

    // ₹1000 earned − ₹600 already claimed (gross) = ₹400 gross pending →
    // ₹360 net. If the aggregate summed `amount` on M37 rows after a few
    // enabled-era payouts existed, the deducted commission would leak
    // back in as "unclaimed".
    const res = await request(sellerActor).expect(201);
    expect(res.body.grossAmount).toBe(400);
    // ₹400 − ₹40 fee − ₹7.20 GST = ₹352.80.
    expect(res.body.amount).toBe(352.8);

    // And after this net payout exists, nothing is left to claim.
    const after = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(sellerActor)).expect(200);
    expect(after.body.commission.grossPending).toBe(0);
    expect(after.body.pendingBalance).toBe(0);
  });

  it('the admin queue sees the split on new rows and no invented split on old ones', async () => {
    const { seller, sellerActor } = await kitchenWithEarnings(1000);
    await h.prisma.payout.create({
      data: {
        sellerId: seller.id,
        amount: 250,
        status: 'paid',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      },
    });
    const admin = await setCommission({ commissionEnabled: true, commissionPct: 10 });
    await request(sellerActor).expect(201);

    const res = await h.api().get(`${API_PREFIX}/admin/payouts`).set(auth(admin)).expect(200);
    const rows = res.body.items as {
      amount: number;
      grossAmount?: number;
      commissionAmount?: number;
    }[];
    const newRow = rows.find((r) => r.grossAmount !== undefined)!;
    expect(newRow.grossAmount).toBe(750);
    // ₹750 − ₹75 fee − ₹13.50 GST = ₹661.50.
    expect(newRow.amount).toBe(661.5);
    expect(newRow.commissionAmount).toBe(75);
    const oldRow = rows.find((r) => r.amount === 250)!;
    expect(oldRow.grossAmount).toBeUndefined();
    expect(oldRow.commissionAmount).toBeUndefined();
  });
});
