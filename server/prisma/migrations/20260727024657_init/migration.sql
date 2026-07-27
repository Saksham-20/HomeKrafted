-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('consumer', 'seller', 'admin');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('phone', 'email', 'google', 'apple');

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('google', 'apple');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('product', 'vendor', 'service');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'whatsapp', 'email', 'inapp');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('order', 'laundry', 'snacks', 'wallet', 'promo', 'account');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'joined', 'rewarded');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "SupportChannel" AS ENUM ('chat', 'call', 'email');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('open', 'in-progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "SupportSender" AS ENUM ('user', 'agent');

-- CreateEnum
CREATE TYPE "CorporateInquiryStatus" AS ENUM ('new', 'contacted', 'quoted', 'closed');

-- CreateEnum
CREATE TYPE "SellerApplicationCategory" AS ENUM ('maker', 'baker', 'artist', 'other');

-- CreateEnum
CREATE TYPE "SellerApplicationStatus" AS ENUM ('new', 'reviewing', 'waitlisted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('maker', 'baker', 'artist', 'homekrafted');

-- CreateEnum
CREATE TYPE "DietaryTag" AS ENUM ('vegetarian', 'vegan', 'gluten-free', 'sugar-free', 'contains-nuts');

-- CreateEnum
CREATE TYPE "ProductTag" AS ENUM ('Bestseller', 'New', 'Festive', 'Curated');

-- CreateEnum
CREATE TYPE "ProductModerationStatus" AS ENUM ('active', 'hidden', 'flagged');

-- CreateEnum
CREATE TYPE "GiftWrapStyle" AS ENUM ('kraft', 'floral', 'festive', 'minimal');

-- CreateEnum
CREATE TYPE "RibbonColor" AS ENUM ('gold', 'terracotta', 'pine', 'ivory');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('wallet', 'razorpay', 'cod');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('none', 'requested', 'processing', 'refunded');

-- CreateEnum
CREATE TYPE "WalletTransactionDirection" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "WalletTransactionCategory" AS ENUM ('topup', 'cashback', 'refund', 'payment', 'referral', 'loyalty', 'adjustment');

-- CreateEnum
CREATE TYPE "WalletTransactionRefType" AS ENUM ('order', 'laundryBooking', 'topup', 'referral', 'loyalty', 'support');

-- CreateEnum
CREATE TYPE "AutoTopupTrigger" AS ENUM ('below-threshold', 'scheduled');

-- CreateEnum
CREATE TYPE "LaundryPricingModel" AS ENUM ('per-kg', 'per-item', 'per-hour');

-- CreateEnum
CREATE TYPE "LaundryBookingStatus" AS ENUM ('scheduled', 'picked-up', 'in-progress', 'out-for-delivery', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "LaundrySubscriptionPlan" AS ENUM ('weekly', 'biweekly', 'monthly');

-- CreateEnum
CREATE TYPE "SnackCategory" AS ENUM ('savoury', 'sweet', 'baked', 'namkeen');

-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('veg', 'non-veg');

-- CreateEnum
CREATE TYPE "SnackListStatus" AS ENUM ('draft', 'sent', 'received', 'accepted', 'out-for-delivery', 'delivered');

-- CreateEnum
CREATE TYPE "SnackOrderStatus" AS ENUM ('received', 'accepted', 'out-for-delivery', 'delivered');

-- CreateEnum
CREATE TYPE "SnackOrderChannel" AS ENUM ('whatsapp');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('maker', 'laundry', 'snack');

-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('pending', 'approved', 'suspended');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "avatarPlaceholder" TEXT,
    "authProviders" "AuthProvider"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "UserRole" NOT NULL DEFAULT 'consumer',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT NOT NULL,
    "referredByCode" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "createdByIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "targetType" "ReviewTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "sellerReplyBody" TEXT,
    "sellerReplyCreatedAt" TIMESTAMP(3),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refType" TEXT,
    "refId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "inapp" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "refereeName" TEXT,
    "refereeUserId" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'pending',
    "rewardAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "LoyaltyTier" NOT NULL DEFAULT 'bronze',
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "pointsToNextTier" INTEGER,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "channel" "SupportChannel" NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'open',
    "orderRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sender" "SupportSender" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateInquiry" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "occasion" TEXT,
    "estimatedQuantity" INTEGER NOT NULL,
    "budgetRange" TEXT,
    "message" TEXT NOT NULL,
    "status" "CorporateInquiryStatus" NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerApplication" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "category" "SellerApplicationCategory" NOT NULL,
    "city" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SellerApplicationStatus" NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendingCashback" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lifetimeSaved" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payWithWalletDefault" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "direction" "WalletTransactionDirection" NOT NULL,
    "category" "WalletTransactionCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "title" TEXT NOT NULL,
    "refType" "WalletTransactionRefType",
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoTopupRule" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger" "AutoTopupTrigger" NOT NULL,
    "thresholdAmount" DECIMAL(12,2),
    "topupAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethodRef" TEXT,

    CONSTRAINT "AutoTopupRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VendorType" NOT NULL,
    "bio" TEXT NOT NULL,
    "avatarPlaceholder" TEXT NOT NULL,
    "bannerPlaceholder" TEXT NOT NULL,
    "avatarSrc" TEXT,
    "bannerSrc" TEXT,
    "location" TEXT NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagePlaceholder" TEXT NOT NULL,
    "imageSrc" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occasion" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initial" TEXT NOT NULL,

    CONSTRAINT "Occasion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occasionId" TEXT,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProduct" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "dietary" "DietaryTag"[],
    "defaultWeightSku" TEXT NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "tags" "ProductTag"[],
    "isPackaged" BOOLEAN NOT NULL DEFAULT true,
    "cashbackPct" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "ingredients" TEXT,
    "shelfLife" TEXT,
    "storageInstructions" TEXT,
    "madeIn" TEXT,
    "moderationStatus" "ProductModerationStatus" NOT NULL DEFAULT 'active',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOccasion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "occasionId" TEXT NOT NULL,

    CONSTRAINT "ProductOccasion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "placeholder" TEXT NOT NULL,
    "src" TEXT,
    "ratio" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WeightOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "hamperId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "giftWrap" BOOLEAN NOT NULL DEFAULT false,
    "addressId" TEXT,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HamperBox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxItems" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "itemsLabel" TEXT NOT NULL,

    CONSTRAINT "HamperBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hamper" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "giftNote" TEXT,
    "wrap" "GiftWrapStyle",
    "ribbon" "RibbonColor",
    "nameCard" TEXT,
    "recipientAddressId" TEXT,
    "hidePrice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hamper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HamperItem" (
    "id" TEXT NOT NULL,
    "hamperId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "HamperItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'placed',
    "shippingAddressIds" TEXT[],
    "giftIsGift" BOOLEAN NOT NULL DEFAULT false,
    "giftRecipientName" TEXT,
    "giftRecipientAddressId" TEXT,
    "giftHidePrice" BOOLEAN NOT NULL DEFAULT false,
    "giftMessage" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "walletApplied" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cashbackEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundStatus" "RefundStatus" NOT NULL DEFAULT 'none',
    "paymentMethod" "PaymentMethod" NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "hamperId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "addressId" TEXT NOT NULL,
    "giftWrap" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderShipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3),

    CONSTRAINT "OrderShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundryDay" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isoDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaundryDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundrySlot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "LaundrySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundryService" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricingModel" "LaundryPricingModel" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "priceIsFrom" BOOLEAN NOT NULL DEFAULT false,
    "priceLabel" TEXT NOT NULL,
    "iconPlaceholder" TEXT,

    CONSTRAINT "LaundryService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundryBooking" (
    "id" TEXT NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "pickupSlotId" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "deliverySlotId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "photos" TEXT[],
    "specialInstructions" TEXT,
    "subscriptionId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "LaundryBookingStatus" NOT NULL DEFAULT 'scheduled',
    "estimatedTotal" DECIMAL(12,2) NOT NULL,
    "walletCashback" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partnerId" TEXT,

    CONSTRAINT "LaundryBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundryBookingLine" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "estimatedWeightKg" DECIMAL(6,2),
    "itemCount" INTEGER,
    "estimatedHours" DECIMAL(6,2),
    "estimatedPrice" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "LaundryBookingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaundrySubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "plan" "LaundrySubscriptionPlan" NOT NULL,
    "slotDay" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextPickup" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaundrySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "category" "SnackCategory" NOT NULL,
    "diet" "DietType" NOT NULL,
    "imagePlaceholder" TEXT NOT NULL,
    "imageSrc" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sellerId" TEXT,

    CONSTRAINT "Snack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackList" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "estimateTotal" DECIMAL(10,2) NOT NULL,
    "whatsappPayload" TEXT NOT NULL,
    "status" "SnackListStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnackList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackListItem" (
    "id" TEXT NOT NULL,
    "snackListId" TEXT NOT NULL,
    "snackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "SnackListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackOrder" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "channel" "SnackOrderChannel" NOT NULL DEFAULT 'whatsapp',
    "status" "SnackOrderStatus" NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnackOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnackOrderItem" (
    "id" TEXT NOT NULL,
    "snackOrderId" TEXT NOT NULL,
    "snackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "SnackOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPromo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imagePlaceholder" TEXT NOT NULL,
    "imageSrc" TEXT,
    "appStoreUrl" TEXT NOT NULL,
    "playStoreUrl" TEXT NOT NULL,
    "qrCodePlaceholder" TEXT NOT NULL,

    CONSTRAINT "MealPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SellerType" NOT NULL,
    "vendorId" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "SellerStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" DECIMAL(2,1),
    "reviewCount" INTEGER,

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_idx" ON "PhoneOtp"("phone");

-- CreateIndex
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_provider_providerAccountId_key" ON "SocialAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Review_targetType_targetId_idx" ON "Review"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_userId_key" ON "LoyaltyAccount"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutoTopupRule_walletId_key" ON "AutoTopupRule"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "VendorFollow_userId_vendorId_key" ON "VendorFollow"("userId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Occasion_slug_key" ON "Occasion"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionProduct_collectionId_productId_key" ON "CollectionProduct"("collectionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_vendorId_idx" ON "Product"("vendorId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOccasion_productId_occasionId_key" ON "ProductOccasion"("productId", "occasionId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WeightOption_sku_key" ON "WeightOption"("sku");

-- CreateIndex
CREATE INDEX "WeightOption_productId_idx" ON "WeightOption"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_userId_key" ON "Wishlist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_wishlistId_productId_key" ON "WishlistItem"("wishlistId", "productId");

-- CreateIndex
CREATE INDEX "Hamper_userId_idx" ON "Hamper"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderShipment_orderId_addressId_key" ON "OrderShipment"("orderId", "addressId");

-- CreateIndex
CREATE UNIQUE INDEX "LaundryService_slug_key" ON "LaundryService"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LaundryBooking_bookingNumber_key" ON "LaundryBooking"("bookingNumber");

-- CreateIndex
CREATE INDEX "LaundryBooking_userId_idx" ON "LaundryBooking"("userId");

-- CreateIndex
CREATE INDEX "LaundryBooking_partnerId_idx" ON "LaundryBooking"("partnerId");

-- CreateIndex
CREATE INDEX "LaundrySubscription_userId_idx" ON "LaundrySubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Snack_slug_key" ON "Snack"("slug");

-- CreateIndex
CREATE INDEX "Snack_sellerId_idx" ON "Snack"("sellerId");

-- CreateIndex
CREATE INDEX "SnackList_userId_idx" ON "SnackList"("userId");

-- CreateIndex
CREATE INDEX "SnackOrder_sellerId_idx" ON "SnackOrder"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_userId_key" ON "Seller"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_vendorId_key" ON "Seller"("vendorId");

-- CreateIndex
CREATE INDEX "Seller_type_idx" ON "Seller"("type");

-- CreateIndex
CREATE INDEX "Payout_sellerId_idx" ON "Payout"("sellerId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoTopupRule" ADD CONSTRAINT "AutoTopupRule_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorFollow" ADD CONSTRAINT "VendorFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorFollow" ADD CONSTRAINT "VendorFollow_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_occasionId_fkey" FOREIGN KEY ("occasionId") REFERENCES "Occasion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOccasion" ADD CONSTRAINT "ProductOccasion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOccasion" ADD CONSTRAINT "ProductOccasion_occasionId_fkey" FOREIGN KEY ("occasionId") REFERENCES "Occasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightOption" ADD CONSTRAINT "WeightOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_hamperId_fkey" FOREIGN KEY ("hamperId") REFERENCES "Hamper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hamper" ADD CONSTRAINT "Hamper_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hamper" ADD CONSTRAINT "Hamper_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "HamperBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hamper" ADD CONSTRAINT "Hamper_recipientAddressId_fkey" FOREIGN KEY ("recipientAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HamperItem" ADD CONSTRAINT "HamperItem_hamperId_fkey" FOREIGN KEY ("hamperId") REFERENCES "Hamper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HamperItem" ADD CONSTRAINT "HamperItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_giftRecipientAddressId_fkey" FOREIGN KEY ("giftRecipientAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_hamperId_fkey" FOREIGN KEY ("hamperId") REFERENCES "Hamper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBooking" ADD CONSTRAINT "LaundryBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBooking" ADD CONSTRAINT "LaundryBooking_pickupSlotId_fkey" FOREIGN KEY ("pickupSlotId") REFERENCES "LaundrySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBooking" ADD CONSTRAINT "LaundryBooking_deliverySlotId_fkey" FOREIGN KEY ("deliverySlotId") REFERENCES "LaundrySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBooking" ADD CONSTRAINT "LaundryBooking_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBooking" ADD CONSTRAINT "LaundryBooking_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "LaundrySubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBooking" ADD CONSTRAINT "LaundryBooking_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBookingLine" ADD CONSTRAINT "LaundryBookingLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "LaundryBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBookingLine" ADD CONSTRAINT "LaundryBookingLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "LaundryService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundrySubscription" ADD CONSTRAINT "LaundrySubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundrySubscription" ADD CONSTRAINT "LaundrySubscription_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "LaundryService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundrySubscription" ADD CONSTRAINT "LaundrySubscription_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "LaundrySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snack" ADD CONSTRAINT "Snack_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackList" ADD CONSTRAINT "SnackList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackListItem" ADD CONSTRAINT "SnackListItem_snackListId_fkey" FOREIGN KEY ("snackListId") REFERENCES "SnackList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackListItem" ADD CONSTRAINT "SnackListItem_snackId_fkey" FOREIGN KEY ("snackId") REFERENCES "Snack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrder" ADD CONSTRAINT "SnackOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrderItem" ADD CONSTRAINT "SnackOrderItem_snackOrderId_fkey" FOREIGN KEY ("snackOrderId") REFERENCES "SnackOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnackOrderItem" ADD CONSTRAINT "SnackOrderItem_snackId_fkey" FOREIGN KEY ("snackId") REFERENCES "Snack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
