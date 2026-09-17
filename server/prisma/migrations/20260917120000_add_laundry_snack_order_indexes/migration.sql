-- Admin unified-orders read (AdminOrdersService.listLaundry/listSnack) filters
-- on `status` (the `live=true` tab) and always sorts `createdAt desc`, on every
-- `/admin/orders` load. Neither table had an index on either column, so both
-- reads did a full table scan + sort. Matches the pair `Order` already carries.

-- CreateIndex
CREATE INDEX "LaundryBooking_status_idx" ON "LaundryBooking"("status");

-- CreateIndex
CREATE INDEX "LaundryBooking_createdAt_idx" ON "LaundryBooking"("createdAt");

-- CreateIndex
CREATE INDEX "SnackOrder_status_idx" ON "SnackOrder"("status");

-- CreateIndex
CREATE INDEX "SnackOrder_createdAt_idx" ON "SnackOrder"("createdAt");
