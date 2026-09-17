-- Hand-delivery to the ISB campus (2026-09-17, owner).
--
-- Additive and defaulted, so every existing row keeps the behaviour it
-- already had: `standard` means a courier parcel for a gift or the
-- kitchen's own delivery for food, which is what every order before this
-- migration was. Nothing is backfilled, because there is nothing to
-- guess: no order placed before today was hand-carried onto a campus.
--
-- `server/src/common/delivery/isb-campus.ts` owns what the new value
-- means (no delivery fee whatever the platform charges, no Consignment
-- ever booked, destination written by the server rather than the request).
CREATE TYPE "OrderDeliveryMode" AS ENUM ('standard', 'isb-campus');

ALTER TABLE "Order"
  ADD COLUMN "deliveryMode" "OrderDeliveryMode" NOT NULL DEFAULT 'standard';
