-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('food', 'craft');

-- CreateEnum
CREATE TYPE "ProductShippingScope" AS ENUM ('local', 'national');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "group" "ProductKind" NOT NULL DEFAULT 'food',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'food',
ADD COLUMN     "shippingScope" "ProductShippingScope" NOT NULL DEFAULT 'local';

-- CreateIndex
CREATE INDEX "Category_group_sortOrder_idx" ON "Category"("group", "sortOrder");
