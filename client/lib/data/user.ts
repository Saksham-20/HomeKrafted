import type { Address, User } from "@/lib/types";

/**
 * Single demo "logged in" user + default address. Just enough to give
 * `userId`/`addressId` foreign keys somewhere real to point at — full
 * auth lands in M8, and Account screens (addresses, orders, etc.) land
 * in M7.
 */
export const currentUser: User = {
  id: "user-demo",
  name: "Ananya Iyer",
  email: "ananya.iyer@example.com",
  phone: "+91 98450 12345",
  avatarPlaceholder: "ANANYA — AVATAR",
  authProviders: ["phone", "email"],
  createdAt: "2025-02-18",
  walletId: "wallet-demo",
  loyaltyAccountId: "loyalty-demo",
  referralCode: "ANANYA250",
  role: "consumer",
};

export const demoAddress: Address = {
  id: "addr-demo-1",
  userId: "user-demo",
  label: "Home",
  recipientName: "Ananya Iyer",
  phone: "+91 98450 12345",
  line1: "14, 2nd Cross, Indiranagar",
  line2: "Near CMH Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560038",
  country: "India",
  isDefault: true,
};

/**
 * Address book seed for M3's multi-address checkout — `demoAddress` plus
 * two more so a cart can genuinely split across addresses. Full address-
 * book CRUD (edit/delete, more than an inline "add") is M7; this is just
 * enough real data for the checkout split + per-address delivery date.
 */
export const addresses: Address[] = [
  demoAddress,
  {
    id: "addr-demo-2",
    userId: "user-demo",
    label: "Office",
    recipientName: "Ananya Iyer",
    phone: "+91 98450 12345",
    line1: "4th Floor, Prestige Tech Park",
    line2: "Kadubeesanahalli",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560103",
    country: "India",
    isDefault: false,
  },
  {
    id: "addr-demo-3",
    userId: "user-demo",
    label: "Amma's place",
    recipientName: "Lakshmi Iyer",
    phone: "+91 98450 67890",
    line1: "22, Gandhi Nagar 2nd Main",
    city: "Mysuru",
    state: "Karnataka",
    pincode: "570009",
    country: "India",
    isDefault: false,
    instructions: "Ring the bell twice, gate is usually latched",
  },
];

export function getAddressById(id: string): Address | undefined {
  return addresses.find((a) => a.id === id);
}
