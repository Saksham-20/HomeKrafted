-- AddColumn: dimensions, material, careInstructions for craft products
-- These are optional fields only used when kind = 'craft'

ALTER TABLE "Product" ADD COLUMN "dimensions" TEXT;
ALTER TABLE "Product" ADD COLUMN "material" TEXT;
ALTER TABLE "Product" ADD COLUMN "careInstructions" TEXT;
