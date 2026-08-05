-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN     "productId" TEXT,
ADD COLUMN     "slotLabel" TEXT,
ALTER COLUMN "mealType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isSnack" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSubscribable" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Product_isSubscribable_idx" ON "Product"("isSubscribable");

-- CreateIndex
CREATE INDEX "Product_isSnack_idx" ON "Product"("isSnack");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
