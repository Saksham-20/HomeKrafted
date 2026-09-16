import sharp from 'sharp';
import { DispatchService } from '../../src/rider/dispatch.service';
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
/** ~1.3km away (Sector 35) — close enough that the fleet's road-factored distance stays small and predictable. */
const DROP = { lat: 30.7266, lng: 76.7554 };
/** Zirakpur — ~9km from the pickup, well outside the 300m default arrive radius. */
const FAR_AWAY = { lat: 30.6425, lng: 76.8173 };

const BASE_DOCS = ['selfie', 'aadhaar_front', 'aadhaar_back', 'pan', 'bank_proof'] as const;

/**
 * R2 — the delivery journey end to end (`docs/RIDER-APP.md` §2.3), driven
 * against a real Postgres the same way `rider-onboarding.e2e-spec.ts` is.
 * `DispatchService.tick(now)` is called directly (the R2 brief: "e2e
 * calls tick(now) directly") rather than waiting on the real 5s
 * `setInterval`, which stays off in every test run
 * (`RIDER_DISPATCH_ENABLED` is unset in `test/e2e/env.ts`).
 */
describe('rider deliveries (R2)', () => {
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
    await resetDatabase(h.prisma);
  });

  async function tinyJpeg(hex: string): Promise<Buffer> {
    return sharp({ create: { width: 20, height: 20, channels: 3, background: hex } }).jpeg().toBuffer();
  }

  async function createZone() {
    return h.prisma.deliveryZone.create({
      data: { name: 'Test Zone', city: 'Chandigarh', centerLat: PICKUP.lat, centerLng: PICKUP.lng, radiusKm: 6 },
    });
  }

  /** A full, approved rider — onboarding end to end, the same path `rider-onboarding.e2e-spec.ts` exercises — then online at `lat`/`lng`. */
  async function approvedOnlineRider(zoneId: string, lat: number, lng: number): Promise<{ actor: Actor; riderId: string }> {
    const consumer = await createActor(h, 'consumer');
    const enrolRes = await h.api().post(`${API_PREFIX}/rider-enrolment`).set(auth(consumer)).send({}).expect(200);
    const actor = actorFromToken(enrolRes.body.accessToken as string);

    await h
      .api()
      .put(`${API_PREFIX}/rider/me/application`)
      .set(auth(actor))
      .send({
        fullName: 'Test Rider',
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

    const jpeg = await tinyJpeg('#8a6a16');
    for (const kind of BASE_DOCS) {
      await h.api().post(`${API_PREFIX}/rider/documents/${kind}`).set(auth(actor)).attach('file', jpeg, `${kind}.jpg`).expect(201);
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

  /** A COD order for one buyer, one kitchen, one product — checkout never sets `paymentMethod: cod` today, so this is built directly (R2 brief). */
  async function createCodOrder(buyerId: string, vendorId: string, categoryId: string, addressId: string) {
    const product = await createProduct(h, vendorId, categoryId, { price: 500 }); // `moderationStatus: 'active'` by default

    const order = await h.prisma.order.create({
      data: {
        orderNumber: `HK-COD-${Date.now()}`,
        userId: buyerId,
        status: 'placed',
        subtotal: 500,
        total: 500,
        paymentMethod: 'cod',
        shippingAddressIds: [addressId],
        items: {
          create: [{ productId: product.id, name: product.name, quantity: 1, price: 500, addressId, sku: `sku-${Date.now()}` }],
        },
      },
    });
    return { order, product };
  }

  it('the full journey: dispatch, decline, accept, geofence, proofs, otp, cash, pay — and a clean history line', async () => {
    const zone = await createZone();
    const { vendor, seller } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);

    const buyer = await createActor(h, 'consumer');
    const address = await h.prisma.address.create({
      data: {
        userId: buyer.userId,
        label: 'Home',
        recipientName: 'Priya Sharma',
        phone: '9123456789',
        line1: 'H.No. 42, Sector 35-B',
        city: 'Chandigarh',
        state: 'Chandigarh',
        pincode: '160035',
        lat: DROP.lat,
        lng: DROP.lng,
      },
    });

    const { order } = await createCodOrder(buyer.userId, vendor.id, category.id, address.id);

    // A pickup phone/address on the kitchen's own profile, so the active-job
    // view has something real to (eventually) reveal to the rider.
    await h.prisma.vendorProfile.create({
      data: {
        vendorId: vendor.id,
        pickupAddressLine1: 'H.No. 7, Sector 34',
        pickupPincode: '160034',
        pickupPhone: '9000000001',
      },
    });

    // --- Two approved, online riders: one right at the kitchen, one ~9km away. ---
    const near = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    const far = await approvedOnlineRider(zone.id, FAR_AWAY.lat, FAR_AWAY.lng);

    const admin = await createActor(h, 'admin');

    // --- Admin dispatches the job (manual despatch — not wired to "packed" yet). ---
    const createRes = await h
      .api()
      .post(`${API_PREFIX}/admin/deliveries`)
      .set(auth(admin))
      .send({ orderId: order.id, vendorId: vendor.id })
      .expect(201);
    expect(createRes.body).toHaveLength(1);
    const jobId: string = createRes.body[0].id;

    let dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('unassigned');
    expect(Number(dbJob.codAmount)).toBe(500); // the order's whole total — one kitchen, one address
    expect(dbJob.deliveryOtp).toMatch(/^\d{4}$/);
    // Captured once, immutable for the job's lifetime — used both to build a
    // guaranteed-wrong guess below and for the real delivery later.
    const realOtp = dbJob.deliveryOtp as string;
    const wrongOtp = realOtp === '0000' ? '1111' : '0000';

    // --- tick: offers the nearest rider (the one right at the kitchen). ---
    await dispatch.tick(new Date());
    dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('offered');

    const nearOffer = await h.api().get(`${API_PREFIX}/rider/offers/current`).set(auth(near.actor)).expect(200);
    expect(nearOffer.body).not.toBeNull();
    expect(nearOffer.body.jobId).toBe(jobId);
    // Pay is quoted on the offer, before acceptance — a rider must not accept blind.
    const quotedJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(nearOffer.body.pay).toBeGreaterThan(0);
    expect(nearOffer.body.pay).toBe(Number(quotedJob.totalPay));
    const offerId: string = nearOffer.body.id;

    const farOffer = await h.api().get(`${API_PREFIX}/rider/offers/current`).set(auth(far.actor)).expect(200);
    expect(farOffer.text).toBe(''); // D6 — one offer at a time, and it went to the nearer rider. Nest sends an empty body (not the literal text "null") for a handler returning `null`, and superagent then defaults `.body` to `{}` — `.text` is the precise check.

    // --- decline -> back to unassigned -> next tick offers the second (only remaining) rider. ---
    await h.api().post(`${API_PREFIX}/rider/offers/${offerId}/decline`).set(auth(near.actor)).expect(200);
    dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('unassigned');

    await dispatch.tick(new Date());
    const farOfferAfter = await h.api().get(`${API_PREFIX}/rider/offers/current`).set(auth(far.actor)).expect(200);
    expect(farOfferAfter.body).not.toBeNull();
    const secondOfferId: string = farOfferAfter.body.id;

    // The rider who declined is never re-offered the same job (`alreadyOffered`).
    const nearAfterDecline = await h.api().get(`${API_PREFIX}/rider/offers/current`).set(auth(near.actor)).expect(200);
    expect(nearAfterDecline.text).toBe('');

    // --- two concurrent accepts (a double-tap) on the same live offer: exactly one wins. ---
    // D6 means only one rider ever holds a given offer, so the race worth
    // guarding is the same rider's own double-tap — the guarded
    // `updateMany({ where: { status: 'offered' } })` must let exactly one
    // request through even when both read the row before either writes.
    const [race1, race2] = await Promise.all([
      h.api().post(`${API_PREFIX}/rider/offers/${secondOfferId}/accept`).set(auth(far.actor)),
      h.api().post(`${API_PREFIX}/rider/offers/${secondOfferId}/accept`).set(auth(far.actor)),
    ]);
    const raceStatuses = [race1.status, race2.status].sort();
    expect(raceStatuses).toEqual([200, 409]);

    dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('accepted');
    expect(dbJob.riderId).toBe(far.riderId);
    expect(dbJob.acceptedAt).not.toBeNull();

    // A third attempt, now that the dust has settled, is unambiguously refused.
    await h.api().post(`${API_PREFIX}/rider/offers/${secondOfferId}/accept`).set(auth(far.actor)).expect(409);

    // --- arrive too far: refused, names the distance. ---
    const tooFar = await h
      .api()
      .post(`${API_PREFIX}/rider/jobs/${jobId}/arrived-pickup`)
      .set(auth(far.actor))
      .send({ lat: FAR_AWAY.lat, lng: FAR_AWAY.lng })
      .expect(400);
    expect(errorOf(tooFar).message).toMatch(/km|m from the kitchen/);

    // --- arrive for real ---
    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/arrived-pickup`).set(auth(far.actor)).send(PICKUP).expect(200);
    dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('at_pickup');

    // --- picked-up refused without a pickup photo ---
    const noPhoto = await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/picked-up`).set(auth(far.actor)).expect(400);
    expect(errorOf(noPhoto).message).toMatch(/photo/i);

    // --- upload the pickup photo, then picked-up succeeds ---
    const pickupJpeg = await tinyJpeg('#2f5d34');
    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/pickup-photo`).set(auth(far.actor)).attach('file', pickupJpeg, 'pickup.jpg').expect(201);
    const pickedUpRes = await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/picked-up`).set(auth(far.actor)).expect(200);
    expect(pickedUpRes.body.status).toBe('picked_up');
    expect(pickedUpRes.body.pickup).toBeUndefined(); // D13 — the pickup address disappears the moment it's picked up

    // --- the order moves to `shipped` (single-job order, weakest-job rule trivially satisfied) ---
    const orderAfterPickup = await h.api().get(`${API_PREFIX}/orders/${order.id}`).set(auth(buyer)).expect(200);
    expect(orderAfterPickup.body.status).toBe('shipped');
    expect(orderAfterPickup.body.delivery.status).toBe('picked_up');
    expect(orderAfterPickup.body.delivery.riderFirstName).toBe('Test');
    expect(typeof orderAfterPickup.body.delivery.otp).toBe('string'); // shown until delivered

    // --- arrive at drop, drop photo ---
    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/arrived-drop`).set(auth(far.actor)).send(DROP).expect(200);
    const dropJpeg = await tinyJpeg('#c0392b');
    await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/drop-photo`).set(auth(far.actor)).attach('file', dropJpeg, 'drop.jpg').expect(201);

    // --- deliver: wrong OTP refused, names attempts left ---
    const wrongOtpRes = await h.api().post(`${API_PREFIX}/rider/jobs/${jobId}/deliver`).set(auth(far.actor)).send({ otp: wrongOtp, cashCollected: true }).expect(400);
    expect(errorOf(wrongOtpRes).message).toMatch(/attempt/i);

    // --- deliver: right OTP succeeds ---
    const deliverRes = await h
      .api()
      .post(`${API_PREFIX}/rider/jobs/${jobId}/deliver`)
      .set(auth(far.actor))
      .send({ otp: realOtp, cashCollected: true })
      .expect(200);
    expect(deliverRes.text).toBe(''); // the job is no longer "active" once delivered — same empty-body shape as above

    dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('delivered');
    expect(dbJob.deliveredAt).not.toBeNull();
    expect(Number(dbJob.totalPay)).toBeGreaterThan(0);
    expect(Number(dbJob.basePay)).toBe(25); // rider.basePay default 2500 paise -> ₹25

    // --- the order itself is delivered, deliveredAt stamped, cashback/return-window basis intact ---
    const orderAfterDeliver = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterDeliver.status).toBe('delivered');
    expect(orderAfterDeliver.deliveredAt).not.toBeNull();

    // --- the cash ledger — a row, never a counter (D8) ---
    const cashEntries = await h.prisma.riderCashEntry.findMany({ where: { riderId: far.riderId, jobId } });
    expect(cashEntries).toHaveLength(1);
    expect(cashEntries[0]?.type).toBe('cod_collected');
    expect(Number(cashEntries[0]?.amount)).toBe(500);

    const cashSummary = await h.api().get(`${API_PREFIX}/rider/me`).set(auth(far.actor)).expect(200);
    expect(cashSummary.body.cash.balance).toBe(500);

    // --- history carries no pickup/drop address line anywhere ---
    const history = await h.api().get(`${API_PREFIX}/rider/jobs`).set(auth(far.actor)).expect(200);
    const historyText = JSON.stringify(history.body);
    expect(historyText).not.toContain('H.No. 7, Sector 34'); // pickup address line
    expect(historyText).not.toContain('H.No. 42, Sector 35-B'); // buyer's address line
    expect(historyText).not.toContain('9000000001'); // chef phone
    expect(historyText).not.toContain('9123456789'); // buyer phone
    expect(historyText).not.toContain(realOtp); // the delivery OTP itself
    expect(history.body.items[0].jobNumber).toBe(dbJob.jobNumber);

    // --- the seller's own view: rider identity, no phone ---
    const sellerActor = await createActor(h, 'seller', { sellerId: seller.id });
    const sellerDelivery = await h.api().get(`${API_PREFIX}/seller/orders/${order.id}/delivery`).set(auth(sellerActor)).expect(200);
    expect(sellerDelivery.body.status).toBe('delivered');
    expect(sellerDelivery.body.riderFirstName).toBe('Test');
    expect(JSON.stringify(sellerDelivery.body)).not.toMatch(/\+?\d{10}/); // no phone-shaped field
  }, 60000);

  it('going offline is refused while a job is in progress', async () => {
    const zone = await createZone();
    const { vendor } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);
    const buyer = await createActor(h, 'consumer');
    const address = await h.prisma.address.create({
      data: {
        userId: buyer.userId,
        label: 'Home',
        recipientName: 'Buyer',
        phone: '9123456780',
        line1: 'Somewhere',
        city: 'Chandigarh',
        state: 'Chandigarh',
        pincode: '160035',
        lat: DROP.lat,
        lng: DROP.lng,
      },
    });
    const { order } = await createCodOrder(buyer.userId, vendor.id, category.id, address.id);

    const rider = await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    const admin = await createActor(h, 'admin');
    const createRes = await h.api().post(`${API_PREFIX}/admin/deliveries`).set(auth(admin)).send({ orderId: order.id, vendorId: vendor.id }).expect(201);
    const jobId: string = createRes.body[0].id;

    await dispatch.tick(new Date());
    const offer = await h.api().get(`${API_PREFIX}/rider/offers/current`).set(auth(rider.actor)).expect(200);
    await h.api().post(`${API_PREFIX}/rider/offers/${offer.body.id}/accept`).set(auth(rider.actor)).expect(200);

    const blocked = await h.api().post(`${API_PREFIX}/rider/duty`).set(auth(rider.actor)).send({ online: false }).expect(409);
    expect(errorOf(blocked).message).toMatch(/delivery in progress/i);
  });

  it('an offer expires and the job returns to unassigned for the next tick', async () => {
    const zone = await createZone();
    const { vendor } = await createKitchen(h, { lat: PICKUP.lat, lng: PICKUP.lng });
    const category = await createCategory(h);
    const buyer = await createActor(h, 'consumer');
    const address = await h.prisma.address.create({
      data: {
        userId: buyer.userId,
        label: 'Home',
        recipientName: 'Buyer',
        phone: '9123456781',
        line1: 'Somewhere else',
        city: 'Chandigarh',
        state: 'Chandigarh',
        pincode: '160035',
        lat: DROP.lat,
        lng: DROP.lng,
      },
    });
    const { order } = await createCodOrder(buyer.userId, vendor.id, category.id, address.id);

    await approvedOnlineRider(zone.id, PICKUP.lat, PICKUP.lng);
    const admin = await createActor(h, 'admin');
    const createRes = await h.api().post(`${API_PREFIX}/admin/deliveries`).set(auth(admin)).send({ orderId: order.id, vendorId: vendor.id }).expect(201);
    const jobId: string = createRes.body[0].id;

    await dispatch.tick(new Date());
    let dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('offered');

    // Well past the 45s default offer window.
    await dispatch.tick(new Date(Date.now() + 60_000));
    dbJob = await h.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(dbJob.status).toBe('unassigned');

    const offer = await h.prisma.deliveryOffer.findFirstOrThrow({ where: { jobId } });
    expect(offer.status).toBe('expired');
  });
});
