-- R1 part 2 of 2: the rider fleet tables (docs/RIDER-APP.md §3), and the
-- M47 backfill for the `riders` admin scope added in part 1.
--
-- Every table from §3 lands here in one shot, including the R2/R3 ones
-- (`DeliveryJob`, `DeliveryOffer`, `DeliveryProof`, `RiderLocationPing`,
-- `RiderCashEntry`, `RiderDeposit`, `RiderPayout`, `RiderSosEvent`) — R1
-- only builds services against `Rider`, `RiderDocument` and
-- `DeliveryZone`, but the shape is settled once rather than migrated
-- three times.

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusKm" INTEGER NOT NULL DEFAULT 6,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rider" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RiderStatus" NOT NULL DEFAULT 'applied',
    "statusNote" TEXT,
    "fullName" TEXT,
    "dateOfBirth" DATE,
    "gender" TEXT,
    "email" TEXT,
    "homeLine1" TEXT,
    "homeLine2" TEXT,
    "homeCity" TEXT,
    "homePincode" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emergencyName" TEXT,
    "emergencyRelation" TEXT,
    "emergencyPhone" TEXT,
    "vehicleType" "VehicleType",
    "vehicleNumber" TEXT,
    "dlNumber" TEXT,
    "dlExpiry" DATE,
    "aadhaarLast4" CHAR(4),
    "panNumber" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "upiId" TEXT,
    "tshirtSize" TEXT,
    "homeZoneId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "cashLimit" DECIMAL(12,2) NOT NULL DEFAULT 1500,
    "settlementMode" "CashSettlementMode" NOT NULL DEFAULT 'deduct_from_payout',
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "onlineSince" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "agreementVersion" TEXT,
    "agreementAcceptedAt" TIMESTAMP(3),
    "privacyVersion" TEXT,
    "privacyAcceptedAt" TIMESTAMP(3),
    "locationConsentAt" TIMESTAMP(3),
    "bgvConsentAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "govRegisteredAt" TIMESTAMP(3),
    "exitedAt" TIMESTAMP(3),
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(2,1),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderDocument" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "kind" "RiderDocumentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryJob" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "zoneId" TEXT,
    "riderId" TEXT,
    "status" "DeliveryJobStatus" NOT NULL DEFAULT 'unassigned',
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropLat" DOUBLE PRECISION NOT NULL,
    "dropLng" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "codAmount" DECIMAL(12,2),
    "deliveryOtp" TEXT,
    "basePay" DECIMAL(12,2),
    "distancePay" DECIMAL(12,2),
    "waitPay" DECIMAL(12,2),
    "incentivePay" DECIMAL(12,2),
    "totalPay" DECIMAL(12,2),
    "offeredAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "arrivedPickupAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "arrivedDropAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOffer" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "status" "DeliveryOfferStatus" NOT NULL DEFAULT 'offered',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "DeliveryProofStage" NOT NULL,
    "url" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderLocationPing" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "jobId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderLocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderCashEntry" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "RiderCashEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "jobId" TEXT,
    "depositId" TEXT,
    "payoutId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderCashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderDeposit" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "utr" TEXT NOT NULL,
    "status" "RiderDepositStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderPayout" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "earnings" DECIMAL(12,2) NOT NULL,
    "cashDeducted" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(12,2) NOT NULL,
    "status" "RiderPayoutStatus" NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderSosEvent" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "jobId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" "SosStatus" NOT NULL DEFAULT 'open',
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderSosEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_name_key" ON "DeliveryZone"("name");

-- CreateIndex
CREATE INDEX "DeliveryZone_isActive_idx" ON "DeliveryZone"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Rider_userId_key" ON "Rider"("userId");

-- CreateIndex
CREATE INDEX "Rider_status_idx" ON "Rider"("status");

-- CreateIndex
CREATE INDEX "Rider_homeZoneId_idx" ON "Rider"("homeZoneId");

-- CreateIndex
CREATE INDEX "RiderDocument_status_idx" ON "RiderDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RiderDocument_riderId_kind_key" ON "RiderDocument"("riderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryJob_jobNumber_key" ON "DeliveryJob"("jobNumber");

-- CreateIndex
CREATE INDEX "DeliveryJob_status_idx" ON "DeliveryJob"("status");

-- CreateIndex
CREATE INDEX "DeliveryJob_riderId_status_idx" ON "DeliveryJob"("riderId", "status");

-- CreateIndex
CREATE INDEX "DeliveryJob_zoneId_status_idx" ON "DeliveryJob"("zoneId", "status");

-- CreateIndex
CREATE INDEX "DeliveryJob_orderId_idx" ON "DeliveryJob"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryJob_vendorId_idx" ON "DeliveryJob"("vendorId");

-- CreateIndex
CREATE INDEX "DeliveryJob_addressId_idx" ON "DeliveryJob"("addressId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryJob_orderId_vendorId_addressId_key" ON "DeliveryJob"("orderId", "vendorId", "addressId");

-- CreateIndex
CREATE INDEX "DeliveryOffer_status_expiresAt_idx" ON "DeliveryOffer"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOffer_jobId_riderId_key" ON "DeliveryOffer"("jobId", "riderId");

-- CreateIndex
CREATE INDEX "DeliveryProof_jobId_stage_idx" ON "DeliveryProof"("jobId", "stage");

-- CreateIndex
CREATE INDEX "RiderLocationPing_riderId_recordedAt_idx" ON "RiderLocationPing"("riderId", "recordedAt");

-- CreateIndex
CREATE INDEX "RiderLocationPing_recordedAt_idx" ON "RiderLocationPing"("recordedAt");

-- CreateIndex
CREATE INDEX "RiderCashEntry_riderId_createdAt_idx" ON "RiderCashEntry"("riderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiderDeposit_utr_key" ON "RiderDeposit"("utr");

-- CreateIndex
CREATE INDEX "RiderDeposit_riderId_status_idx" ON "RiderDeposit"("riderId", "status");

-- CreateIndex
CREATE INDEX "RiderDeposit_status_idx" ON "RiderDeposit"("status");

-- CreateIndex
CREATE INDEX "RiderPayout_riderId_status_idx" ON "RiderPayout"("riderId", "status");

-- CreateIndex
CREATE INDEX "RiderPayout_status_idx" ON "RiderPayout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RiderPayout_riderId_periodStart_periodEnd_key" ON "RiderPayout"("riderId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "RiderSosEvent_status_idx" ON "RiderSosEvent"("status");

-- CreateIndex
CREATE INDEX "RiderSosEvent_riderId_idx" ON "RiderSosEvent"("riderId");

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_homeZoneId_fkey" FOREIGN KEY ("homeZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rider" ADD CONSTRAINT "Rider_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderDocument" ADD CONSTRAINT "RiderDocument_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderDocument" ADD CONSTRAINT "RiderDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderLocationPing" ADD CONSTRAINT "RiderLocationPing_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderLocationPing" ADD CONSTRAINT "RiderLocationPing_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashEntry" ADD CONSTRAINT "RiderCashEntry_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashEntry" ADD CONSTRAINT "RiderCashEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashEntry" ADD CONSTRAINT "RiderCashEntry_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "RiderDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashEntry" ADD CONSTRAINT "RiderCashEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "RiderPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderCashEntry" ADD CONSTRAINT "RiderCashEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderDeposit" ADD CONSTRAINT "RiderDeposit_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderDeposit" ADD CONSTRAINT "RiderDeposit_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderPayout" ADD CONSTRAINT "RiderPayout_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderPayout" ADD CONSTRAINT "RiderPayout_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderSosEvent" ADD CONSTRAINT "RiderSosEvent_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderSosEvent" ADD CONSTRAINT "RiderSosEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderSosEvent" ADD CONSTRAINT "RiderSosEvent_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- M47's rule: empty means nothing, not everything, and an existing admin
-- must never lose a section a migration adds — the safe direction is to
-- hand every current admin the new scope, the same call M47's own
-- migration made when it invented the concept. Additive (`array_append`
-- guarded by a membership check) rather than a full overwrite, so a
-- sub-admin's existing scopes are untouched either way.
UPDATE "User"
SET "adminScopes" = array_append("adminScopes", 'riders')
WHERE "role" = 'admin' AND NOT ('riders' = ANY("adminScopes"));
