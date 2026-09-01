-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "parentId" TEXT;
-- AlterTable
ALTER TABLE "TaxonomySuggestion" ADD COLUMN     "parentCategoryId" TEXT;
-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");
-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_productId_categoryId_key" ON "ProductCategory"("productId", "categoryId");
-- CreateIndex
CREATE INDEX "Category_parentId_sortOrder_idx" ON "Category"("parentId", "sortOrder");
-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TaxonomySuggestion" ADD CONSTRAINT "TaxonomySuggestion_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing product joins its own primary category.
--
-- `ProductCategory` carries the COMPLETE set, primary included, so that
-- "everything in this category" is one query. Without this insert every
-- browse page filtering on the join table comes up empty the moment it
-- switches over — the whole catalogue invisible, with nothing obviously
-- broken. Same failure mode as a seed that forgets `moderationStatus`.
--
-- `gen_random_uuid()` is pgcrypto/PG13+, which this database already has.
-- ON CONFLICT so re-running is safe against the partial state a failed
-- deploy can leave behind.
INSERT INTO "ProductCategory" ("id", "productId", "categoryId")
SELECT gen_random_uuid()::text, p."id", p."categoryId"
FROM "Product" p
ON CONFLICT ("productId", "categoryId") DO NOTHING;
