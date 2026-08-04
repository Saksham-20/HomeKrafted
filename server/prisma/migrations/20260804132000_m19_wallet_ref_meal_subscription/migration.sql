-- A wallet debit for a meal-subscription cycle needs somewhere to point.
--
-- Split into its own migration on purpose. `ALTER TYPE ... ADD VALUE` cannot
-- be *used* in the transaction that adds it, and Prisma runs each migration
-- file in one transaction — so the value lands here and the tables that
-- reference it land in the next file. Same reason `home_chef` got its own
-- migration earlier in M19.
ALTER TYPE "WalletTransactionRefType" ADD VALUE IF NOT EXISTS 'mealSubscription';
