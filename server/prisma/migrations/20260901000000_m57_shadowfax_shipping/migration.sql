-- CreateEnum
CREATE TYPE "ShippingProvider" AS ENUM ('self', 'shadowfax');
-- CreateEnum
CREATE TYPE "ConsignmentStatus" AS ENUM ('pending', 'booked', 'out-for-pickup', 'picked', 'in-transit', 'out-for-delivery', 'delivered', 'exception', 'returned', 'cancelled', 'failed');
-- CreateTable
CREATE TABLE "Consignment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "provider" "ShippingProvider" NOT NULL DEFAULT 'shadowfax',
    "clientOrderId" TEXT NOT NULL,
    "awbNumber" TEXT,
    "status" "ConsignmentStatus" NOT NULL DEFAULT 'pending',
    "courierStatus" TEXT,
    "statusNote" TEXT,
    "riderName" TEXT,
    "riderContact" TEXT,
    "currentLocation" TEXT,
    "trackingUrl" TEXT,
    "failureReason" TEXT,
    "bookAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Consignment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ConsignmentEvent" (
    "id" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "courierStatus" TEXT NOT NULL,
    "status" "ConsignmentStatus" NOT NULL,
    "comments" TEXT,
    "location" TEXT,
    "riderName" TEXT,
    "riderContact" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsignmentEvent_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Consignment_clientOrderId_key" ON "Consignment"("clientOrderId");
-- CreateIndex
CREATE UNIQUE INDEX "Consignment_awbNumber_key" ON "Consignment"("awbNumber");
-- CreateIndex
CREATE INDEX "Consignment_status_idx" ON "Consignment"("status");
-- CreateIndex
CREATE INDEX "Consignment_orderId_idx" ON "Consignment"("orderId");
-- CreateIndex
CREATE INDEX "Consignment_vendorId_status_idx" ON "Consignment"("vendorId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "Consignment_orderId_vendorId_addressId_key" ON "Consignment"("orderId", "vendorId", "addressId");
-- CreateIndex
CREATE INDEX "ConsignmentEvent_consignmentId_createdAt_idx" ON "ConsignmentEvent"("consignmentId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "ConsignmentEvent_consignmentId_courierStatus_eventAt_key" ON "ConsignmentEvent"("consignmentId", "courierStatus", "eventAt");
-- AddForeignKey
ALTER TABLE "Consignment" ADD CONSTRAINT "Consignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Consignment" ADD CONSTRAINT "Consignment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Consignment" ADD CONSTRAINT "Consignment_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ConsignmentEvent" ADD CONSTRAINT "ConsignmentEvent_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
