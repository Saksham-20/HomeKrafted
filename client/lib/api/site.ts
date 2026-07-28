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
  homePromoBands,
  mealPromo,
  mockCart,
  primaryNav,
  trustStats,
  type AnnouncementItem,
  type FooterColumn,
  type HomePromoBandContent,
  type NavLink,
  type TrustStat,
} from "@/lib/data";
import { getMe, updateMe } from "./auth";
import { http, isMockMode } from "./http";
import { getSessionUser, toAppUser, updateSessionUser } from "@/lib/auth/session";

export async function getHamperBoxes(): Promise<HamperBox[]> {
  if (isMockMode()) return hamperBoxes;
  return http.get<HamperBox[]>("/hamper/boxes", { auth: false });
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

/** Home page's two promo bands, admin-editable — see `HomePromoBandContent`'s doc comment. Mutated by `lib/api/admin.ts#updateHomePromoBand`. */
export async function getHomePromoBands(): Promise<HomePromoBandContent[]> {
  return homePromoBands;
}

/**
 * `getCart`/`getCartCount` are the M0 seed-cart stubs, superseded by the
 * real cart store (`lib/cart/CartContext`) from M3 onward — the Header
 * badge and every add-to-cart control read/write that instead. Left in
 * place only because `mockCart`/`getCartItemCount` aren't worth deleting
 * for a still-harmless legacy export.
 */
export async function getCart(): Promise<Cart> {
  return mockCart;
}

export async function getCartCount(): Promise<number> {
  return getCartItemCount(mockCart);
}

/** `GET /users/me` — prefers the already-hydrated session snapshot (`AuthContext`) to avoid a redundant network round trip; falls back to a fresh fetch (e.g. called before `AuthProvider` has hydrated). */
export async function getCurrentUser(): Promise<User> {
  if (isMockMode()) return currentUser;
  const sessionUser = getSessionUser();
  if (sessionUser) return toAppUser(sessionUser);
  const me = await getMe();
  return toAppUser(me);
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string;
}

/**
 * Profile edit mutation. Real mode: `PATCH /users/me`, then mirrors the
 * updated snapshot back into `lib/auth/session.ts` so `useAuth().user`
 * reflects it without a separate refresh (see `AuthContext.refreshUser`,
 * which `ProfileClient` also calls after this resolves, belt-and-braces).
 */
export async function updateUser(patch: UpdateUserInput): Promise<User> {
  if (isMockMode()) {
    Object.assign(currentUser, patch);
    return currentUser;
  }
  const updated = await updateMe(patch);
  updateSessionUser(updated);
  return toAppUser(updated);
}

/** Real mode: `GET /users/me/addresses`, first `isDefault` (or first overall if none flagged yet). */
export async function getDefaultAddress(): Promise<Address> {
  if (isMockMode()) return demoAddress;
  const all = await getAddresses();
  return all.find((a) => a.isDefault) ?? all[0] ?? demoAddress;
}

/** Full address book for the signed-in account — checkout's multi-address split reads this. */
export async function getAddresses(): Promise<Address[]> {
  if (isMockMode()) return addresses;
  return http.get<Address[]>("/users/me/addresses");
}
