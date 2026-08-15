-- CreateIndex
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

-- CreateIndex
CREATE INDEX "CartItem_hamperId_idx" ON "CartItem"("hamperId");

-- CreateIndex
CREATE INDEX "CartItem_addressId_idx" ON "CartItem"("addressId");

-- CreateIndex
CREATE INDEX "Collection_occasionId_idx" ON "Collection"("occasionId");

-- CreateIndex
CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");

-- CreateIndex
CREATE INDEX "CorporateQuoteLine_productId_idx" ON "CorporateQuoteLine"("productId");

-- CreateIndex
CREATE INDEX "Hamper_boxId_idx" ON "Hamper"("boxId");

-- CreateIndex
CREATE INDEX "HamperItem_hamperId_idx" ON "HamperItem"("hamperId");

-- CreateIndex
CREATE INDEX "HamperItem_productId_idx" ON "HamperItem"("productId");

-- CreateIndex
CREATE INDEX "LaundryBooking_addressId_idx" ON "LaundryBooking"("addressId");

-- CreateIndex
CREATE INDEX "LaundryBooking_subscriptionId_idx" ON "LaundryBooking"("subscriptionId");

-- CreateIndex
CREATE INDEX "LaundryBookingLine_bookingId_idx" ON "LaundryBookingLine"("bookingId");

-- CreateIndex
CREATE INDEX "LaundryBookingLine_serviceId_idx" ON "LaundryBookingLine"("serviceId");

-- CreateIndex
CREATE INDEX "LaundrySubscription_serviceId_idx" ON "LaundrySubscription"("serviceId");

-- CreateIndex
CREATE INDEX "LaundrySubscription_slotId_idx" ON "LaundrySubscription"("slotId");

-- CreateIndex
CREATE INDEX "MealPlan_productId_idx" ON "MealPlan"("productId");

-- CreateIndex
CREATE INDEX "MealSubscription_addressId_idx" ON "MealSubscription"("addressId");

-- CreateIndex
CREATE INDEX "OrderItem_addressId_idx" ON "OrderItem"("addressId");

-- CreateIndex
CREATE INDEX "OrderItem_hamperId_idx" ON "OrderItem"("hamperId");

-- CreateIndex
CREATE INDEX "ProductOccasion_occasionId_idx" ON "ProductOccasion"("occasionId");

-- CreateIndex
CREATE INDEX "RazorpayOrder_orderId_idx" ON "RazorpayOrder"("orderId");

-- CreateIndex
CREATE INDEX "RazorpayOrder_walletId_idx" ON "RazorpayOrder"("walletId");

-- CreateIndex
CREATE INDEX "SellerApplication_status_createdAt_idx" ON "SellerApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SnackListItem_snackListId_idx" ON "SnackListItem"("snackListId");

-- CreateIndex
CREATE INDEX "SnackListItem_snackId_idx" ON "SnackListItem"("snackId");

-- CreateIndex
CREATE INDEX "SnackOrderItem_snackOrderId_idx" ON "SnackOrderItem"("snackOrderId");

-- CreateIndex
CREATE INDEX "SnackOrderItem_snackId_idx" ON "SnackOrderItem"("snackId");

-- CreateIndex
CREATE INDEX "VendorFollow_vendorId_idx" ON "VendorFollow"("vendorId");

-- CreateIndex
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");

