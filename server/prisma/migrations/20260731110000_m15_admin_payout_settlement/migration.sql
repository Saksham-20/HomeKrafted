-- M15: close the payout loop.
--
-- A HomeKrafter could request a payout from M8.3b onward, but no admin
-- endpoint or screen existed to settle or refuse one, so `pending` was a
-- terminal state in practice and money could go into the platform and
-- never come out. These columns are what an admin decision records.
--
-- `reference` matters because settlement happens *outside* this system —
-- there is no payout-provider integration — so it is the only link
-- between "marked paid here" and a real bank transfer.

-- AlterEnum
ALTER TYPE "PayoutStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "reference" TEXT;

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
