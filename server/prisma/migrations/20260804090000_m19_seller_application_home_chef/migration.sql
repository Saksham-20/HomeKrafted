-- M19: a food category on the seller application.
--
-- Its own migration on purpose. Postgres cannot use an enum value added by
-- `ALTER TYPE ... ADD VALUE` inside the same transaction that adds it, so
-- anything referencing `home_chef` has to land in a later migration.
--
-- `home_chef` maps to `VendorType.maker` in
-- `AdminSellersService#vendorTypeForCategory`. Deliberately not a new
-- `VendorType`: the storefront renders identically, and a new vendor type
-- would churn every discovery surface for nothing a buyer sees.

ALTER TYPE "SellerApplicationCategory" ADD VALUE IF NOT EXISTS 'home_chef' BEFORE 'other';
