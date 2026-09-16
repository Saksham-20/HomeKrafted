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
 * The commission engine — the markup model (2026-09-16), which reverses
 * M37's deduction model for marketplace earnings specifically.
 *
 * **A marketplace `OrderItem` is paid in full, always.** Under the old
 * model a HomeKrafter typed the buyer's price and the platform took its
 * cut out of the payout; under this one the buyer pays the maker's price
 * *plus* the fee, so `sellerAmount` — the maker's own figure — is what a
 * payout owes, with no further deduction regardless of
 * `commissionEnabled`. A `sellerAmount IS NULL` row (seeded before this
 * migration, or by a test that doesn't pass one) reads the same way —
 * "fully payable" is `payout-split.ts`'s documented one-time transition
 * rule, not a bug: `price` on a row that old never carried a fee to begin
 * with.
 *
 * **Laundry and snack earnings were never migrated to markup pricing** —
 * they're still typed at the maker's sticker price with no fee embedded —
 * so `computePayoutSplit`'s deduction still applies to that combined
 * "legacy" total exactly as it did before this model existed. Every test
 * below that wants to see a real deduction uses a `SnackOrder`, not a
 * marketplace product.
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
    await resetDatabase(h);
  });

  /** A HomeKrafter with a pre-migration-shaped marketplace order behind them — no split columns, `price` read as the fee-free sticker it always was. */
  async function kitchenWithLegacyMarketplaceEarnings(price = 4500) {
    const { vendor, seller } = await createKitchen(h);
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    const category = await createCategory(h);
    const product = await createProduct(h, vendor.id, category.id, { price });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, price }],
      status: 'delivered',
    });
    return { seller, sellerActor };
  }

  /** A HomeKrafter with a post-migration marketplace order — the split already recorded on the line, exactly as `resolveCartLines`/`OrdersService.create` would write it. */
  async function kitchenWithMarkupMarketplaceEarnings(split: {
    price: number;
    sellerAmount: number;
    commissionAmount: number;
    gstAmount: number;
    commissionPct: number;
    gstPct: number;
  }) {
    const { vendor, seller } = await createKitchen(h);
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    const category = await createCategory(h);
    // The stored catalogue price is irrelevant here — the order line's
    // own recorded split is what a payout reads, never the live listing.
    const product = await createProduct(h, vendor.id, category.id, { price: split.price });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: product.id, name: product.name, ...split }],
      status: 'delivered',
    });
    return { seller, sellerActor };
  }

  /** A HomeKrafter with `total` of delivered WhatsApp snack earnings — the legacy stream `computePayoutSplit` still deducts from. */
  async function kitchenWithSnackEarnings(total = 1000) {
    const { seller } = await createKitchen(h);
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    await h.prisma.snackOrder.create({
      data: { sellerId: seller.id, customerName: 'A Buyer', customerPhone: '9000000000', total, status: 'delivered' },
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

  it('flag off: a legacy (pre-migration) marketplace order pays out gross, and the row records that nothing was applied', async () => {
    const { sellerActor } = await kitchenWithLegacyMarketplaceEarnings(4500);

    const res = await request(sellerActor).expect(201);
    expect(res.body.amount).toBe(4500);
    expect(res.body.grossAmount).toBe(4500);
    expect(res.body.commissionAmount).toBe(0);
    expect(res.body.commissionPct).toBe(0);
    expect(res.body.gstAmount).toBe(0);
    expect(res.body.gstPct).toBe(0);
  });

  it('flag on: a legacy (pre-migration) marketplace order STILL pays out in full — "fully payable" is the documented transition rule, not a bug', async () => {
    await setCommission({ commissionEnabled: true, commissionPct: 10 });
    const { sellerActor } = await kitchenWithLegacyMarketplaceEarnings(4500);

    const res = await request(sellerActor).expect(201);
    // Unlike the retired M37 deduction model, turning the flag on does
    // NOT touch a marketplace payout — the fee is either already embedded
    // in what the buyer paid (a post-migration row) or forgiven on
    // transition (this row). Never deducted a second time here.
    expect(res.body.amount).toBe(4500);
    expect(res.body.grossAmount).toBe(4500);
    expect(res.body.commissionAmount).toBe(0);
    expect(res.body.commissionPct).toBe(0);
  });

  it('a post-migration marketplace order pays out its recorded sellerAmount, never the buyer-facing price', async () => {
    await setCommission({ commissionEnabled: true, commissionPct: 10 });
    // ₹1000 base → ₹100 fee → ₹18 GST → buyer charged ₹1118 (recorded on
    // the line exactly as `resolveCartLines` would have computed it).
    const { sellerActor } = await kitchenWithMarkupMarketplaceEarnings({
      price: 1118,
      sellerAmount: 1000,
      commissionAmount: 100,
      gstAmount: 18,
      commissionPct: 10,
      gstPct: 18,
    });

    const res = await request(sellerActor).expect(201);
    // The maker's own figure, paid whole — not `price` (what the buyer
    // paid) and not `price` further reduced by a second deduction.
    expect(res.body.amount).toBe(1000);
    expect(res.body.grossAmount).toBe(1118);
    // No further commission is deducted from a payout for a marketplace
    // line — it was already collected from the buyer at checkout.
    expect(res.body.commissionAmount).toBe(0);
  });

  it('the legacy stream (snacks) is still deducted exactly as before this model existed', async () => {
    await setCommission({ commissionEnabled: true, commissionPct: 10 });
    const { sellerActor } = await kitchenWithSnackEarnings(1000);

    const res = await request(sellerActor).expect(201);
    // ₹1000 gross − ₹100 fee − ₹18 GST on that fee = ₹882 payable.
    expect(res.body.amount).toBe(882);
    expect(res.body.grossAmount).toBe(1000);
    expect(res.body.commissionAmount).toBe(100);
    expect(res.body.commissionPct).toBe(10);
    expect(res.body.gstAmount).toBe(18);
    expect(res.body.gstPct).toBe(18);
  });

  it('GET /seller/payouts carries the legacy-stream arithmetic in both modes, and never deducts the marketplace share', async () => {
    const { sellerActor } = await kitchenWithSnackEarnings(1000);

    const off = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(sellerActor)).expect(200);
    expect(off.body.commission).toEqual({
      enabled: false,
      pct: 10,
      gstPct: 18,
      grossPending: 1000,
      // The *estimate* at the configured rates while the flag is off —
      // the transparency promise is that a kitchen can see the whole
      // deduction before anybody flips it, tax included.
      commissionOnPending: 100,
      gstOnPending: 18,
      netPending: 882,
      // No marketplace earnings in this fixture — nothing was collected
      // from a buyer to report.
      marketplaceCommissionCollected: 0,
      marketplaceGstCollected: 0,
    });
    // While off, what a request would actually pay is gross.
    expect(off.body.pendingBalance).toBe(1000);

    await setCommission({ commissionEnabled: true });
    const on = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(sellerActor)).expect(200);
    expect(on.body.commission.enabled).toBe(true);
    expect(on.body.commission.gstOnPending).toBe(18);
    expect(on.body.pendingBalance).toBe(882);
  });

  it('GET /seller/payouts reports marketplace commission as already-collected (informational), never as a deduction', async () => {
    await setCommission({ commissionEnabled: true, commissionPct: 10 });
    const { sellerActor } = await kitchenWithMarkupMarketplaceEarnings({
      price: 1118,
      sellerAmount: 1000,
      commissionAmount: 100,
      gstAmount: 18,
      commissionPct: 10,
      gstPct: 18,
    });

    const res = await h.api().get(`${API_PREFIX}/seller/payouts`).set(auth(sellerActor)).expect(200);
    expect(res.body.commission.marketplaceCommissionCollected).toBe(100);
    expect(res.body.commission.marketplaceGstCollected).toBe(18);
    // No legacy stream in this fixture, so nothing is *deducted*.
    expect(res.body.commission.commissionOnPending).toBe(0);
    expect(res.body.pendingBalance).toBe(1000);
  });

  it('/seller/me hands the form its rate — never hardcoded client-side', async () => {
    await setCommission({ commissionPct: 12.5 });
    const { sellerActor } = await kitchenWithLegacyMarketplaceEarnings(500);

    const res = await h.api().get(`${API_PREFIX}/seller/me`).set(auth(sellerActor)).expect(200);
    // The whole deduction, in one place. A screen that had the
    // commission rate and not the GST rate would quote a number that is
    // 18% of the fee wrong, which is worse than quoting none.
    expect(res.body.commission).toEqual({ pct: 12.5, enabled: false, gstPct: 18 });
  });

  it('mixed eras never double-count on the legacy stream: a gross-era payout claims its gross, not its net', async () => {
    const { seller, sellerActor } = await kitchenWithSnackEarnings(1000);

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

  it('mixed eras never double-pay marketplace: gross already claimed by an old blended payout is never paid out twice', async () => {
    // Two pre-migration-shaped delivered orders — ₹2000 marketplace gross
    // ever earned, none of it split (so net === gross for this fixture).
    const { seller, sellerActor } = await kitchenWithLegacyMarketplaceEarnings(1000);
    {
      const category = await createCategory(h);
      const product = await createProduct(h, seller.vendorId, category.id, { price: 1000 });
      const buyer = await createActor(h);
      const address = await createAddress(h, buyer.userId);
      await createOrder(h, {
        userId: buyer.userId,
        addressId: address.id,
        items: [{ productId: product.id, name: product.name, price: 1000 }],
        status: 'delivered',
      });
    }

    // A blended payout from before this per-stream tracking existed,
    // whose ₹1200 gross happens to have been entirely marketplace in
    // reality — `allocateClaimedGross` cannot know that, and attributes
    // as much of it to marketplace as could possibly be true
    // (capped at the ₹2000 total, so it can never over-claim).
    await h.prisma.payout.create({
      data: {
        sellerId: seller.id,
        amount: 1200,
        grossAmount: 1200,
        status: 'paid',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      },
    });

    await setCommission({ commissionEnabled: true, commissionPct: 10 });

    const res = await request(sellerActor).expect(201);
    // ₹2000 ever earned − ₹1200 already claimed = ₹800 pending, paid in
    // full (marketplace is never deducted) — not ₹800 × 90%, and not the
    // full ₹2000 (which would double-pay the ₹1200 already settled).
    expect(res.body.amount).toBe(800);
    expect(res.body.grossAmount).toBe(800);
    expect(res.body.commissionAmount).toBe(0);
  });

  it('the admin queue sees the legacy split on new rows and no invented split on old ones', async () => {
    const { seller, sellerActor } = await kitchenWithSnackEarnings(1000);
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
    // ₹750 gross − ₹75 fee − ₹13.50 GST = ₹661.50 (the legacy split —
    // there is no marketplace earning in this fixture).
    expect(newRow.amount).toBe(661.5);
    expect(newRow.commissionAmount).toBe(75);
    const oldRow = rows.find((r) => r.amount === 250)!;
    expect(oldRow.grossAmount).toBeUndefined();
    expect(oldRow.commissionAmount).toBeUndefined();
  });
});
