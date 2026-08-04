-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('breakfast', 'lunch', 'dinner');

-- CreateEnum
CREATE TYPE "MealSubscriptionStatus" AS ENUM ('active', 'paused', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "MealDeliveryStatus" AS ENUM ('scheduled', 'skipped', 'unavailable', 'delivered', 'cancelled');

-- The `WalletTransactionRefType` value this milestone needs is added in the
-- preceding migration, not here: `ALTER TYPE ... ADD VALUE` cannot be used in
-- the same transaction that adds it.

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "diet" "DietType" NOT NULL,
    "pricePerMeal" DECIMAL(10,2) NOT NULL,
    "servingSize" TEXT,
    "weeklyMenu" TEXT[],
    "imagePlaceholder" TEXT NOT NULL,
    "imageSrc" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "moderationStatus" "ProductModerationStatus" NOT NULL DEFAULT 'active',
    "maxSubscribers" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "bracketStart" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "status" "MealSubscriptionStatus" NOT NULL DEFAULT 'active',
    "pricePerMeal" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL,
    "mealsTotal" INTEGER NOT NULL,
    "mealsRemaining" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "bracketStart" TEXT NOT NULL,
    "status" "MealDeliveryStatus" NOT NULL DEFAULT 'scheduled',
    "reason" TEXT,
    "skippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_slug_key" ON "MealPlan"("slug");

-- CreateIndex
CREATE INDEX "MealPlan_vendorId_idx" ON "MealPlan"("vendorId");

-- CreateIndex
CREATE INDEX "MealPlan_sellerId_idx" ON "MealPlan"("sellerId");

-- CreateIndex
CREATE INDEX "MealPlan_mealType_isActive_idx" ON "MealPlan"("mealType", "isActive");

-- CreateIndex
CREATE INDEX "MealSubscription_userId_status_idx" ON "MealSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "MealSubscription_planId_status_idx" ON "MealSubscription"("planId", "status");

-- CreateIndex
CREATE INDEX "MealDelivery_scheduledFor_status_idx" ON "MealDelivery"("scheduledFor", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MealDelivery_subscriptionId_scheduledFor_key" ON "MealDelivery"("subscriptionId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealSubscription" ADD CONSTRAINT "MealSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealSubscription" ADD CONSTRAINT "MealSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealSubscription" ADD CONSTRAINT "MealSubscription_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDelivery" ADD CONSTRAINT "MealDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MealSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
