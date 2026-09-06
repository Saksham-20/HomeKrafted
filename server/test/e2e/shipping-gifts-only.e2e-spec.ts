import { ConsignmentStatus } from '@prisma/client';
import { ShippingService } from '../../src/shipping/shipping.service';
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
 * **A courier carries gifts and never food** (2026-09-06, owner).
 *
 * Shadowfax is the long-haul half of this platform. A candle or a print
 * goes in a box and is posted; a thali is cooked this morning and driven
 * over by the kitchen that made it, on the kitchen's own schedule. So
 * `courier-eligibility.ts` mints a `Consignment` for `craft` lines only,
 * and the food pipeline is bit-for-bit what it was before M57.
 *
 * The case worth the whole file is the **mixed basket** — a candle and a
 * curry from the same kitchen, in one order. It books one parcel for the
 * candle, and the rider delivering that candle says nothing whatever about
 * the curry. Two rules keep that honest and they are one rule read from
 * both ends: the carrier callback may not close such an order (it would
 * stamp `deliveredAt`, start the buyer's seven-day return window and set
 * every kitchen's payout basis on food still in an oven), and the
 * HomeKrafter must therefore *not* be blocked from closing it by hand.
 * Assert either one alone and you can ship a deadlock.
 *
 * Runs against the stub carrier (`SHADOWFAX_API_TOKEN` is the
 * `.env.example` placeholder — see `env.ts`), so the real booking code
 * runs and no rider is ever ordered.
 */
describe('a courier carries gifts, never food', () => {
  let h: Harness;
  let shipping: ShippingService;

  beforeAll(async () => {
    h = await createHarness();
    shipping = h.app.get(ShippingService);
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.prisma);
  });

  /**
   * A kitchen a rider can actually collect from. `createKitchen` leaves
   * `VendorProfile` absent, and `buildPickupAddress` refuses a booking
   * without a line 1, a pincode and a phone — which is correct behaviour
   * and would otherwise make every booking here fail for the wrong reason.
   *
   * `110009` is one of the three pincodes Shadowfax's staging environment
   * actually serves, so the same fixture works against the real carrier.
   */
  async function kitchenWithPickup() {
    const k = await createKitchen(h);
    await h.prisma.vendorProfile.create({
      data: {
        vendorId: k.vendor.id,
        pickupAddressLine1: '12 Model Town',
        pickupPincode: '110009',
        pickupPhone: '9845000001',
      },
    });
    return k;
  }

  async function packedBy(seller: Actor, orderId: string) {
    // Two advances: placed -> confirmed -> packed. `packed` is when a
    // parcel exists, so it is when `bookForOrder` fires.
    await h
      .api()
      .post(`${API_PREFIX}/seller/orders/${orderId}/advance`)
      .set(auth(seller))
      .expect(201);
    return h
      .api()
      .post(`${API_PREFIX}/seller/orders/${orderId}/advance`)
      .set(auth(seller))
      .expect(201);
  }

  /**
   * Wait for the order's parcel to actually carry a waybill.
   *
   * Despatch is asynchronous in production and the suite has to respect
   * that: `advance` fires `bookForOrder` as `void`, and since `book()`
   * claims the row optimistically, a second caller correctly declines to
   * double-book and returns immediately — possibly before the first one
   * has heard back from the carrier. Reading the row straight after
   * `await bookForOrder(...)` is therefore a race the *test* invents, not
   * a defect: polling is what a real observer does.
   */
  async function awaitParcel(orderId: string, timeoutMs = 5_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const row = await h.prisma.consignment.findFirst({ where: { orderId } });
      if (row?.awbNumber) return row;
      if (Date.now() > deadline) {
        throw new Error(
          `No booked parcel for ${orderId} within ${timeoutMs}ms — ` +
            `last seen: ${JSON.stringify(row && { status: row.status, failureReason: row.failureReason })}`,
        );
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /** Feed the carrier's PUSH callback, the way Shadowfax would. */
  function callback(awb: string, event: string) {
    return h
      .api()
      .post(`${API_PREFIX}/shipping/shadowfax/callback`)
      .set('Authorization', `Token ${process.env.SHADOWFAX_CALLBACK_TOKEN}`)
      .send({ awb_number: awb, event, event_timestamp: '2026-09-06 11:00:00' });
  }

  it('books nothing at all for an order of food', async () => {
    const k = await kitchenWithPickup();
    const seller = await createActor(h, 'seller', { sellerId: k.seller.id });
    const category = await createCategory(h);
    const curry = await createProduct(h, k.vendor.id, category.id, { kind: 'food', price: 300 });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    const order = await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: curry.id, name: curry.name, price: 300 }],
    });

    await packedBy(seller, order.id);
    await shipping.bookForOrder(order.id);

    expect(await h.prisma.consignment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('books one parcel for an order of gifts, and closes it on the carrier’s word', async () => {
    const k = await kitchenWithPickup();
    const seller = await createActor(h, 'seller', { sellerId: k.seller.id });
    const category = await createCategory(h);
    const candle = await createProduct(h, k.vendor.id, category.id, { kind: 'craft', price: 700 });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    const order = await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: candle.id, name: candle.name, price: 700 }],
    });

    await packedBy(seller, order.id);
    await shipping.bookForOrder(order.id);

    const parcel = await awaitParcel(order.id);
    expect(await h.prisma.consignment.count({ where: { orderId: order.id } })).toBe(1);
    expect(parcel.status).toBe(ConsignmentStatus.booked);

    await callback(parcel.awbNumber as string, 'delivered').expect(200);

    // Nothing on this order is anything but a gift, so the courier owns
    // its fulfilment and the callback is allowed to close it.
    const closed = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(closed.status).toBe('delivered');
    expect(closed.deliveredAt).not.toBeNull();
  });

  describe('a mixed basket — a candle and a curry from the same kitchen', () => {
    async function mixedOrder() {
      const k = await kitchenWithPickup();
      const seller = await createActor(h, 'seller', { sellerId: k.seller.id });
      const category = await createCategory(h);
      const candle = await createProduct(h, k.vendor.id, category.id, { kind: 'craft', price: 700 });
      const curry = await createProduct(h, k.vendor.id, category.id, { kind: 'food', price: 300 });

      const buyer = await createActor(h);
      const address = await createAddress(h, buyer.userId);
      const order = await createOrder(h, {
        userId: buyer.userId,
        addressId: address.id,
        items: [
          { productId: candle.id, name: candle.name, price: 700 },
          { productId: curry.id, name: curry.name, price: 300 },
        ],
      });
      await packedBy(seller, order.id);
      await shipping.bookForOrder(order.id);
      const parcel = await awaitParcel(order.id);
      return { seller, order, parcel, candle, curry };
    }

    it('puts the candle on the rider and leaves the curry off it', async () => {
      const { order, parcel, candle } = await mixedOrder();

      expect(await h.prisma.consignment.count({ where: { orderId: order.id } })).toBe(1);
      expect(parcel.awbNumber).toBeTruthy();

      // The declared value the carrier was given is the candle's alone.
      // Declaring the curry too would over-insure a parcel it is not in
      // and put a food line on a rider's manifest.
      const events = await h.prisma.consignmentEvent.findMany({ where: { consignmentId: parcel.id } });
      expect(events).toHaveLength(0);
      const carried = await h.prisma.orderItem.findMany({
        where: { orderId: order.id, product: { is: { kind: 'craft' } } },
      });
      expect(carried.map((i) => i.productId)).toEqual([candle.id]);
    });

    it('does not let the carrier close the order when the curry is still to come', async () => {
      const { order, parcel } = await mixedOrder();

      await callback(parcel.awbNumber as string, 'delivered').expect(200);

      // The parcel really did arrive...
      const arrived = await h.prisma.consignment.findUniqueOrThrow({ where: { id: parcel.id } });
      expect(arrived.status).toBe(ConsignmentStatus.delivered);

      // ...and the order did not move. `deliveredAt` is the buyer's
      // return-window clock and the kitchen's payout basis; a candle
      // arriving must not start either one on the curry.
      const stalled = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(stalled.status).toBe('packed');
      expect(stalled.deliveredAt).toBeNull();
    });

    it('leaves the kitchen free to close it by hand', async () => {
      const { seller, order, parcel } = await mixedOrder();
      await callback(parcel.awbNumber as string, 'delivered').expect(200);

      // The other half of the rule. If `hasParcelInFlight` blocked this
      // as well, nobody could advance a mixed order at all and it would
      // sit stuck until an admin overrode it.
      await h
        .api()
        .post(`${API_PREFIX}/seller/orders/${order.id}/advance`)
        .set(auth(seller))
        .expect(201);
      await h
        .api()
        .post(`${API_PREFIX}/seller/orders/${order.id}/advance`)
        .set(auth(seller))
        .expect(201);

      const done = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(done.status).toBe('delivered');
    });
  });

  it('books one parcel, not two, when despatch is asked for twice at once', async () => {
    const k = await kitchenWithPickup();
    const seller = await createActor(h, 'seller', { sellerId: k.seller.id });
    const category = await createCategory(h);
    const candle = await createProduct(h, k.vendor.id, category.id, { kind: 'craft', price: 700 });
    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    const order = await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: candle.id, name: candle.name, price: 700 }],
    });
    await packedBy(seller, order.id);

    // Exactly the production shape: `bookForOrder` is fired as `void` on
    // "packed" and an admin presses Retry in the same second. Without the
    // optimistic claim in `book()` both callers reach the carrier, two
    // waybills come back, and the later write wins — a second rider on
    // the road for a parcel we can no longer track, and a second bill.
    await Promise.all([
      shipping.bookForOrder(order.id),
      shipping.bookForOrder(order.id),
      shipping.bookForOrder(order.id),
    ]);

    const parcel = await awaitParcel(order.id);
    expect(await h.prisma.consignment.count({ where: { orderId: order.id } })).toBe(1);
    // The claim is the attempt, so four concurrent asks (three here plus
    // the `void` one "packed" fired) cost exactly one carrier call.
    expect(parcel.bookAttempts).toBe(1);

    // And the AWB on the row is the one the carrier can be asked about:
    // a callback against it moves the parcel. Before the claim, a losing
    // caller's later write left a *different* waybill here and this
    // callback answered "unknown awb".
    await callback(parcel.awbNumber as string, 'picked').expect(200);
    const moved = await h.prisma.consignment.findUniqueOrThrow({ where: { id: parcel.id } });
    expect(moved.status).toBe(ConsignmentStatus.picked);
  });

  it('blocks the kitchen from hand-closing an order a rider is carrying all of', async () => {
    const k = await kitchenWithPickup();
    const seller = await createActor(h, 'seller', { sellerId: k.seller.id });
    const category = await createCategory(h);
    const candle = await createProduct(h, k.vendor.id, category.id, { kind: 'craft', price: 700 });

    const buyer = await createActor(h);
    const address = await createAddress(h, buyer.userId);
    const order = await createOrder(h, {
      userId: buyer.userId,
      addressId: address.id,
      items: [{ productId: candle.id, name: candle.name, price: 700 }],
    });
    await packedBy(seller, order.id);
    await shipping.bookForOrder(order.id);
    await awaitParcel(order.id);

    // `deliveredAt` has to mean the carrier's proof of delivery, not
    // somebody ticking a box on a parcel they handed over an hour ago.
    const refused = await h
      .api()
      .post(`${API_PREFIX}/seller/orders/${order.id}/advance`)
      .set(auth(seller));
    expect(refused.status).toBe(409);
  });
});
