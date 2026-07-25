import type { Address, Cart, HamperBox, MealPromo, User } from "@/lib/types";
import {
  addresses,
  announcementItems,
  brandBlurb,
  currentUser,
  demoAddress,
  footerColumns,
  getCartItemCount,
  hamperBoxes,
  mealPromo,
  mockCart,
  primaryNav,
  trustStats,
  type AnnouncementItem,
  type FooterColumn,
  type NavLink,
  type TrustStat,
} from "@/lib/data";

export async function getHamperBoxes(): Promise<HamperBox[]> {
  return hamperBoxes;
}

export async function getMealPromo(): Promise<MealPromo> {
  return mealPromo;
}

export async function getPrimaryNav(): Promise<NavLink[]> {
  return primaryNav;
}

export async function getAnnouncementItems(): Promise<AnnouncementItem[]> {
  return announcementItems;
}

export async function getFooterColumns(): Promise<FooterColumn[]> {
  return footerColumns;
}

export async function getBrandBlurb(): Promise<string> {
  return brandBlurb;
}

export async function getTrustStats(): Promise<TrustStat[]> {
  return trustStats;
}

/**
 * `getCart`/`getCartCount` are the M0 seed-cart stubs, superseded by the
 * real client-side cart store (`lib/cart/CartContext`) from M3 onward —
 * the Header badge and every add-to-cart control now read/write that
 * instead. Left in place only because `mockCart`/`getCartItemCount`
 * aren't worth deleting for a still-harmless legacy export.
 */
export async function getCart(): Promise<Cart> {
  return mockCart;
}

export async function getCartCount(): Promise<number> {
  return getCartItemCount(mockCart);
}

export async function getCurrentUser(): Promise<User> {
  return currentUser;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string;
}

/**
 * Profile edit mutation (M7a) — mutates the shared `currentUser` record
 * in place, same mock-mutation pattern/caveat as
 * `lib/api/addresses.ts`'s CRUD (session/module-instance scoped, not real
 * persistence). Because `useAuth()`'s `user` is this exact object
 * reference, any component that re-reads `user.name`/`.email`/`.phone` on
 * its next render (e.g. on remount/navigation) picks up the change
 * without needing a dedicated "refresh" call. Real profile persistence
 * (and a real users table) lands in M8.
 */
export async function updateUser(patch: UpdateUserInput): Promise<User> {
  Object.assign(currentUser, patch);
  return currentUser;
}

export async function getDefaultAddress(): Promise<Address> {
  return demoAddress;
}

/** Full address book for the signed-in demo user — checkout's multi-address split reads this. */
export async function getAddresses(): Promise<Address[]> {
  return addresses;
}
