-- G1 (docs/GIFTING-REWORK.md): the gift department tree's columns, the
-- attribute model, and the listing facts the gift form needs. All additive:
-- every new column is nullable or has a default, and every new table starts
-- empty, so this migration changes nothing about a catalogue that is already
-- live. The tree and the question sets arrive as idempotent seeds, not here.
--
-- One line is NOT G1's: `ALTER TABLE "Product" ALTER COLUMN "allergens" DROP
-- DEFAULT`. The committed migration 20260914130000_product_allergens gave the
-- column a default that schema.prisma does not declare, so every `migrate
-- diff` since has proposed removing it. Carried here rather than left to be
-- re-proposed forever; Prisma always sends the array explicitly, so nothing
-- that writes a listing today depends on that default.

-- CreateEnum
CREATE TYPE "AttributeKind" AS ENUM ('single', 'multi', 'text', 'number', 'boolean', 'dimensions');

-- CreateEnum
CREATE TYPE "AttributeRequirement" AS ENUM ('required', 'encouraged', 'optional');

-- CreateEnum
CREATE TYPE "Fulfilment" AS ENUM ('ready_to_ship', 'made_to_order');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "synonyms" TEXT[];

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "fulfilment" "Fulfilment",
ADD COLUMN     "genericName" TEXT,
ADD COLUMN     "heatSafePacked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPersonalisable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "netQuantity" DECIMAL(10,3),
ADD COLUMN     "netQuantityUnit" TEXT,
ADD COLUMN     "packedWeightGrams" INTEGER,
ADD COLUMN     "personalisationFee" DECIMAL(10,2),
ADD COLUMN     "personalisationMaxChars" INTEGER,
ADD COLUMN     "personalisationPrompt" TEXT,
ALTER COLUMN "allergens" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "kind" "AttributeKind" NOT NULL,
    "unit" TEXT,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "trustSensitive" BOOLEAN NOT NULL DEFAULT false,
    "material" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "synonyms" TEXT[],
    "hex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryAttribute" (
    "categoryId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "requirement" "AttributeRequirement" NOT NULL DEFAULT 'optional',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryAttribute_pkey" PRIMARY KEY ("categoryId","attributeId")
);

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "optionId" TEXT,
    "text" TEXT,
    "number" DECIMAL(12,3),
    "boolean" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_key_key" ON "AttributeDefinition"("key");

-- CreateIndex
CREATE INDEX "AttributeOption_attributeId_sortOrder_idx" ON "AttributeOption"("attributeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_attributeId_value_key" ON "AttributeOption"("attributeId", "value");

-- CreateIndex
CREATE INDEX "CategoryAttribute_attributeId_idx" ON "CategoryAttribute"("attributeId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeId_optionId_idx" ON "ProductAttributeValue"("attributeId", "optionId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_productId_idx" ON "ProductAttributeValue"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeId_optionId_key" ON "ProductAttributeValue"("productId", "attributeId", "optionId");

-- CreateIndex
CREATE INDEX "Category_archivedAt_idx" ON "Category"("archivedAt");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

