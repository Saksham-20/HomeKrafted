import sharp from 'sharp';
import { DispatchService } from '../../src/rider/dispatch.service';
import { ALL_ADMIN_SCOPES } from '../../src/common/admin-scopes';
import {
  API_PREFIX,
  Actor,
  Harness,
  auth,
  createActor,
  createCategory,
  createHarness,
  createKitchen,
  createProduct,
  errorOf,
  resetDatabase,
} from './harness';

const actorFromToken = (token: string): Actor => ({ userId: '', email: '', token });

/** Sector 34, Chandigarh — `createKitchen`'s own default pickup point. */
const PICKUP = { lat: 30.7196, lng: 76.7601 };
/** ~1.3km away (Sector 35). */
const DROP = { lat: 30.7266, lng: 76.7554 };

const BASE_DOCS = ['selfie', 'aadhaar_front', 'aadhaar_back', 'pan', 'bank_proof'] as const;

/**
 * R3 (`docs/RIDER-APP.md` §2.4) — cash and payouts, against a real
 * Postgres, same harness shape as `rider-deliveries.e2e-spec.ts`
 * (`DispatchService.tick(now)` driven directly, `RIDER_DISPATCH_ENABLED`
 * unset).
 */
describe('rider cash and payouts (R3)', () => {
  let h: Harness;
  let dispatch: DispatchService;

  beforeAll(async () => {
    h = await createHarness();
    dispatch = h.app.get(DispatchService);
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h);
  });

  async function tinyJpeg(hex: string): Promise<Buffer> {
    return sharp({ create: { width: 20, height: 20, channels: 3, background: hex } }).jpeg().toBuffer();
  }

  async function createZone() {
    return h.prisma.deliveryZone.create({
      data: { name: 'Test Zone', city: 'Chandigarh', centerLat: PICKUP.lat, centerLng: PICKUP.lng, radiusKm: 6 },
    });
  }

  /** A full, approved rider — same onboarding path as R1/R2's specs — then online at `lat`/`lng`. */
  async function approvedOnlineRider(zoneId: string, lat: number, lng: number): Promise<{ actor: Actor; riderId: string }> {
    const consumer = await createActor(h, 'consumer');
    const enrolRes = await h.api().post(`${API_PREFIX}/rider-enrolment`).set(auth(consumer)).send({}).expect(200);
    const actor = actorFromToken(enrolRes.body.accessToken as string);

    await h
      .api()
      .put(`${API_PREFIX}/rider/me/application`)
      .set(auth(actor))
      .send({
        fullName: 'Cash Test Rider',
        dateOfBirth: '2000-01-01',
        homeLine1: '221B, Sector 34',
        homeCity: 'Chandigarh',
        homePincode: '160034',
        emergencyName: 'Emergency Contact',
        emergencyRelation: 'Sibling',
        emergencyPhone: '9988776655',
        vehicleType: 'bicycle',
        aadhaarLast4: '1234',
        panNumber: 'ABCDE1234F',
        upiId: 'rider@upi',
        tshirtSize: 'M',
        homeZoneId: zoneId,
      })
      .expect(200);

    const tiny = await tinyJpeg('#8a6a16');
    for (const kind of BASE_DOCS) {
      await h.api().post(`${API_PREFIX}/rider/documents/${kind}`).set(auth(actor)).attach('file', tiny, `${kind}.jpg`).expect(201);
    }
    await h
      .api()
      .post(`${API_PREFIX}/rider/me/consents`)
      .set(auth(actor))
      .send({ agreementVersion: '1.0', privacyVersion: '1.0', location: true, bgv: true })
      .expect(201);
    const submitRes = await h.api().post(`${API_PREFIX}/rider/me/submit`).set(auth(actor)).expect(200);
    const riderId: string = submitRes.body.id;

    const admin = await createActor(h, 'admin');
    for (const kind of BASE_DOCS) {
      await h.api().patch(`${API_PREFIX}/admin/riders/${riderId}/documents/${kind}`).set(auth(admin)).send({ status: 'approved' }).expect(200);
    }
    await h.api().post(`${API_PREFIX}/admin/riders/${riderId}/approve`).set(auth(admin)).expect(201);

    await h.api().post(`${API_PREFIX}/rider/duty`).set(auth(actor)).send({ online: true, lat, lng }).expect(200);

    return { actor, riderId };
  }

  async function createCodOrder(buyerId: string, vendorId: string, categoryId: string, addressId: string, amount = 500) {
    const product = await createProduct(h, vendorId, categoryId, { price: amount });
    const order = await h.prisma.order.create({
      data: {
        orderNumber: `HK-COD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: buyerId,
        status: 'placed',
        subtotal: amount,
        total: amount,
        paymentMethod: 'cod',
        shippingAddressIds: [addressId],
        items: {
          create: [{ productId: product.id, name: product.name, quantity: 1, price: amount, addressId, sku: `sku-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }],
        },
      },
    });
    return { order, product };
  }

  /** Runs a rider through the whole R2 journey for a COD order, leaving `amount` sitting in their cash balance. */
  async function deliverCodOrder(rider: { actor: Actor; riderId: string }, vendorId: string, orderId: string) {
    const admin = await createActor(h, 'admin');
    const createRes = await h.api().post(`${API_PREFIX}/admin/deliveries`).set(auth(admin)).send({ orderId, vendorId }).expect(201);
    const jobId: string = createRes.body[0].id;

    await dispatch.tick(new Date());
    const offer = await h.api().get(`${API_PREFIX}/rider/offers/current`).set(auth(rider.actor)).expect(200);
    await h.api().post(`${API_PREFIX}/rider/offers/${offer.body.id}/accept`).set(auth(rider.actor)).expect(200);

    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/arrived-pickup`).set(auth(rider.actor)).send(PICKUP).expect(200);
    const jpeg = await tinyJpeg('#2f5d34');
    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/pickup-photo`).set(auth(rider.actor)).attach('file', jpeg, 'pickup.jpg').expect(201);
    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/picked-up`).set(auth(rider.actor)).expect(200);

    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/arrived-drop`).set(auth(rider.actor)).send(DROP).expect(200);
    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/drop-photo`).set(auth(rider.actor)).attach('file', jpeg, 'drop.jpg').expect(201);

    const dbJobBefore = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    await h
      .api()
      .post(`${API_PREFIX}/rider/jobs/${jobId}/deliver`)
      .set(auth(rider.actor))
      .send({ otp: dbJobBefore.deliveryOtp, cashCollected: true })
      .expect(200);

    return h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
  }

  async function buyerWithAddress() {
    const buyer = await createActor(h, 'consumer');
    const address = await h.prisma.address.create({
      data: {
        userId: buyer.userId,
        label: 'Home',
        recipientName: 'Buyer',
        phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        line1: 'Somewhere',
        city: 'Chandigarh',
        state: 'Chandigarh',
        pincode: '160035',
        lat: DROP.lat,
        lng: DROP.lng,
      },
    });
    return { buyer, address };
  }

  it('deposit pending -> verify -> balance drops, and a duplicate UTR is refused', async () => {
    const zone = await createZone();
    const { vendor } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);
    const { buyer, address } = await buyerWithAddress();
    const { order } = await createCodOrder(buyer.userId, vendor.id, category.id, address.id, 500);

    const rider = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    await deliverCodOrder(rider, vendor.id, order.id);

    const cashBefore = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cashBefore.body.balance).toBe(500);
    expect(cashBefore.body.codBlocked).toBe(false);
    expect(cashBefore.body.companyUpiId).toBeNull(); // nothing set on /admin/settings

    // --- amount > balance is refused ---
    const tooMuch = await h
      .api()
      .post(`${API_PREFIX}/rider/cash/deposits`)
      .set(auth(rider.actor))
      .send({ amount: 600, utr: '123456789012' })
      .expect(400);
    expect(errorOf(tooMuch).message).toMatch(/owe/i);

    // --- a real deposit, still pending, no ledger entry yet ---
    const depositRes = await h
      .api()
      .post(`${API_PREFIX}/rider/cash/deposits`)
      .set(auth(rider.actor))
      .send({ amount: 300, utr: '123456789012' })
      .expect(201);
    expect(depositRes.body.status).toBe('pending');
    const depositId: string = depositRes.body.id;

    const balanceUnchanged = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(balanceUnchanged.body.balance).toBe(500); // no ledger entry until verified

    // --- the same UTR again is a 409 ---
    const dup = await h
      .api()
      .post(`${API_PREFIX}/rider/cash/deposits`)
      .set(auth(rider.actor))
      .send({ amount: 100, utr: '123456789012' })
      .expect(409);
    expect(errorOf(dup).message).toMatch(/already been submitted/i);

    // --- a finance-scoped admin verifies it ---
    const financeAdmin = await createActor(h, 'admin');
    const verifyRes = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-deposits/${depositId}/verify`)
      .set(auth(financeAdmin))
      .expect(201);
    expect(verifyRes.body.status).toBe('verified');

    const cashAfter = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cashAfter.body.balance).toBe(200); // 500 - 300

    const entries = await h.prisma.riderCashEntry.findMany({ where: { riderId: rider.riderId }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => e.type)).toEqual(['cod_collected', 'deposit']);
    expect(Number(entries[1]?.amount)).toBe(-300);

    // --- verifying it again is a conflict, not a second deduction ---
    await h.api().post(`${API_PREFIX}/admin/rider-deposits/${depositId}/verify`).set(auth(financeAdmin)).expect(409);
    const cashStillAfter = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cashStillAfter.body.balance).toBe(200);
  }, 60000);

  it('a rider without the finance scope cannot reach deposits or payouts', async () => {
    const zone = await createZone();
    const { vendor } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);
    const { buyer, address } = await buyerWithAddress();
    const { order } = await createCodOrder(buyer.userId, vendor.id, category.id, address.id, 200);
    const rider = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    await deliverCodOrder(rider, vendor.id, order.id);

    const depositRes = await h
      .api()
      .post(`${API_PREFIX}/rider/cash/deposits`)
      .set(auth(rider.actor))
      .send({ amount: 100, utr: '999999999999' })
      .expect(201);

    // An admin with every scope EXCEPT `finance` — the sub-admin shape (M47).
    const ridersOnlyAdmin = await createActor(h, 'admin');
    const scopesWithoutFinance = ALL_ADMIN_SCOPES.filter((s) => s !== 'finance');
    await h.prisma.user.update({ where: { id: ridersOnlyAdmin.userId }, data: { adminScopes: scopesWithoutFinance } });

    const forbidden = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-deposits/${depositRes.body.id}/verify`)
      .set(auth(ridersOnlyAdmin))
      .expect(403);
    expect(errorOf(forbidden).message).toMatch(/finance/i);

    await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/generate`)
      .set(auth(ridersOnlyAdmin))
      .send({ periodStart: '2026-01-01', periodEnd: '2026-01-31' })
      .expect(403);

    // The `riders`-scoped cash-limit route still works for the same admin — proves this is a scope check, not a role check.
    await h.api().patch(`${API_PREFIX}/admin/riders/${rider.riderId}/cash-limit`).set(auth(ridersOnlyAdmin)).send({ amount: 2000 }).expect(200);
  }, 60000);

  it('payouts: generate is idempotent per rider+period, pay records a settlement, reject restores the balance', async () => {
    const zone = await createZone();
    const { vendor } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);
    const { buyer, address } = await buyerWithAddress();
    const { order } = await createCodOrder(buyer.userId, vendor.id, category.id, address.id, 500);
    const rider = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    const deliveredJob = await deliverCodOrder(rider, vendor.id, order.id);

    const periodStart = new Date(deliveredJob.deliveredAt!.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(deliveredJob.deliveredAt!.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const financeAdmin = await createActor(h, 'admin');

    const generateOnce = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/generate`)
      .set(auth(financeAdmin))
      .send({ periodStart, periodEnd })
      .expect(201);
    expect(generateOnce.body).toHaveLength(1);
    const payout = generateOnce.body[0];
    expect(payout.riderId).toBe(rider.riderId);
    expect(payout.earnings).toBeGreaterThan(0);
    // deduct_from_payout is the rider's default settlement mode — the
    // ₹500 cash balance is far bigger than this one small-distance job's
    // own pay, so the deduction is capped at `earnings` (cash-ledger.ts's
    // own "never more than earnings" rule) — the whole payout, not the
    // whole cash balance.
    expect(payout.cashDeducted).toBe(payout.earnings);
    expect(payout.net).toBe(0);
    expect(payout.status).toBe('pending');

    // --- the deduction actually happened on the ledger ---
    const cashAfterGenerate = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cashAfterGenerate.body.balance).toBe(round2(500 - payout.cashDeducted));

    // --- generate again for the exact same period: idempotent, no second payout ---
    const generateTwice = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/generate`)
      .set(auth(financeAdmin))
      .send({ periodStart, periodEnd })
      .expect(201);
    expect(generateTwice.body).toEqual([]); // nothing new — already generated for this rider+period

    const payoutRows = await h.prisma.riderPayout.count({ where: { riderId: rider.riderId } });
    expect(payoutRows).toBe(1);

    // --- reject: reverses the deduction with an adjustment entry ---
    const rejectRes = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/${payout.id}/reject`)
      .set(auth(financeAdmin))
      .send({ reason: 'Wrong period, redo it' })
      .expect(201);
    expect(rejectRes.body.status).toBe('rejected');

    const cashAfterReject = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cashAfterReject.body.balance).toBe(500); // restored

    const entries = await h.prisma.riderCashEntry.findMany({ where: { riderId: rider.riderId }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => e.type)).toEqual(['cod_collected', 'payout_deduction', 'adjustment']);
    expect(Number(entries[2]?.amount)).toBe(payout.cashDeducted);

    // --- a second reject is a conflict, not a second reversal ---
    await h.api().post(`${API_PREFIX}/admin/rider-payouts/${payout.id}/reject`).set(auth(financeAdmin)).send({ reason: 'again' }).expect(409);
    const cashStill = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cashStill.body.balance).toBe(500);

    // --- a fresh payout for the same rider+period (still pending, cashDeducted 0 this time — nothing owed) can be paid ---
    // Generate again now that the earlier one was rejected — the unique
    // key is (riderId, periodStart, periodEnd), so the rejected row still
    // occupies it; this proves rejection does not reopen the slot, which
    // is the correct "never re-decide a settled payout" shape (M15).
    const generateAfterReject = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/generate`)
      .set(auth(financeAdmin))
      .send({ periodStart, periodEnd })
      .expect(201);
    expect(generateAfterReject.body).toEqual([]);

    // --- pay a fresh payout for a later period (nothing owed this time, cashDeducted 0) to prove `pay` records rather than moves money ---
    const laterStart = periodEnd;
    const laterEnd = new Date(new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000).toISOString();
    // No jobs delivered in this window, so nothing generates — instead
    // exercise `pay` directly against the still-pending scenario by
    // reusing a manually seeded payout row.
    const manualPayout = await h.prisma.riderPayout.create({
      data: {
        riderId: rider.riderId,
        periodStart: new Date(laterStart),
        periodEnd: new Date(laterEnd),
        earnings: 100,
        cashDeducted: 0,
        adjustments: 0,
        net: 100,
        status: 'pending',
      },
    });
    const payRes = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/${manualPayout.id}/pay`)
      .set(auth(financeAdmin))
      .send({ reference: 'UTR-TEST-1' })
      .expect(201);
    expect(payRes.body.status).toBe('paid');
    expect(payRes.body.reference).toBe('UTR-TEST-1');

    // --- paying twice with the same idempotency key returns the same result, not a second decision ---
    const key = 'test-pay-key-1';
    const anotherManualPayout = await h.prisma.riderPayout.create({
      data: {
        riderId: rider.riderId,
        periodStart: new Date(new Date(laterEnd).getTime() + 1000),
        periodEnd: new Date(new Date(laterEnd).getTime() + 2 * 24 * 60 * 60 * 1000),
        earnings: 50,
        cashDeducted: 0,
        adjustments: 0,
        net: 50,
        status: 'pending',
      },
    });
    const firstPay = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/${anotherManualPayout.id}/pay`)
      .set(auth(financeAdmin))
      .set('Idempotency-Key', key)
      .send({ reference: 'UTR-TEST-2' })
      .expect(201);
    const secondPay = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/${anotherManualPayout.id}/pay`)
      .set(auth(financeAdmin))
      .set('Idempotency-Key', key)
      .send({ reference: 'UTR-TEST-2' })
      .expect(201);
    expect(secondPay.body).toEqual(firstPay.body);

    // --- the earnings screen shows the per-job row and the payout history ---
    const earningsRes = await h.api().get(`${API_PREFIX}/rider/earnings`).set(auth(rider.actor)).expect(200);
    expect(earningsRes.body.jobs).toHaveLength(1);
    expect(earningsRes.body.jobs[0].jobNumber).toBe(deliveredJob.jobNumber);
    expect(earningsRes.body.jobs[0].totalPay).toBeGreaterThan(0);
    expect(earningsRes.body.totals.jobCount).toBe(1);
    expect(earningsRes.body.payouts.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(earningsRes.body)).not.toMatch(/Sector 3[45]/); // areas only, no street line
  }, 60000);

  it('a deposit awaiting verification is never charged again — not by a second deposit, not by a payout', async () => {
    const zone = await createZone();
    const { vendor } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);
    const { buyer, address } = await buyerWithAddress();
    const { order } = await createCodOrder(buyer.userId, vendor.id, category.id, address.id, 500);
    const rider = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    const deliveredJob = await deliverCodOrder(rider, vendor.id, order.id);

    // Owes ₹500; sends all of it by UPI. Nobody has verified it yet.
    const deposit = await h
      .api()
      .post(`${API_PREFIX}/rider/cash/deposits`)
      .set(auth(rider.actor))
      .send({ amount: 500, utr: '555566667777' })
      .expect(201);

    // A second deposit on top would add up to more than is owed.
    await h
      .api()
      .post(`${API_PREFIX}/rider/cash/deposits`)
      .set(auth(rider.actor))
      .send({ amount: 1, utr: '555566668888' })
      .expect(400);

    // Payday arrives before the UTR is checked: nothing is deducted.
    const financeAdmin = await createActor(h, 'admin');
    const generated = await h
      .api()
      .post(`${API_PREFIX}/admin/rider-payouts/generate`)
      .set(auth(financeAdmin))
      .send({
        periodStart: new Date(deliveredJob.deliveredAt!.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        periodEnd: new Date(deliveredJob.deliveredAt!.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
    expect(generated.body).toHaveLength(1);
    expect(generated.body[0].cashDeducted).toBe(0);
    expect(generated.body[0].net).toBe(generated.body[0].earnings);

    // Verifying lands the deposit exactly once: balance 0, not -500.
    await h.api().post(`${API_PREFIX}/admin/rider-deposits/${deposit.body.id}/verify`).set(auth(financeAdmin)).expect(201);
    const cash = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cash.body.balance).toBe(0);
  }, 60000);

  it('an admin cash adjustment is signed, audited, and idempotency-guarded', async () => {
    const zone = await createZone();
    const rider = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    const financeAdmin = await createActor(h, 'admin');

    const key = 'adj-key-1';
    const first = await h
      .api()
      .put(`${API_PREFIX}/admin/riders/${rider.riderId}/cash-adjustment`)
      .set(auth(financeAdmin))
      .set('Idempotency-Key', key)
      .send({ amount: 150, note: 'Manual correction after a support call' })
      .expect(200);
    const second = await h
      .api()
      .put(`${API_PREFIX}/admin/riders/${rider.riderId}/cash-adjustment`)
      .set(auth(financeAdmin))
      .set('Idempotency-Key', key)
      .send({ amount: 150, note: 'Manual correction after a support call' })
      .expect(200);
    expect(second.body).toEqual(first.body);

    const entries = await h.prisma.riderCashEntry.findMany({ where: { riderId: rider.riderId } });
    expect(entries).toHaveLength(1); // not written twice
    expect(entries[0]?.type).toBe('adjustment');
    expect(Number(entries[0]?.amount)).toBe(150);

    const cash = await h.api().get(`${API_PREFIX}/rider/cash`).set(auth(rider.actor)).expect(200);
    expect(cash.body.balance).toBe(150);

    const withoutNote = await h
      .api()
      .put(`${API_PREFIX}/admin/riders/${rider.riderId}/cash-adjustment`)
      .set(auth(financeAdmin))
      .send({ amount: 50, note: '' })
      .expect(400);
    expect(errorOf(withoutNote)).toBeTruthy();
  });

  it('an over-limit rider still gets a prepaid offer, never a COD one', async () => {
    const zone = await createZone();
    const { vendor } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);
    const rider = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    const financeAdmin = await createActor(h, 'admin');

    // Push the rider's balance to their cash limit (default ₹1,500) — at
    // the limit, not over it (R2's own dispatch contract: exactly at the
    // limit is still fine), then one more rupee over.
    await h
      .api()
      .put(`${API_PREFIX}/admin/riders/${rider.riderId}/cash-adjustment`)
      .set(auth(financeAdmin))
      .send({ amount: 1501, note: 'test setup — push over the cash limit' })
      .expect(200);

    const { buyer: codBuyer, address: codAddress } = await buyerWithAddress();
    const { order: codOrder } = await createCodOrder(codBuyer.userId, vendor.id, category.id, codAddress.id, 300);
    const prepaidBuyer = await createActor(h, 'consumer');
    const prepaidAddress = await h.prisma.address.create({
      data: {
        userId: prepaidBuyer.userId,
        label: 'Home',
        recipientName: 'Prepaid Buyer',
        phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        line1: 'Somewhere else',
        city: 'Chandigarh',
        state: 'Chandigarh',
        pincode: '160035',
        lat: DROP.lat,
        lng: DROP.lng,
      },
    });
    const product = await createProduct(h, vendor.id, category.id, { name: 'Prepaid test product', price: 300 });
    const prepaidOrder = await h.prisma.order.create({
      data: {
        orderNumber: `HK-PPD-${Date.now()}`,
        userId: prepaidBuyer.userId,
        status: 'placed',
        subtotal: 300,
        total: 300,
        paymentMethod: 'wallet',
        shippingAddressIds: [prepaidAddress.id],
        items: {
          create: [{ productId: product.id, name: product.name, quantity: 1, price: 300, addressId: prepaidAddress.id, sku: `sku-ppd-${Date.now()}` }],
        },
      },
    });

    const codJobRes = await h.api().post(`${API_PREFIX}/admin/deliveries`).set(auth(financeAdmin)).send({ orderId: codOrder.id, vendorId: vendor.id }).expect(201);
    const codJobId: string = codJobRes.body[0].id;
    const prepaidJobRes = await h.api().post(`${API_PREFIX}/admin/deliveries`).set(auth(financeAdmin)).send({ orderId: prepaidOrder.id, vendorId: vendor.id }).expect(201);
    const prepaidJobId: string = prepaidJobRes.body[0].id;

    await dispatch.tick(new Date());

    const currentOffer = await h.api().get(`${API_PREFIX}/rider/offers/current`).set(auth(rider.actor)).expect(200);
    expect(currentOffer.body).not.toBeNull();
    expect(currentOffer.body.jobId).toBe(prepaidJobId);
    expect(currentOffer.body.codAmount).toBeUndefined();

    const codJobAfter = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: codJobId } });
    expect(codJobAfter.status).toBe('unassigned'); // never offered — the only rider online is over the cash limit
    const prepaidJobAfter = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: prepaidJobId } });
    expect(prepaidJobAfter.status).toBe('offered');
  }, 60000);
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
