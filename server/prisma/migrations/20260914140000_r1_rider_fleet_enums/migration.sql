-- R1 part 1 of 2: the rider fleet's enums, and the two new members on
-- enums that already exist (`UserRole.rider`, `AdminScope.riders`).
--
-- Split from the migration that creates the tables and backfills existing
-- admins with the new scope (part 2), same reason as M22's
-- `20260806090000_m22_moderation_states`: Postgres refuses to *use* an
-- enum value added by `ALTER TYPE ... ADD VALUE` inside the same
-- transaction that added it, and every Prisma migration file runs in its
-- own transaction. Wholly new enums (`CREATE TYPE`, below) don't have
-- this restriction — only `AdminScope` and `UserRole`, which already
-- existed, do.
--
-- docs/RIDER-APP.md §3 is the data model this and the next file
-- implement in full (R1 builds services against `Rider`/`RiderDocument`/
-- `DeliveryZone` only; the rest are R2/R3 tables landing now so the
-- shape settles once).

CREATE TYPE "RiderStatus" AS ENUM ('applied', 'under_review', 'approved', 'rejected', 'suspended', 'deactivated');

CREATE TYPE "VehicleType" AS ENUM ('bicycle', 'ev_bike', 'scooter', 'motorcycle');

CREATE TYPE "RiderDocumentKind" AS ENUM ('selfie', 'aadhaar_front', 'aadhaar_back', 'pan', 'dl_front', 'dl_back', 'vehicle_rc', 'vehicle_insurance', 'vehicle_photo', 'bank_proof', 'police_verification');

CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE "CashSettlementMode" AS ENUM ('deduct_from_payout', 'deposit');

CREATE TYPE "DeliveryJobStatus" AS ENUM ('unassigned', 'offered', 'accepted', 'at_pickup', 'picked_up', 'at_drop', 'delivered', 'failed', 'returned', 'cancelled');

CREATE TYPE "DeliveryOfferStatus" AS ENUM ('offered', 'accepted', 'declined', 'expired', 'withdrawn');

CREATE TYPE "DeliveryProofStage" AS ENUM ('pickup_rider', 'pickup_chef', 'drop', 'failed_attempt');

CREATE TYPE "RiderCashEntryType" AS ENUM ('cod_collected', 'deposit', 'payout_deduction', 'adjustment');

CREATE TYPE "RiderDepositStatus" AS ENUM ('pending', 'verified', 'rejected');

CREATE TYPE "RiderPayoutStatus" AS ENUM ('pending', 'paid', 'rejected');

CREATE TYPE "SosStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- M47's sub-admin scope: which parts of the panel an admin may reach.
-- `riders` is the rider-fleet section (onboarding review, documents,
-- zones, deliveries, deposits, payouts, SOS).
ALTER TYPE "AdminScope" ADD VALUE 'riders';

-- Own-fleet delivery partner. Phone-OTP sign-in, same as every other
-- role; a `consumer` flips to `rider` at `POST /rider-enrolment`, never
-- at registration.
ALTER TYPE "UserRole" ADD VALUE 'rider';
