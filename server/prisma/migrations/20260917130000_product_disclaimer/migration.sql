-- A maker's own caveat about a specific listing — "colours may vary
-- batch to batch". Additive and nullable: NULL means nobody added one,
-- not that there is nothing to know. Shown verbatim next to the
-- description on the product page.
ALTER TABLE "Product" ADD COLUMN "disclaimer" TEXT;
