/**
 * Ports `client/lib/data/*.ts` (the frontend's typed mock fixtures) into
 * real Postgres rows via Prisma — so the API returns the same demo data
 * the frontend already renders against its mock layer. Re-runnable:
 * clears every table it owns (child-before-parent order) before
 * re-inserting, so `npm run prisma:seed` is safe to run repeatedly in dev.
 *
 * Demo account passwords (email+password login): all seeded email/password
 * accounts use `Passw0rd!123` — see README's curl walkthrough.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Passw0rd!123';

async function clearTables(): Promise<void> {
  // Children before parents. FK defaults in the schema are Restrict for
  // required relations, so this order matters.
  await prisma.adminAuditLog.deleteMany();
  await prisma.snackOrderItem.deleteMany();
  await prisma.snackOrder.deleteMany();
  await prisma.snackListItem.deleteMany();
  await prisma.snackList.deleteMany();
  await prisma.snack.deleteMany();
  await prisma.laundryBookingLine.deleteMany();
  await prisma.laundryBooking.deleteMany();
  await prisma.laundrySubscription.deleteMany();
  await prisma.laundrySlot.deleteMany();
  await prisma.laundryDay.deleteMany();
  await prisma.laundryService.deleteMany();
  await prisma.orderShipment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.hamperItem.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.hamper.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.hamperBox.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.collectionProduct.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.productOccasion.deleteMany();
  await prisma.weightOption.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.occasion.deleteMany();
  await prisma.category.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.vendorFollow.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.autoTopupRule.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.loyaltyAccount.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.supportMessage.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.sellerApplication.deleteMany();
  await prisma.corporateInquiry.deleteMany();
  await prisma.mealPromo.deleteMany();
  await prisma.review.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.phoneOtp.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  console.log('Clearing existing data...');
  await clearTables();

  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  // -------------------------------------------------------------------
  // Users (consumer, 3 sellers, 1 admin — admin has no frontend mock seed
  // yet per lib/types/shared.ts's doc comment, added here so RBAC has a
  // real admin account to test against)
  // -------------------------------------------------------------------
  console.log('Seeding users...');

  const consumer = await prisma.user.create({
    data: {
      id: 'user-demo',
      name: 'Ananya Iyer',
      email: 'ananya.iyer@example.com',
      phone: '+919845012345',
      passwordHash,
      avatarPlaceholder: 'ANANYA — AVATAR',
      authProviders: ['phone', 'email'],
      createdAt: new Date('2025-02-18'),
      referralCode: 'ANANYA250',
      role: 'consumer',
    },
  });

  const sellerUser = await prisma.user.create({
    data: {
      id: 'user-seller-demo',
      name: 'Anjali Reddy',
      email: 'anjali@anjaliskitchen.example',
      phone: '+919876543210',
      passwordHash,
      avatarPlaceholder: 'ANJALI — AVATAR',
      authProviders: ['phone', 'email'],
      createdAt: new Date('2023-11-02'),
      referralCode: 'ANJALI250',
      role: 'seller',
    },
  });

  const laundryPartnerUser = await prisma.user.create({
    data: {
      id: 'user-seller-laundry-demo',
      name: 'Ravi Kumar',
      email: 'ravi@freshfoldlaundry.example',
      phone: '+919822011223',
      passwordHash,
      avatarPlaceholder: 'RAVI — AVATAR',
      authProviders: ['phone', 'email'],
      createdAt: new Date('2024-02-10'),
      referralCode: 'RAVI250',
      role: 'seller',
    },
  });

  const snackSellerUser = await prisma.user.create({
    data: {
      id: 'user-seller-snack-demo',
      name: 'Meera Nair',
      email: 'meera@meerassnackbox.example',
      phone: '+919008033445',
      passwordHash,
      avatarPlaceholder: 'MEERA — AVATAR',
      authProviders: ['phone', 'email'],
      createdAt: new Date('2024-05-20'),
      referralCode: 'MEERA250',
      role: 'seller',
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      id: 'user-admin-demo',
      name: 'Homekrafted Admin',
      email: 'admin@homekrafted.example',
      passwordHash,
      avatarPlaceholder: 'ADMIN — AVATAR',
      authProviders: ['email'],
      createdAt: new Date('2022-08-15'),
      referralCode: 'HKADMIN',
      role: 'admin',
    },
  });

  // Lightweight reviewer-only users (product/vendor reviews reference these
  // ids in the mock; they never sign in, so no password/wallet needed).
  const reviewerNames: Record<string, string> = {
    'usr-101': 'Priya Raman',
    'usr-102': 'Karthik Subramaniam',
    'usr-103': 'Divya Menon',
    'usr-104': 'Sanjana Rao',
    'usr-105': 'Arjun Nair',
    'usr-106': 'Meenal Deshpande',
    'usr-107': 'Rohan Bhatia',
    'usr-108': 'Ishita Ghosh',
    'usr-109': 'Naveen Kumar',
    'usr-110': 'Ayesha Khan',
    'usr-111': 'Vikram Shetty',
    'usr-112': 'Ritu Agarwal',
    'usr-113': 'Manoj Pillai',
    'usr-114': 'Sneha Joshi',
    'usr-115': 'Farhan Ali',
    'usr-116': 'Lakshmi Venkatesh',
    'usr-117': 'Aditya Kapoor',
    'usr-118': 'Priya Raman',
    'usr-119': 'Karthik Subramaniam',
    'usr-120': 'Sanjana Rao',
    'usr-121': 'Rohan Bhatia',
    'usr-122': 'Ishita Ghosh',
    'usr-123': 'Ayesha Khan',
    'usr-124': 'Ritu Agarwal',
    'usr-125': 'Sneha Joshi',
    'usr-126': 'Lakshmi Venkatesh',
    'usr-127': 'Aditya Kapoor',
    'usr-201': 'Amit Verma',
    'usr-202': 'spamuser99',
    'usr-203': 'Rakesh T.',
    'user-priya': 'Priya Menon',
    'user-karthik': 'Karthik Rao',
  };
  for (const [id, name] of Object.entries(reviewerNames)) {
    await prisma.user.create({
      data: { id, name, authProviders: [], referralCode: `${id.toUpperCase()}RC` },
    });
  }

  // -------------------------------------------------------------------
  // Addresses
  // -------------------------------------------------------------------
  console.log('Seeding addresses...');

  await prisma.address.createMany({
    data: [
      {
        id: 'addr-demo-1',
        userId: consumer.id,
        label: 'Home',
        recipientName: 'Ananya Iyer',
        phone: '+91 98450 12345',
        line1: '14, 2nd Cross, Indiranagar',
        line2: 'Near CMH Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        country: 'India',
        isDefault: true,
      },
      {
        id: 'addr-demo-2',
        userId: consumer.id,
        label: 'Office',
        recipientName: 'Ananya Iyer',
        phone: '+91 98450 12345',
        line1: '4th Floor, Prestige Tech Park',
        line2: 'Kadubeesanahalli',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560103',
        country: 'India',
        isDefault: false,
      },
      {
        id: 'addr-demo-3',
        userId: consumer.id,
        label: "Amma's place",
        recipientName: 'Lakshmi Iyer',
        phone: '+91 98450 67890',
        line1: '22, Gandhi Nagar 2nd Main',
        city: 'Mysuru',
        state: 'Karnataka',
        pincode: '570009',
        country: 'India',
        isDefault: false,
        instructions: 'Ring the bell twice, gate is usually latched',
      },
    ],
  });

  // -------------------------------------------------------------------
  // Wallets + loyalty accounts (every user gets one; only user-demo has a
  // real ledger seeded in the mock)
  // -------------------------------------------------------------------
  console.log('Seeding wallets + loyalty...');

  const walletDemo = await prisma.wallet.create({
    data: {
      id: 'wallet-demo',
      userId: consumer.id,
      balance: 1250,
      pendingCashback: 85,
      lifetimeSaved: 1940,
      payWithWalletDefault: true,
    },
  });

  await prisma.walletTransaction.createMany({
    data: [
      { id: 'wt1', walletId: walletDemo.id, direction: 'credit', category: 'cashback', amount: 42, balanceAfter: 1250, title: 'Cashback — Order #HK2043', refType: 'order', refId: 'HK2043', createdAt: new Date('2026-07-18') },
      { id: 'wt7', walletId: walletDemo.id, direction: 'credit', category: 'refund', amount: 150, balanceAfter: 1208, title: 'Refund — Order #HK2031 (cancelled)', refType: 'order', refId: 'HK2031', createdAt: new Date('2026-07-17') },
      { id: 'wt2', walletId: walletDemo.id, direction: 'credit', category: 'topup', amount: 1000, balanceAfter: 1058, title: 'Wallet top-up', refType: 'topup', createdAt: new Date('2026-07-15') },
      { id: 'wt3', walletId: walletDemo.id, direction: 'debit', category: 'payment', amount: 560, balanceAfter: 58, title: 'Paid — Dry Fruit Laddoo Box', refType: 'order', createdAt: new Date('2026-07-15') },
      { id: 'wt8', walletId: walletDemo.id, direction: 'credit', category: 'loyalty', amount: 50, balanceAfter: 618, title: 'Loyalty points redeemed for wallet credit', refType: 'loyalty', createdAt: new Date('2026-07-12') },
      { id: 'wt4', walletId: walletDemo.id, direction: 'credit', category: 'referral', amount: 100, balanceAfter: 568, title: 'Referral credit — Priya', refType: 'referral', createdAt: new Date('2026-07-10') },
      { id: 'wt5', walletId: walletDemo.id, direction: 'debit', category: 'payment', amount: 1499, balanceAfter: 468, title: 'Paid — Festive Hamper', refType: 'order', createdAt: new Date('2026-07-02') },
      { id: 'wt6', walletId: walletDemo.id, direction: 'credit', category: 'cashback', amount: 75, balanceAfter: 1967, title: 'Cashback — Order #HK1987', refType: 'order', refId: 'HK1987', createdAt: new Date('2026-07-02') },
    ],
  });

  await prisma.autoTopupRule.create({
    data: {
      id: 'atr-wallet-demo',
      walletId: walletDemo.id,
      enabled: false,
      trigger: 'below_threshold',
      thresholdAmount: 300,
      topupAmount: 1000,
    },
  });

  await prisma.loyaltyAccount.create({
    data: { id: 'loyalty-demo', userId: consumer.id, tier: 'silver', points: 640, lifetimePoints: 1820, pointsToNextTier: 680 },
  });

  for (const [user, walletId, loyaltyId] of [
    [sellerUser, 'wallet-seller-demo', 'loyalty-seller-demo'],
    [laundryPartnerUser, 'wallet-seller-laundry-demo', 'loyalty-seller-laundry-demo'],
    [snackSellerUser, 'wallet-seller-snack-demo', 'loyalty-seller-snack-demo'],
    [adminUser, 'wallet-admin-demo', 'loyalty-admin-demo'],
  ] as const) {
    await prisma.wallet.create({ data: { id: walletId, userId: user.id } });
    await prisma.loyaltyAccount.create({ data: { id: loyaltyId, userId: user.id } });
  }

  // -------------------------------------------------------------------
  // Vendors
  // -------------------------------------------------------------------
  console.log('Seeding vendors...');

  const vendorSeeds = [
    { id: 'vd1', slug: 'anjalis-kitchen', name: "Anjali's Kitchen", type: 'maker', bio: "Small-batch Andhra pickles made the way Anjali's grandmother taught her — slow-cooked, hand-tempered, no shortcuts.", location: 'Guntur, Andhra Pradesh', rating: 4.8, reviewCount: 128, followerCount: 612, joinedAt: '2023-11-02' },
    { id: 'vd2', slug: 'meeras-homefoods', name: "Meera's Homefoods", type: 'maker', bio: 'Home-style chutneys and pickles from a Nagpur kitchen, ground fresh in small weekly batches.', location: 'Nagpur, Maharashtra', rating: 4.7, reviewCount: 86, followerCount: 234, joinedAt: '2024-02-14' },
    { id: 'vd3', slug: 'home-batch', name: 'Home Batch', type: 'baker', bio: 'A Bengaluru home-bakery specialising in better-for-you cookies made with millets and nuts.', location: 'Bengaluru, Karnataka', rating: 4.9, reviewCount: 204, followerCount: 540, joinedAt: '2023-06-20' },
    { id: 'vd4', slug: 'crunch-corner', name: 'Crunch Corner', type: 'maker', bio: 'Ahmedabad-based snack makers turning roasted nuts and seeds into everyday munching.', location: 'Ahmedabad, Gujarat', rating: 4.6, reviewCount: 92, followerCount: 178, joinedAt: '2024-05-09' },
    { id: 'vd5', slug: 'cocoa-homemade', name: 'Cocoa Homemade', type: 'baker', bio: 'Small-batch bean-to-bar chocolate crafted in a home kitchen in Kochi.', location: 'Kochi, Kerala', rating: 4.8, reviewCount: 73, followerCount: 265, joinedAt: '2024-01-11' },
    { id: 'vd6', slug: 'dadis-recipe', name: "Dadi's Recipe", type: 'maker', bio: 'Traditional Rajasthani sweets and dry-fruit preparations made from a family recipe book passed down three generations.', location: 'Jaipur, Rajasthan', rating: 4.9, reviewCount: 140, followerCount: 601, joinedAt: '2022-12-03' },
    { id: 'vd7', slug: 'hills-leaves', name: 'Hills & Leaves', type: 'maker', bio: 'Hand-blended teas sourced from small Darjeeling estates.', location: 'Darjeeling, West Bengal', rating: 4.7, reviewCount: 61, followerCount: 145, joinedAt: '2024-03-27' },
    { id: 'vd8', slug: 'homekrafted', name: 'Homekrafted', type: 'homekrafted', bio: 'Our in-house curation team, building gift-ready hampers from the best of the maker community.', location: 'Bengaluru, Karnataka', rating: 4.9, reviewCount: 57, followerCount: 890, joinedAt: '2022-08-15' },
  ] as const;

  for (const v of vendorSeeds) {
    await prisma.vendor.create({
      data: {
        id: v.id,
        slug: v.slug,
        name: v.name,
        type: v.type,
        bio: v.bio,
        avatarPlaceholder: `${v.name.toUpperCase()} — AVATAR`,
        bannerPlaceholder: `${v.name.toUpperCase()} — BANNER`,
        avatarSrc: '/images/vendors/avatar.jpg',
        bannerSrc: '/images/vendors/banner.jpg',
        location: v.location,
        rating: v.rating,
        reviewCount: v.reviewCount,
        followerCount: v.followerCount,
        joinedAt: new Date(v.joinedAt),
      },
    });
  }

  // -------------------------------------------------------------------
  // Categories & occasions
  // -------------------------------------------------------------------
  console.log('Seeding categories + occasions...');

  await prisma.category.createMany({
    data: [
      { id: 'ct1', slug: 'pickles', name: 'Pickles', imagePlaceholder: 'PICKLES', imageSrc: '/images/categories/pickles.jpg', productCount: 12 },
      { id: 'ct2', slug: 'chutneys', name: 'Chutneys', imagePlaceholder: 'CHUTNEYS', imageSrc: '/images/categories/chutneys.jpg', productCount: 8 },
      { id: 'ct3', slug: 'cookies', name: 'Cookies', imagePlaceholder: 'COOKIES', imageSrc: '/images/categories/cookies.jpg', productCount: 10 },
      { id: 'ct4', slug: 'bakery', name: 'Bakery', imagePlaceholder: 'BAKERY', imageSrc: '/images/categories/bakery.jpg', productCount: 7 },
      { id: 'ct5', slug: 'dry-fruits', name: 'Dry Fruits', imagePlaceholder: 'DRY FRUITS', imageSrc: '/images/categories/dry-fruits.jpg', productCount: 6 },
      { id: 'ct6', slug: 'chocolates', name: 'Chocolates', imagePlaceholder: 'CHOCOLATES', imageSrc: '/images/categories/chocolates.jpg', productCount: 5 },
      { id: 'ct7', slug: 'snacks', name: 'Snacks', imagePlaceholder: 'SNACKS', imageSrc: '/images/categories/snacks.jpg', productCount: 9 },
      { id: 'ct8', slug: 'hampers', name: 'Hampers', imagePlaceholder: 'HAMPERS', imageSrc: '/images/categories/hampers.jpg', productCount: 7 },
    ],
  });

  await prisma.occasion.createMany({
    data: [
      { id: 'oc1', slug: 'birthday', name: 'Birthday', initial: 'B' },
      { id: 'oc2', slug: 'anniversary', name: 'Anniversary', initial: 'A' },
      { id: 'oc3', slug: 'diwali', name: 'Diwali', initial: 'D' },
      { id: 'oc4', slug: 'housewarming', name: 'Housewarming', initial: 'H' },
      { id: 'oc5', slug: 'corporate', name: 'Corporate', initial: 'C' },
      { id: 'oc6', slug: 'baby-shower', name: 'Baby Shower', initial: 'B' },
      { id: 'oc7', slug: 'wedding', name: 'Wedding', initial: 'W' },
      { id: 'oc8', slug: 'thank-you', name: 'Thank You', initial: 'T' },
    ],
  });

  await prisma.collection.createMany({
    data: [
      { id: 'cl1', slug: 'diwali-gifting-edit', title: 'Diwali Gifting Edit', description: 'Festive favourites — dry-fruit laddoos, curated hampers and spiced chai — ready to gift.', occasionId: 'oc3' },
      { id: 'cl2', slug: 'corporate-gifting-picks', title: 'Corporate Gifting Picks', description: 'Bulk-friendly, shelf-stable picks that travel well for client and team gifting.', occasionId: 'oc5' },
    ],
  });

  // Note: CollectionProduct rows are created after Product seeding below
  // (they FK to products that don't exist yet at this point in the script).

  // -------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------
  console.log('Seeding products...');

  interface ProductSeed {
    id: string;
    slug: string;
    vendorId: string;
    name: string;
    categoryId: string;
    featured?: boolean;
    occasionIds: string[];
    dietary: ('vegetarian' | 'vegan' | 'gluten_free' | 'sugar_free' | 'contains_nuts')[];
    images: { placeholder: string; src?: string; ratio: string }[];
    weightOptions: { sku: string; label: string; price: number; mrp: number; stock: number }[];
    defaultWeightSku: string;
    rating: number;
    reviewCount: number;
    tags: ('Bestseller' | 'New' | 'Festive' | 'Curated')[];
    isPackaged: boolean;
    cashbackPct: number;
    description: string;
    ingredients?: string;
    shelfLife?: string;
    storageInstructions?: string;
    madeIn?: string;
  }

  const productSeeds: ProductSeed[] = [
    {
      id: 'pr1', slug: 'mango-thokku-pickle', vendorId: 'vd1', name: 'Mango Thokku Pickle', categoryId: 'ct1', featured: true,
      occasionIds: ['oc4', 'oc8'], dietary: ['vegetarian'],
      images: Array.from({ length: 5 }, (_, i) => ({
        placeholder: ['Mango Thokku Pickle product photo', 'Mango Thokku Pickle front view', 'Mango Thokku Pickle open jar', 'Mango Thokku Pickle serving spread', 'Mango Thokku Pickle label view'][i],
        src: '/images/products/mango-thokku-pickle.jpg', ratio: '1/1',
      })),
      weightOptions: [
        { sku: 'mango-thokku-pickle-250g', label: '250 g', price: 249, mrp: 299, stock: 40 },
        { sku: 'mango-thokku-pickle-500g', label: '500 g', price: 469, mrp: 549, stock: 25 },
        { sku: 'mango-thokku-pickle-1kg', label: '1 kg', price: 899, mrp: 999, stock: 12 },
      ],
      defaultWeightSku: 'mango-thokku-pickle-250g', rating: 4.8, reviewCount: 128, tags: ['Bestseller'], isPackaged: true, cashbackPct: 5,
      description: 'Slow-cooked strips of raw mango in cold-pressed sesame oil, tempered with mustard, fenugreek and hand-pounded red chilli. Made in small batches in a home kitchen in Andhra — tangy, fiery and deeply aromatic. No added colour, no preservatives; the oil layer on top keeps it fresh naturally.',
      ingredients: 'Raw mango, sesame oil, chilli, mustard, salt', shelfLife: '6 months', storageInstructions: 'Refrigerate after opening', madeIn: 'Guntur, Andhra Pradesh',
    },
    {
      id: 'pr2', slug: 'green-chilli-chutney', vendorId: 'vd2', name: 'Green Chilli Chutney', categoryId: 'ct2',
      occasionIds: ['oc4'], dietary: ['vegetarian'],
      images: [{ placeholder: 'Green Chilli Chutney product photo', src: '/images/products/green-chilli-chutney.jpg', ratio: '1/1' }],
      weightOptions: [{ sku: 'green-chilli-chutney-200g', label: '200 g', price: 189, mrp: 219, stock: 35 }],
      defaultWeightSku: 'green-chilli-chutney-200g', rating: 4.7, reviewCount: 86, tags: ['New'], isPackaged: true, cashbackPct: 5,
      description: 'A fiery, tangy green chilli chutney stone-ground the traditional way — brilliant spooned over dosa, idli or a simple curd rice.',
    },
    {
      id: 'pr3', slug: 'ragi-almond-cookies', vendorId: 'vd3', name: 'Ragi Almond Cookies', categoryId: 'ct3', featured: true,
      occasionIds: ['oc1', 'oc6'], dietary: ['vegetarian', 'gluten_free'],
      images: [{ placeholder: 'Ragi Almond Cookies product photo', src: '/images/products/ragi-almond-cookies.jpg', ratio: '1/1' }],
      weightOptions: [{ sku: 'ragi-almond-cookies-200g', label: '200 g', price: 220, mrp: 260, stock: 50 }],
      defaultWeightSku: 'ragi-almond-cookies-200g', rating: 4.9, reviewCount: 204, tags: [], isPackaged: true, cashbackPct: 5,
      description: 'Wholesome finger-millet cookies studded with almonds, lightly sweetened and baked in small batches for a nutty, crumbly bite.',
    },
    {
      id: 'pr4', slug: 'roasted-makhana', vendorId: 'vd4', name: 'Roasted Makhana', categoryId: 'ct7',
      occasionIds: ['oc5', 'oc8'], dietary: ['vegetarian', 'vegan', 'gluten_free'],
      images: [{ placeholder: 'Roasted Makhana product photo', src: '/images/products/roasted-makhana.jpg', ratio: '1/1' }],
      weightOptions: [{ sku: 'roasted-makhana-100g', label: '100 g', price: 160, mrp: 190, stock: 60 }],
      defaultWeightSku: 'roasted-makhana-100g', rating: 4.6, reviewCount: 92, tags: [], isPackaged: true, cashbackPct: 5,
      description: 'Fox nuts dry-roasted with a light spice dusting — a crunchy, guilt-free snack straight from the pantry.',
    },
    {
      id: 'pr5', slug: 'dark-chocolate-bark', vendorId: 'vd5', name: 'Dark Chocolate Bark', categoryId: 'ct6',
      occasionIds: ['oc2', 'oc1'], dietary: ['vegetarian', 'vegan'],
      images: [{ placeholder: 'Dark Chocolate Bark product photo', src: '/images/products/dark-chocolate-bark.jpg', ratio: '1/1' }],
      weightOptions: [{ sku: 'dark-chocolate-bark-150g', label: '150 g', price: 340, mrp: 399, stock: 30 }],
      defaultWeightSku: 'dark-chocolate-bark-150g', rating: 4.8, reviewCount: 73, tags: [], isPackaged: true, cashbackPct: 5,
      description: 'Single-origin dark chocolate hand-tempered and topped with roasted nuts, snapped into rustic shards.',
    },
    {
      id: 'pr6', slug: 'dry-fruit-laddoo-box', vendorId: 'vd6', name: 'Dry Fruit Laddoo Box', categoryId: 'ct5', featured: true,
      occasionIds: ['oc3', 'oc7'], dietary: ['vegetarian'],
      images: [{ placeholder: 'Dry Fruit Laddoo Box product photo', src: '/images/products/dry-fruit-laddoo-box.jpg', ratio: '1/1' }],
      weightOptions: [{ sku: 'dry-fruit-laddoo-box-400g', label: '400 g', price: 560, mrp: 640, stock: 20 }],
      defaultWeightSku: 'dry-fruit-laddoo-box-400g', rating: 4.9, reviewCount: 140, tags: ['Festive'], isPackaged: true, cashbackPct: 5,
      description: 'A festive assortment of dates, almonds and cashews bound into ghee-rich laddoos — no refined sugar, just dried-fruit sweetness.',
    },
    {
      id: 'pr7', slug: 'masala-chai-blend', vendorId: 'vd7', name: 'Masala Chai Blend', categoryId: 'ct7',
      occasionIds: ['oc4', 'oc8'], dietary: ['vegetarian', 'vegan'],
      images: [{ placeholder: 'Masala Chai Blend product photo', src: '/images/products/masala-chai-blend.jpg', ratio: '1/1' }],
      weightOptions: [{ sku: 'masala-chai-blend-150g', label: '150 g', price: 275, mrp: 310, stock: 45 }],
      defaultWeightSku: 'masala-chai-blend-150g', rating: 4.7, reviewCount: 61, tags: [], isPackaged: true, cashbackPct: 5,
      description: 'A hand-blended CTC tea with cardamom, ginger and clove — brews into a rich, spiced cup every time.',
    },
    {
      id: 'pr8', slug: 'festive-assorted-hamper', vendorId: 'vd8', name: 'Festive Assorted Hamper', categoryId: 'ct8', featured: true,
      occasionIds: ['oc3', 'oc5', 'oc7'], dietary: ['vegetarian'],
      images: [{ placeholder: 'Festive Assorted Hamper product photo', src: '/images/products/festive-assorted-hamper.jpg', ratio: '1/1' }],
      weightOptions: [{ sku: 'festive-assorted-hamper-curated', label: 'Curated', price: 1499, mrp: 1750, stock: 15 }],
      defaultWeightSku: 'festive-assorted-hamper-curated', rating: 4.9, reviewCount: 57, tags: ['Curated'], isPackaged: true, cashbackPct: 5,
      description: 'Our own curated edit of best-selling pickles, bakes and sweets from across the maker community, packed into one gift-ready box.',
    },
  ];

  for (const p of productSeeds) {
    await prisma.product.create({
      data: {
        id: p.id,
        slug: p.slug,
        vendorId: p.vendorId,
        name: p.name,
        categoryId: p.categoryId,
        featured: p.featured ?? false,
        dietary: p.dietary,
        defaultWeightSku: p.defaultWeightSku,
        rating: p.rating,
        reviewCount: p.reviewCount,
        tags: p.tags,
        isPackaged: p.isPackaged,
        cashbackPct: p.cashbackPct,
        description: p.description,
        ingredients: p.ingredients,
        shelfLife: p.shelfLife,
        storageInstructions: p.storageInstructions,
        madeIn: p.madeIn,
        images: { create: p.images.map((img, i) => ({ ...img, sortOrder: i })) },
        weightOptions: { create: p.weightOptions },
        occasions: { create: p.occasionIds.map((occasionId) => ({ occasionId })) },
      },
    });
  }

  await prisma.collectionProduct.createMany({
    data: [
      { collectionId: 'cl1', productId: 'pr6', sortOrder: 0 },
      { collectionId: 'cl1', productId: 'pr8', sortOrder: 1 },
      { collectionId: 'cl1', productId: 'pr7', sortOrder: 2 },
      { collectionId: 'cl2', productId: 'pr8', sortOrder: 0 },
      { collectionId: 'cl2', productId: 'pr6', sortOrder: 1 },
      { collectionId: 'cl2', productId: 'pr5', sortOrder: 2 },
      { collectionId: 'cl2', productId: 'pr4', sortOrder: 3 },
    ],
  });

  // -------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------
  console.log('Seeding reviews...');

  const reviewSeeds = [
    { id: 'rv1', targetType: 'product', targetId: 'pr1', userId: 'usr-101', userName: 'Priya Raman', rating: 5, title: 'Tastes just like homemade', body: 'Ordered the 250g to try and went back for the 1kg jar within a week. The oil layer on top is exactly how my grandmother used to make it — properly tangy and not overly sweet like the store-bought ones.', createdAt: '2026-06-02', helpfulCount: 24, verifiedPurchase: true },
    { id: 'rv2', targetType: 'product', targetId: 'pr1', userId: 'usr-102', userName: 'Karthik Subramaniam', rating: 5, title: 'Fiery and fresh', body: 'Really good heat level without losing the mango flavour. Packaging arrived well-sealed even in the summer heat. Will reorder for sure.', createdAt: '2026-05-18', helpfulCount: 11, verifiedPurchase: true },
    { id: 'rv3', targetType: 'product', targetId: 'pr1', userId: 'usr-103', userName: 'Divya Menon', rating: 4, body: 'Good pickle, slightly more oily than I expected but the taste makes up for it. Would love a low-oil variant.', createdAt: '2026-04-27', helpfulCount: 6, verifiedPurchase: false },
    { id: 'rv4', targetType: 'product', targetId: 'pr2', userId: 'usr-104', userName: 'Sanjana Rao', rating: 5, title: 'Stone-ground taste, no shortcuts', body: 'You can genuinely taste the difference from a mixer-ground chutney. Perfect with dosa and even as a sandwich spread.', createdAt: '2026-06-10', helpfulCount: 9, verifiedPurchase: true },
    { id: 'rv5', targetType: 'product', targetId: 'pr2', userId: 'usr-105', userName: 'Arjun Nair', rating: 4, body: 'Very fresh and tangy. A touch too spicy for my kids but I love it with curd rice.', createdAt: '2026-05-02', helpfulCount: 4, verifiedPurchase: true },
    { id: 'rv6', targetType: 'product', targetId: 'pr3', userId: 'usr-106', userName: 'Meenal Deshpande', rating: 5, title: 'Crumbly, nutty, not too sweet', body: "Bought these as a healthier snack for my kids' school box and ended up finishing half the box myself. Great crunch from the almonds.", createdAt: '2026-06-15', helpfulCount: 18, verifiedPurchase: true },
    { id: 'rv7', targetType: 'product', targetId: 'pr3', userId: 'usr-107', userName: 'Rohan Bhatia', rating: 5, body: "Best gluten-free cookie I've had from a small-batch maker. Ordering again for Diwali gifting.", createdAt: '2026-05-29', helpfulCount: 7, verifiedPurchase: true },
    { id: 'rv8', targetType: 'product', targetId: 'pr4', userId: 'usr-108', userName: 'Ishita Ghosh', rating: 4, title: 'Great guilt-free snack', body: 'Light, crunchy and the spice dusting is well-balanced — not overpowering. Would prefer a bigger pack size option.', createdAt: '2026-06-05', helpfulCount: 5, verifiedPurchase: true },
    { id: 'rv9', targetType: 'product', targetId: 'pr4', userId: 'usr-109', userName: 'Naveen Kumar', rating: 5, body: "My go-to evening snack now. Fresh every time I've ordered.", createdAt: '2026-04-30', helpfulCount: 3, verifiedPurchase: false },
    { id: 'rv10', targetType: 'product', targetId: 'pr5', userId: 'usr-110', userName: 'Ayesha Khan', rating: 5, title: 'Rich and not too sweet', body: 'Single-origin flavour really comes through. The roasted nuts add a lovely crunch. Gifted a box and it was a hit.', createdAt: '2026-06-20', helpfulCount: 14, verifiedPurchase: true },
    { id: 'rv11', targetType: 'product', targetId: 'pr5', userId: 'usr-111', userName: 'Vikram Shetty', rating: 4, body: 'Good quality chocolate, arrived slightly melted in transit during summer but still tasted great after a quick chill.', createdAt: '2026-05-11', helpfulCount: 6, verifiedPurchase: true },
    { id: 'rv12', targetType: 'product', targetId: 'pr6', userId: 'usr-112', userName: 'Ritu Agarwal', rating: 5, title: 'Perfect festive gift', body: 'Ordered a dozen boxes for Diwali gifting to clients — everyone loved them. No refined sugar but still perfectly sweet.', createdAt: '2026-07-01', helpfulCount: 21, verifiedPurchase: true },
    { id: 'rv13', targetType: 'product', targetId: 'pr6', userId: 'usr-113', userName: 'Manoj Pillai', rating: 5, body: 'Reminds me of laddoos my dadi used to make. Generous with the dry fruits, not stingy at all.', createdAt: '2026-06-08', helpfulCount: 10, verifiedPurchase: true },
    { id: 'rv14', targetType: 'product', targetId: 'pr7', userId: 'usr-114', userName: 'Sneha Joshi', rating: 5, title: 'Brews a proper strong cup', body: "The cardamom and clove balance is spot on. Doesn't turn bitter even with a long boil, unlike other blends I've tried.", createdAt: '2026-06-12', helpfulCount: 8, verifiedPurchase: true },
    { id: 'rv15', targetType: 'product', targetId: 'pr7', userId: 'usr-115', userName: 'Farhan Ali', rating: 4, body: "Good aroma, slightly less strong than I expected but still one of the better packaged chai blends I've had.", createdAt: '2026-05-20', helpfulCount: 3, verifiedPurchase: false },
    { id: 'rv16', targetType: 'product', targetId: 'pr8', userId: 'usr-116', userName: 'Lakshmi Venkatesh', rating: 5, title: 'Beautifully packed, great variety', body: 'Sent this to my in-laws for Diwali and they were thrilled — good mix of pickles, bakes and sweets, and the packaging felt premium.', createdAt: '2026-07-05', helpfulCount: 17, verifiedPurchase: true },
    { id: 'rv17', targetType: 'product', targetId: 'pr8', userId: 'usr-117', userName: 'Aditya Kapoor', rating: 5, body: 'Ordered several for corporate gifting — arrived on time and the curation felt thoughtful rather than generic.', createdAt: '2026-06-25', helpfulCount: 12, verifiedPurchase: true },
    { id: 'rv18', targetType: 'vendor', targetId: 'vd1', userId: 'usr-118', userName: 'Priya Raman', rating: 5, title: 'Consistent quality every order', body: "Been ordering from Anjali's Kitchen for over a year now — the pickles never disappoint and the packaging keeps improving.", createdAt: '2026-06-03', helpfulCount: 15, verifiedPurchase: true },
    { id: 'rv19', targetType: 'vendor', targetId: 'vd1', userId: 'usr-119', userName: 'Karthik Subramaniam', rating: 5, body: 'Genuinely home-style flavours. Delivery has always been prompt too.', createdAt: '2026-05-14', helpfulCount: 6, verifiedPurchase: true },
    { id: 'rv20', targetType: 'vendor', targetId: 'vd2', userId: 'usr-120', userName: 'Sanjana Rao', rating: 5, body: "Meera's chutneys are consistently fresh — you can tell they're made in small batches.", createdAt: '2026-06-11', helpfulCount: 7, verifiedPurchase: true },
    { id: 'rv21', targetType: 'vendor', targetId: 'vd3', userId: 'usr-121', userName: 'Rohan Bhatia', rating: 5, title: 'Great for healthier baking', body: "Home Batch's millet-based cookies are a staple in our house now. Love that they keep experimenting with new flavours.", createdAt: '2026-06-16', helpfulCount: 9, verifiedPurchase: true },
    { id: 'rv22', targetType: 'vendor', targetId: 'vd4', userId: 'usr-122', userName: 'Ishita Ghosh', rating: 4, body: 'Reliable snack maker, would like to see more flavour variety over time.', createdAt: '2026-05-05', helpfulCount: 3, verifiedPurchase: false },
    { id: 'rv23', targetType: 'vendor', targetId: 'vd5', userId: 'usr-123', userName: 'Ayesha Khan', rating: 5, body: "Cocoa Homemade's chocolate is easily on par with premium retail brands, at a fraction of the price.", createdAt: '2026-06-21', helpfulCount: 13, verifiedPurchase: true },
    { id: 'rv24', targetType: 'vendor', targetId: 'vd6', userId: 'usr-124', userName: 'Ritu Agarwal', rating: 5, title: 'Family recipes done right', body: "Dadi's Recipe never misses for festive orders. The laddoos and dry-fruit mixes taste properly traditional.", createdAt: '2026-07-02', helpfulCount: 19, verifiedPurchase: true },
    { id: 'rv25', targetType: 'vendor', targetId: 'vd7', userId: 'usr-125', userName: 'Sneha Joshi', rating: 4, body: 'Good quality Darjeeling blends, packaging could be a little more airtight for longer shelf life.', createdAt: '2026-05-22', helpfulCount: 4, verifiedPurchase: true },
    { id: 'rv26', targetType: 'vendor', targetId: 'vd8', userId: 'usr-126', userName: 'Lakshmi Venkatesh', rating: 5, title: 'The curation is always spot on', body: "Homekrafted's own hampers are consistently well put-together — good mix of makers and never feels like leftover stock.", createdAt: '2026-07-06', helpfulCount: 20, verifiedPurchase: true },
    { id: 'rv27', targetType: 'vendor', targetId: 'vd8', userId: 'usr-127', userName: 'Aditya Kapoor', rating: 5, body: 'Used them for bulk corporate gifting twice now — smooth process both times.', createdAt: '2026-06-27', helpfulCount: 11, verifiedPurchase: true },
    { id: 'rv28', targetType: 'product', targetId: 'pr1', userId: 'usr-201', userName: 'Amit Verma', rating: 1, title: 'Never got my order!!', body: 'This has nothing to do with the pickle — delivery partner issue, please contact support directly instead of leaving it here. Removing/edit requested.', createdAt: '2026-07-08', helpfulCount: 0, verifiedPurchase: false, flagged: true },
    { id: 'rv29', targetType: 'product', targetId: 'pr5', userId: 'usr-202', userName: 'spamuser99', rating: 5, title: 'Check out my store instead!!', body: 'Great product but also — visit my-competing-shop dot example for better prices on similar items, link in bio.', createdAt: '2026-07-14', helpfulCount: 1, verifiedPurchase: false, flagged: true },
    { id: 'rv30', targetType: 'vendor', targetId: 'vd6', userId: 'usr-203', userName: 'Rakesh T.', rating: 2, body: "Reported by the vendor as an apparent duplicate/competitor review — content doesn't reference an actual order.", createdAt: '2026-07-19', helpfulCount: 0, verifiedPurchase: false, flagged: true },
  ] as const;

  for (const r of reviewSeeds) {
    await prisma.review.create({
      data: {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        userId: r.userId,
        userName: r.userName,
        rating: r.rating,
        title: 'title' in r ? r.title : undefined,
        body: r.body,
        createdAt: new Date(r.createdAt),
        helpfulCount: r.helpfulCount,
        verifiedPurchase: r.verifiedPurchase,
        flagged: 'flagged' in r ? r.flagged : false,
      },
    });
  }

  // -------------------------------------------------------------------
  // Cart, wishlist, hamper boxes
  // -------------------------------------------------------------------
  console.log('Seeding cart, wishlist, hamper boxes...');

  await prisma.cart.create({
    data: {
      id: 'cart-demo',
      userId: consumer.id,
      items: {
        create: [
          { id: 'ci1', productId: 'pr1', sku: 'mango-thokku-pickle-250g', quantity: 1 },
          { id: 'ci2', productId: 'pr6', sku: 'dry-fruit-laddoo-box-400g', quantity: 1 },
        ],
      },
    },
  });

  await prisma.wishlist.create({
    data: {
      id: 'wishlist-demo',
      userId: consumer.id,
      items: { create: [{ productId: 'pr5' }, { productId: 'pr8' }] },
    },
  });

  await prisma.hamperBox.createMany({
    data: [
      { id: 'hb1', name: 'Petite', maxItems: 3, price: 399, itemsLabel: 'Up to 3 items' },
      { id: 'hb2', name: 'Signature', maxItems: 5, price: 699, itemsLabel: 'Up to 5 items' },
      { id: 'hb3', name: 'Grand', maxItems: 8, price: 1199, itemsLabel: 'Up to 8 items' },
    ],
  });

  // -------------------------------------------------------------------
  // Sellers + payouts
  // -------------------------------------------------------------------
  console.log('Seeding sellers + payouts...');

  const sl1 = await prisma.seller.create({
    data: { id: 'sl1', userId: sellerUser.id, type: 'maker', vendorId: 'vd1', displayName: "Anjali's Kitchen", status: 'approved', createdAt: new Date('2023-11-02') },
  });
  const sl2 = await prisma.seller.create({
    data: { id: 'sl2', userId: laundryPartnerUser.id, type: 'laundry', displayName: 'Fresh Fold Laundry Co.', status: 'approved', createdAt: new Date('2024-02-10'), rating: 4.7, reviewCount: 214 },
  });
  const sl3 = await prisma.seller.create({
    data: { id: 'sl3', userId: snackSellerUser.id, type: 'snack', displayName: "Meera's Snack Box", status: 'approved', createdAt: new Date('2024-05-20'), rating: 4.5, reviewCount: 96 },
  });

  const payoutSeeds = [
    { id: 'po1', sellerId: sl1.id, amount: 8420, periodStart: '2026-06-16', periodEnd: '2026-06-30', status: 'paid', paidAt: '2026-07-03' },
    { id: 'po2', sellerId: sl1.id, amount: 9860, periodStart: '2026-07-01', periodEnd: '2026-07-15', status: 'paid', paidAt: '2026-07-18' },
    { id: 'po3', sellerId: sl1.id, amount: 6210, periodStart: '2026-07-16', periodEnd: '2026-07-31', status: 'pending', paidAt: null },
    { id: 'po4', sellerId: sl2.id, amount: 11340, periodStart: '2026-06-16', periodEnd: '2026-06-30', status: 'paid', paidAt: '2026-07-03' },
    { id: 'po5', sellerId: sl2.id, amount: 12980, periodStart: '2026-07-01', periodEnd: '2026-07-15', status: 'paid', paidAt: '2026-07-18' },
    { id: 'po6', sellerId: sl2.id, amount: 5460, periodStart: '2026-07-16', periodEnd: '2026-07-31', status: 'pending', paidAt: null },
    { id: 'po7', sellerId: sl3.id, amount: 4180, periodStart: '2026-06-16', periodEnd: '2026-06-30', status: 'paid', paidAt: '2026-07-03' },
    { id: 'po8', sellerId: sl3.id, amount: 5020, periodStart: '2026-07-01', periodEnd: '2026-07-15', status: 'paid', paidAt: '2026-07-18' },
    { id: 'po9', sellerId: sl3.id, amount: 2340, periodStart: '2026-07-16', periodEnd: '2026-07-31', status: 'pending', paidAt: null },
  ] as const;

  for (const po of payoutSeeds) {
    await prisma.payout.create({
      data: { id: po.id, sellerId: po.sellerId, amount: po.amount, periodStart: new Date(po.periodStart), periodEnd: new Date(po.periodEnd), status: po.status, paidAt: po.paidAt ? new Date(po.paidAt) : null },
    });
  }

  // -------------------------------------------------------------------
  // Orders (+ items + shipments)
  // -------------------------------------------------------------------
  console.log('Seeding orders...');

  interface OrderSeed {
    id: string;
    orderNumber: string;
    status: string;
    items: { id: string; productId?: string; sku?: string; name: string; quantity: number; price: number; addressId: string; giftWrap: boolean }[];
    shipments: { addressId: string; deliveryDate?: string }[];
    placedAt: string;
    subtotal: number;
    shippingFee: number;
    total: number;
    walletApplied: number;
    cashbackEarned: number;
    refundStatus: string;
    paymentMethod: string;
  }

  const orderSeeds: OrderSeed[] = [
    { id: 'ord-seed-1987', orderNumber: 'HK1987', status: 'delivered', items: [{ id: 'oi-seed-1987-1', productId: 'pr8', sku: 'festive-assorted-hamper-curated', name: 'Festive Assorted Hamper', quantity: 1, price: 1499, addressId: 'addr-demo-1', giftWrap: false }], shipments: [{ addressId: 'addr-demo-1', deliveryDate: '2026-07-05' }], placedAt: '2026-07-02T14:10:00+05:30', subtotal: 1499, shippingFee: 0, total: 1499, walletApplied: 1499, cashbackEarned: 75, refundStatus: 'none', paymentMethod: 'wallet' },
    { id: 'ord-seed-2015', orderNumber: 'HK2015', status: 'delivered', items: [{ id: 'oi-seed-2015-1', productId: 'pr5', sku: 'dark-chocolate-bark-150g', name: 'Dark Chocolate Bark', quantity: 2, price: 340, addressId: 'addr-demo-1', giftWrap: false }, { id: 'oi-seed-2015-2', productId: 'pr4', sku: 'roasted-makhana-100g', name: 'Roasted Makhana', quantity: 1, price: 160, addressId: 'addr-demo-1', giftWrap: false }], shipments: [{ addressId: 'addr-demo-1', deliveryDate: '2026-07-13' }], placedAt: '2026-07-10T10:32:00+05:30', subtotal: 840, shippingFee: 49, total: 889, walletApplied: 0, cashbackEarned: 42, refundStatus: 'none', paymentMethod: 'razorpay' },
    { id: 'ord-seed-2020', orderNumber: 'HK2020', status: 'shipped', items: [{ id: 'oi-seed-2020-1', productId: 'pr6', sku: 'dry-fruit-laddoo-box-400g', name: 'Dry Fruit Laddoo Box', quantity: 1, price: 560, addressId: 'addr-demo-2', giftWrap: true }], shipments: [{ addressId: 'addr-demo-2', deliveryDate: '2026-07-27' }], placedAt: '2026-07-15T16:45:00+05:30', subtotal: 560, shippingFee: 49, total: 609, walletApplied: 609, cashbackEarned: 28, refundStatus: 'none', paymentMethod: 'wallet' },
    { id: 'ord-seed-2031', orderNumber: 'HK2031', status: 'cancelled', items: [{ id: 'oi-seed-2031-1', productId: 'pr4', sku: 'roasted-makhana-100g', name: 'Roasted Makhana', quantity: 1, price: 160, addressId: 'addr-demo-1', giftWrap: false }], shipments: [{ addressId: 'addr-demo-1' }], placedAt: '2026-07-17T09:15:00+05:30', subtotal: 160, shippingFee: 49, total: 209, walletApplied: 0, cashbackEarned: 0, refundStatus: 'refunded', paymentMethod: 'razorpay' },
    { id: 'ord-seed-2038', orderNumber: 'HK2038', status: 'packed', items: [{ id: 'oi-seed-2038-1', productId: 'pr7', sku: 'masala-chai-blend-150g', name: 'Masala Chai Blend', quantity: 2, price: 275, addressId: 'addr-demo-3', giftWrap: false }], shipments: [{ addressId: 'addr-demo-3', deliveryDate: '2026-07-21' }], placedAt: '2026-07-18T08:00:00+05:30', subtotal: 550, shippingFee: 49, total: 599, walletApplied: 599, cashbackEarned: 28, refundStatus: 'none', paymentMethod: 'wallet' },
    { id: 'ord-seed-2039', orderNumber: 'HK2039', status: 'placed', items: [{ id: 'oi-seed-2039-1', productId: 'pr1', sku: 'mango-thokku-pickle-500g', name: 'Mango Thokku Pickle', quantity: 2, price: 469, addressId: 'addr-demo-1', giftWrap: false }], shipments: [{ addressId: 'addr-demo-1', deliveryDate: '2026-07-29' }], placedAt: '2026-07-25T11:20:00+05:30', subtotal: 938, shippingFee: 49, total: 987, walletApplied: 0, cashbackEarned: 47, refundStatus: 'none', paymentMethod: 'razorpay' },
    { id: 'ord-seed-2040', orderNumber: 'HK2040', status: 'packed', items: [{ id: 'oi-seed-2040-1', productId: 'pr1', sku: 'mango-thokku-pickle-250g', name: 'Mango Thokku Pickle', quantity: 1, price: 249, addressId: 'addr-demo-2', giftWrap: true }, { id: 'oi-seed-2040-2', productId: 'pr3', sku: 'ragi-almond-cookies-200g', name: 'Ragi Almond Cookies', quantity: 1, price: 220, addressId: 'addr-demo-2', giftWrap: true }], shipments: [{ addressId: 'addr-demo-2', deliveryDate: '2026-07-27' }], placedAt: '2026-07-22T09:05:00+05:30', subtotal: 469, shippingFee: 49, total: 518, walletApplied: 0, cashbackEarned: 23, refundStatus: 'none', paymentMethod: 'razorpay' },
    { id: 'ord-seed-2041', orderNumber: 'HK2041', status: 'shipped', items: [{ id: 'oi-seed-2041-1', productId: 'pr1', sku: 'mango-thokku-pickle-1kg', name: 'Mango Thokku Pickle', quantity: 1, price: 899, addressId: 'addr-demo-1', giftWrap: false }], shipments: [{ addressId: 'addr-demo-1', deliveryDate: '2026-07-26' }], placedAt: '2026-07-20T15:40:00+05:30', subtotal: 899, shippingFee: 0, total: 899, walletApplied: 899, cashbackEarned: 45, refundStatus: 'none', paymentMethod: 'wallet' },
    { id: 'ord-seed-2043', orderNumber: 'HK2043', status: 'confirmed', items: [{ id: 'oi-seed-2043-1', productId: 'pr3', sku: 'ragi-almond-cookies-200g', name: 'Ragi Almond Cookies', quantity: 3, price: 220, addressId: 'addr-demo-1', giftWrap: false }, { id: 'oi-seed-2043-2', productId: 'pr2', sku: 'green-chilli-chutney-200g', name: 'Green Chilli Chutney', quantity: 1, price: 189, addressId: 'addr-demo-1', giftWrap: false }], shipments: [{ addressId: 'addr-demo-1', deliveryDate: '2026-07-22' }], placedAt: '2026-07-18T18:30:00+05:30', subtotal: 849, shippingFee: 49, total: 898, walletApplied: 0, cashbackEarned: 42, refundStatus: 'none', paymentMethod: 'razorpay' },
  ];

  for (const o of orderSeeds) {
    await prisma.order.create({
      data: {
        id: o.id,
        orderNumber: o.orderNumber,
        userId: consumer.id,
        status: o.status as never,
        shippingAddressIds: [...new Set(o.items.map((i) => i.addressId))],
        placedAt: new Date(o.placedAt),
        subtotal: o.subtotal,
        shippingFee: o.shippingFee,
        total: o.total,
        walletApplied: o.walletApplied,
        cashbackEarned: o.cashbackEarned,
        refundStatus: o.refundStatus as never,
        paymentMethod: o.paymentMethod as never,
        items: { create: o.items.map(({ id, ...rest }) => ({ id, ...rest })) },
        shipments: {
          create: o.shipments.map((s) => ({ addressId: s.addressId, deliveryDate: s.deliveryDate ? new Date(s.deliveryDate) : null })),
        },
      },
    });
  }

  // -------------------------------------------------------------------
  // Laundry
  // -------------------------------------------------------------------
  console.log('Seeding laundry...');

  // Availability rolls forward from "tomorrow" relative to the seed run, so
  // pickup/delivery slots are always in the future — never stale past dates.
  // Ids stay ld1..ld4 (bookings/slots reference them); only the dates move.
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Anchor at local noon (not midnight) so the stored UTC timestamptz stays
  // on the same calendar day as the "Wed 29 Jul" label in every timezone,
  // instead of slipping a day back for +05:30 (IST) and other +offsets.
  const laundryDayBase = new Date();
  laundryDayBase.setHours(12, 0, 0, 0);
  await prisma.laundryDay.createMany({
    data: [0, 1, 2, 3].map((offset, i) => {
      const d = new Date(laundryDayBase);
      d.setDate(d.getDate() + offset + 1); // start tomorrow
      return {
        id: `ld${i + 1}`,
        day: dayNames[d.getDay()],
        date: `${d.getDate()} ${monthNames[d.getMonth()]}`,
        isoDate: d,
      };
    }),
  });

  await prisma.laundrySlot.createMany({
    data: [
      { id: 'lt1', label: '9 – 11 AM' },
      { id: 'lt2', label: '1 – 3 PM' },
      { id: 'lt3', label: '5 – 7 PM' },
    ],
  });

  await prisma.laundryService.createMany({
    data: [
      { id: 'ls1', slug: 'wash-fold', name: 'Wash & Fold', description: 'Everyday laundry, per kg', pricingModel: 'per_kg', price: 79, unitLabel: 'kg', priceIsFrom: false, priceLabel: '₹79 / kg', iconPlaceholder: 'WASHER' },
      { id: 'ls2', slug: 'dry-clean', name: 'Dry Clean', description: 'Delicates & formals', pricingModel: 'per_item', price: 99, unitLabel: 'item', priceIsFrom: true, priceLabel: 'from ₹99', iconPlaceholder: 'HANGER' },
      { id: 'ls3', slug: 'steam-ironing', name: 'Steam Ironing', description: 'Crisp & crease-free', pricingModel: 'per_item', price: 15, unitLabel: 'pc', priceIsFrom: false, priceLabel: '₹15 / pc', iconPlaceholder: 'IRON' },
      { id: 'ls4', slug: 'home-cleaning', name: 'Home Cleaning', description: 'Deep clean, per room', pricingModel: 'per_hour', price: 499, unitLabel: 'hr', priceIsFrom: true, priceLabel: 'from ₹499', iconPlaceholder: 'CLEANING' },
    ],
  });

  interface BookingSeed {
    id: string;
    bookingNumber: string;
    line: { serviceId: string; estimatedWeightKg?: number; itemCount?: number; estimatedHours?: number; estimatedPrice: number };
    pickup: { date: string; slotId: string };
    delivery: { date: string; slotId: string };
    addressId: string;
    paymentMethod: string;
    status: string;
    estimatedTotal: number;
    walletCashback?: number;
    createdAt: string;
  }

  const bookingSeeds: BookingSeed[] = [
    { id: 'lb-seed-1020', bookingNumber: 'LB1020', line: { serviceId: 'ls1', estimatedWeightKg: 5, estimatedPrice: 395 }, pickup: { date: '2026-07-06', slotId: 'lt1' }, delivery: { date: '2026-07-07', slotId: 'lt2' }, addressId: 'addr-demo-1', paymentMethod: 'wallet', status: 'delivered', estimatedTotal: 395, walletCashback: 20, createdAt: '2026-07-05T08:00:00+05:30' },
    { id: 'lb-seed-1028', bookingNumber: 'LB1028', line: { serviceId: 'ls3', itemCount: 12, estimatedPrice: 180 }, pickup: { date: '2026-07-13', slotId: 'lt1' }, delivery: { date: '2026-07-14', slotId: 'lt3' }, addressId: 'addr-demo-2', paymentMethod: 'cod', status: 'delivered', estimatedTotal: 180, createdAt: '2026-07-12T09:30:00+05:30' },
    { id: 'lb-seed-1035', bookingNumber: 'LB1035', line: { serviceId: 'ls4', estimatedHours: 3, estimatedPrice: 1497 }, pickup: { date: '2026-07-20', slotId: 'lt2' }, delivery: { date: '2026-07-21', slotId: 'lt3' }, addressId: 'addr-demo-1', paymentMethod: 'wallet', status: 'out_for_delivery', estimatedTotal: 1497, walletCashback: 75, createdAt: '2026-07-19T07:45:00+05:30' },
    { id: 'lb-seed-1041', bookingNumber: 'LB1041', line: { serviceId: 'ls2', itemCount: 4, estimatedPrice: 396 }, pickup: { date: '2026-07-22', slotId: 'lt1' }, delivery: { date: '2026-07-23', slotId: 'lt2' }, addressId: 'addr-demo-3', paymentMethod: 'razorpay', status: 'cancelled', estimatedTotal: 396, createdAt: '2026-07-21T12:00:00+05:30' },
    { id: 'lb-seed-1044', bookingNumber: 'LB1044', line: { serviceId: 'ls1', estimatedWeightKg: 6, estimatedPrice: 474 }, pickup: { date: '2026-07-25', slotId: 'lt1' }, delivery: { date: '2026-07-26', slotId: 'lt2' }, addressId: 'addr-demo-1', paymentMethod: 'wallet', status: 'scheduled', estimatedTotal: 474, walletCashback: 24, createdAt: '2026-07-24T10:15:00+05:30' },
    { id: 'lb-seed-1045', bookingNumber: 'LB1045', line: { serviceId: 'ls3', itemCount: 8, estimatedPrice: 120 }, pickup: { date: '2026-07-26', slotId: 'lt1' }, delivery: { date: '2026-07-27', slotId: 'lt2' }, addressId: 'addr-demo-2', paymentMethod: 'cod', status: 'picked_up', estimatedTotal: 120, createdAt: '2026-07-25T09:00:00+05:30' },
  ];

  for (const b of bookingSeeds) {
    await prisma.laundryBooking.create({
      data: {
        id: b.id,
        bookingNumber: b.bookingNumber,
        userId: consumer.id,
        pickupDate: new Date(b.pickup.date),
        pickupSlotId: b.pickup.slotId,
        deliveryDate: new Date(b.delivery.date),
        deliverySlotId: b.delivery.slotId,
        addressId: b.addressId,
        photos: [],
        paymentMethod: b.paymentMethod as never,
        status: b.status as never,
        estimatedTotal: b.estimatedTotal,
        walletCashback: b.walletCashback,
        createdAt: new Date(b.createdAt),
        partnerId: sl2.id,
        lines: { create: [b.line] },
      },
    });
  }

  // -------------------------------------------------------------------
  // Snacks + snack list + snack orders + meal promo
  // -------------------------------------------------------------------
  console.log('Seeding snacks...');

  const snackSeeds = [
    { id: 'sk1', slug: 'masala-mathri', name: 'Masala Mathri', description: 'Crispy, flaky, ghee-fried', price: 120, category: 'savoury', diet: 'veg', imagePlaceholder: 'MATHRI', imageSrc: '/images/snacks/masala-mathri.jpg' },
    { id: 'sk2', slug: 'roasted-chivda', name: 'Roasted Chivda', description: 'Light poha namkeen mix', price: 90, category: 'namkeen', diet: 'veg', imagePlaceholder: 'CHIVDA', imageSrc: '/images/snacks/roasted-chivda.jpg' },
    { id: 'sk3', slug: 'besan-ladoo', name: 'Besan Ladoo', description: 'Slow-roasted, 6 pcs', price: 160, category: 'sweet', diet: 'veg', imagePlaceholder: 'LADOO', imageSrc: '/images/snacks/besan-ladoo.jpg' },
    { id: 'sk4', slug: 'chakli-spirals', name: 'Chakli Spirals', description: 'Rice & lentil, hand-rolled', price: 110, category: 'namkeen', diet: 'veg', imagePlaceholder: 'CHAKLI', imageSrc: '/images/snacks/chakli-spirals.jpg' },
    { id: 'sk5', slug: 'nankhatai-cookies', name: 'Nankhatai Cookies', description: 'Cardamom shortbread, 8 pcs', price: 140, category: 'baked', diet: 'veg', imagePlaceholder: 'NANKHATAI', imageSrc: '/images/snacks/nankhatai-cookies.jpg' },
    { id: 'sk6', slug: 'spicy-peanut-masala', name: 'Spicy Peanut Masala', description: 'Roasted, tangy coating', price: 80, category: 'savoury', diet: 'veg', imagePlaceholder: 'PEANUTS', imageSrc: '/images/snacks/spicy-peanut-masala.jpg' },
  ] as const;

  for (const s of snackSeeds) {
    await prisma.snack.create({ data: { ...s, sellerId: sl3.id, available: true } });
  }

  await prisma.snackList.create({
    data: {
      id: 'snacklist-demo',
      userId: consumer.id,
      estimateTotal: 360,
      whatsappPayload: "Hi Homekrafted! I'd like to order:\n1x Masala Mathri\n1x Besan Ladoo\n1x Spicy Peanut Masala\n\nEstimated total: ₹360",
      status: 'received',
      createdAt: new Date('2026-07-23T10:00:00+05:30'),
      items: {
        create: [
          { snackId: 'sk1', name: 'Masala Mathri', quantity: 1, price: 120 },
          { snackId: 'sk3', name: 'Besan Ladoo', quantity: 1, price: 160 },
          { snackId: 'sk6', name: 'Spicy Peanut Masala', quantity: 1, price: 80 },
        ],
      },
    },
  });

  const snackOrderSeeds = [
    { id: 'sko1', customerName: 'Priya Menon', customerPhone: '+919876522110', items: [{ snackId: 'sk1', name: 'Masala Mathri', quantity: 2, price: 120 }, { snackId: 'sk3', name: 'Besan Ladoo', quantity: 1, price: 160 }], total: 400, status: 'delivered', createdAt: '2026-07-23T11:20:00+05:30' },
    { id: 'sko2', customerName: 'Arjun Rao', customerPhone: '+919034487652', items: [{ snackId: 'sk2', name: 'Roasted Chivda', quantity: 3, price: 90 }], total: 270, status: 'out_for_delivery', createdAt: '2026-07-24T16:40:00+05:30' },
    { id: 'sko3', customerName: 'Divya Shenoy', customerPhone: '+919654019283', items: [{ snackId: 'sk5', name: 'Nankhatai Cookies', quantity: 1, price: 140 }, { snackId: 'sk6', name: 'Spicy Peanut Masala', quantity: 2, price: 80 }], total: 300, status: 'accepted', createdAt: '2026-07-25T09:10:00+05:30' },
    { id: 'sko4', customerName: 'Karthik Iyer', customerPhone: '+919900155678', items: [{ snackId: 'sk4', name: 'Chakli Spirals', quantity: 4, price: 110 }], total: 440, status: 'received', createdAt: '2026-07-25T18:05:00+05:30' },
  ] as const;

  for (const so of snackOrderSeeds) {
    await prisma.snackOrder.create({
      data: {
        id: so.id,
        sellerId: sl3.id,
        customerName: so.customerName,
        customerPhone: so.customerPhone,
        total: so.total,
        channel: 'whatsapp',
        status: so.status,
        createdAt: new Date(so.createdAt),
        items: { create: so.items.map((i) => ({ ...i })) },
      },
    });
  }

  await prisma.mealPromo.create({
    data: {
      id: 'meal-promo-1',
      title: 'Food Delivery',
      description: 'Hot home-cooked meals from local kitchens with real-time order & rider tracking — available only on the Homekrafted app.',
      imagePlaceholder: 'FOOD_DELIVERY_HERO',
      imageSrc: '/images/site/food-delivery.jpg',
      appStoreUrl: '#',
      playStoreUrl: '#',
      qrCodePlaceholder: 'APP_INSTALL_QR',
    },
  });

  // -------------------------------------------------------------------
  // Notifications + preferences
  // -------------------------------------------------------------------
  console.log('Seeding notifications...');

  await prisma.notification.createMany({
    data: [
      { id: 'ntf1', userId: consumer.id, channel: 'inapp', category: 'snacks', title: 'Snack list sent', body: "Your snack list was sent on WhatsApp — we'll confirm shortly.", read: false, createdAt: new Date('2026-07-25T08:15:00+05:30') },
      { id: 'ntf2', userId: consumer.id, channel: 'inapp', category: 'order', title: 'Order delivered', body: 'Your order #HK2043 was delivered. Enjoy!', read: false, createdAt: new Date('2026-07-24T10:00:00+05:30'), refType: 'order', refId: 'HK2043' },
      { id: 'ntf3', userId: consumer.id, channel: 'whatsapp', category: 'laundry', title: 'Pickup confirmed', body: 'Your wash & fold pickup is scheduled for tomorrow, 9–11am.', read: false, createdAt: new Date('2026-07-23T18:20:00+05:30') },
      { id: 'ntf4', userId: consumer.id, channel: 'inapp', category: 'wallet', title: 'Cashback credited', body: '₹42 cashback credited for order #HK2043.', read: true, createdAt: new Date('2026-07-18T09:05:00+05:30'), refType: 'walletTransaction', refId: 'wt1' },
      { id: 'ntf5', userId: consumer.id, channel: 'email', category: 'promo', title: 'Festive hampers are live', body: 'New festive hampers just dropped — free shipping over ₹999.', read: true, createdAt: new Date('2026-07-15T08:00:00+05:30') },
      { id: 'ntf6', userId: consumer.id, channel: 'sms', category: 'account', title: 'New sign-in', body: 'New sign-in to your Homekrafted account from a Chrome browser.', read: true, createdAt: new Date('2026-07-05T21:40:00+05:30') },
    ],
  });

  await prisma.notificationPreference.createMany({
    data: [
      { userId: consumer.id, category: 'order', sms: true, whatsapp: true, email: true, inapp: true },
      { userId: consumer.id, category: 'laundry', sms: true, whatsapp: true, email: false, inapp: true },
      { userId: consumer.id, category: 'snacks', sms: false, whatsapp: true, email: false, inapp: true },
      { userId: consumer.id, category: 'wallet', sms: false, whatsapp: false, email: true, inapp: true },
      { userId: consumer.id, category: 'promo', sms: false, whatsapp: false, email: true, inapp: true },
      { userId: consumer.id, category: 'account', sms: true, whatsapp: false, email: true, inapp: true },
    ],
  });

  // -------------------------------------------------------------------
  // Referrals + support + corporate + seller applications
  // -------------------------------------------------------------------
  console.log('Seeding referrals, support, corporate, seller applications...');

  await prisma.referral.createMany({
    data: [
      { id: 'ref1', referrerUserId: consumer.id, code: 'ANANYA250', refereeName: 'Priya Menon', refereeUserId: 'user-priya', status: 'rewarded', rewardAmount: 100, createdAt: new Date('2026-07-10') },
      { id: 'ref2', referrerUserId: consumer.id, code: 'ANANYA250', refereeName: 'Karthik Rao', refereeUserId: 'user-karthik', status: 'joined', createdAt: new Date('2026-07-20') },
      { id: 'ref3', referrerUserId: consumer.id, code: 'ANANYA250', refereeName: 'Divya Shetty', status: 'pending', createdAt: new Date('2026-07-24') },
    ],
  });

  await prisma.supportTicket.create({
    data: {
      id: 'sup1',
      userId: consumer.id,
      subject: 'Refund not received for cancelled order',
      channel: 'chat',
      status: 'resolved',
      orderRef: 'HK2031',
      createdAt: new Date('2026-07-17T10:00:00+05:30'),
      updatedAt: new Date('2026-07-17T12:30:00+05:30'),
      messages: {
        create: [
          { sender: 'user', body: "Hi, I cancelled order HK2031 but haven't seen the refund in my wallet yet.", createdAt: new Date('2026-07-17T10:00:00+05:30') },
          { sender: 'agent', body: "Sorry about that! I've processed the refund manually — ₹150 should reflect in your wallet within a few minutes.", createdAt: new Date('2026-07-17T10:20:00+05:30') },
          { sender: 'user', body: 'Got it, thank you!', createdAt: new Date('2026-07-17T12:30:00+05:30') },
        ],
      },
    },
  });

  await prisma.corporateInquiry.create({
    data: {
      companyName: 'Northwind Analytics',
      contactName: 'Sameer Joshi',
      email: 'sameer@northwind.example',
      phone: '+919900011223',
      occasion: 'Diwali',
      estimatedQuantity: 150,
      budgetRange: '₹1,00,000 – ₹5,00,000',
      message: 'Looking for a Diwali gifting box for our Bengaluru + Pune offices, ~150 recipients, delivered by mid-October.',
      status: 'new',
    },
  });

  await prisma.sellerApplication.createMany({
    data: [
      { id: 'sa-seed-1', businessName: "Kaveri's Kitchen", contactName: 'Kaveri Rao', email: 'kaveri@example.com', phone: '+919000111222', category: 'maker', city: 'Mysuru, Karnataka', description: "Traditional Karnataka pickles and podis, small-batch, home-kitchen made — my grandmother's recipes, no preservatives.", status: 'new', createdAt: new Date('2026-07-20T10:00:00+05:30') },
      { id: 'sa-seed-2', businessName: 'Sugar & Slate Bakes', contactName: 'Rohan Mehta', email: 'rohan@example.com', phone: '+919000222333', category: 'baker', city: 'Pune, Maharashtra', description: 'Eggless cakes and festive bakes for small home celebrations, made to order.', status: 'reviewing', createdAt: new Date('2026-07-21T14:30:00+05:30') },
      { id: 'sa-seed-3', businessName: 'Terracotta & Thread', contactName: 'Ila Bhatt', email: 'ila@example.com', phone: '+919000333444', category: 'artist', city: 'Jaipur, Rajasthan', description: 'Hand-painted terracotta décor and block-printed textile gifting pieces.', status: 'waitlisted', createdAt: new Date('2026-07-15T09:00:00+05:30') },
      { id: 'sa-seed-4', businessName: 'Coastal Crate Co.', contactName: 'Manoj Pillai', email: 'manoj@example.com', phone: '+919000444555', category: 'other', city: 'Kochi, Kerala', description: 'Curated coastal Kerala snack and spice hampers.', status: 'rejected', createdAt: new Date('2026-07-10T09:00:00+05:30') },
    ],
  });

  console.log('Seed complete.');
  console.log(`Demo accounts (password: ${DEMO_PASSWORD}):`);
  console.log(`  consumer -> ${consumer.email}`);
  console.log(`  seller (maker) -> ${sellerUser.email}`);
  console.log(`  seller (laundry) -> ${laundryPartnerUser.email}`);
  console.log(`  seller (snack) -> ${snackSellerUser.email}`);
  console.log(`  admin -> ${adminUser.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
