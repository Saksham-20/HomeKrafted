import type { Address, Cart, HamperBox, MealPromo, User } from "@/lib/types";
import {
  addresses,
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
  secondaryNav,
  type FooterColumn,
  type HomePromoBandContent,
  type NavLink,
} from "@/lib/data";
import { getMe, updateMe } from "./auth";
import { ApiError, http, isMockMode } from "./http";
import { TRICITY_AREAS } from "@/lib/geo";
import type { PincodeLookup } from "@/lib/pincode";

/**
 * One representative pincode per curated area, for mock mode only.
 *
 * **Not a lookup table and never to be grown into one.** The real table
 * is 19,238 entries and lives on the server precisely so the browser
 * never carries it; this exists so `/sell` can be filled in offline. A
 * few of these codes genuinely cover several of the areas below — that
 * is true of Chandigarh's sectors — and it does not matter, because
 * nothing measures distance from it.
 */
const MOCK_PINCODES: Record<string, string> = {
  "chd-sector-8": "160009",
  "chd-sector-15": "160015",
  "chd-sector-17": "160017",
  "chd-sector-22": "160022",
  "chd-sector-32": "160030",
  "chd-sector-34": "160022",
  "chd-sector-35": "160035",
  "chd-sector-43": "160043",
  "chd-sector-46": "160047",
  "chd-manimajra": "160101",
  "moh-phase-3b2": "160059",
  "moh-phase-5": "160059",
  "moh-phase-7": "160061",
  "moh-sector-70": "160071",
  "moh-kharar": "140301",
  "pkl-sector-5": "134109",
  "pkl-sector-9": "134113",
  "pkl-sector-11": "134109",
  "pkl-sector-20": "134116",
  "zkp-vip-road": "140603",
  "zkp-dhakoli": "140603",
};
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

/** The non-catalogue ways in (M34) — home's quick-entry strip and the drawer's second group. See `secondaryNav`'s doc comment for why these are not desktop nav links. */
export async function getSecondaryNav(): Promise<NavLink[]> {
  return secondaryNav;
}

export async function getFooterColumns(): Promise<FooterColumn[]> {
  return footerColumns;
}

export async function getBrandBlurb(): Promise<string> {
  return brandBlurb;
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

// ---------------------------------------------------------------------------
// Pincodes (M36) — `GET /pincodes/:pincode`
// ---------------------------------------------------------------------------

/**
 * What and where a pincode is, and whether we deliver there yet.
 *
 * `undefined` means **India Post has no such pincode** — a real answer,
 * not a failure, which is why the 404 is translated here rather than
 * thrown. Everything else (a network fault, a 500) throws, so the caller
 * can tell "you mistyped" from "we are broken" and say the right one.
 * That distinction is the whole reason this wrapper exists; see
 * `docs/ERROR-HANDLING.md`.
 *
 * Mock mode has no 19,238-entry table to consult, so it answers for the
 * curated tricity areas only and treats anything else as unknown. That
 * is honest about what offline mode can know, and it keeps `/sell`
 * exercisable without a server.
 */
export async function lookupPincode(pincode: string): Promise<PincodeLookup | undefined> {
  if (isMockMode()) {
    const area = TRICITY_AREAS.find((a) => MOCK_PINCODES[a.id] === pincode.trim());
    if (!area) return undefined;
    return {
      pincode: pincode.trim(),
      district: area.city,
      state: area.city === "Chandigarh" ? "Chandigarh" : "Punjab",
      serviced: true,
      spreadKm: 0,
      approximate: false,
    };
  }

  try {
    return await http.get<PincodeLookup>(`/pincodes/${encodeURIComponent(pincode.trim())}`, {
      auth: false,
    });
  } catch (err) {
    // Only the "no such pincode" case. Anything else is ours and belongs
    // to the caller — swallowing it would put "check your pincode" in
    // front of somebody whose pincode is perfectly correct.
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}
