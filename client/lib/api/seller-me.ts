/**
 * The two reads a signed-in HomeKrafter's session needs, split out of
 * `./seller` on 2026-08-30 (M55). `AuthContext` — in the root layout, so
 * on every page — calls `getMySeller`, and `./seller` imports the whole
 * seed catalogue, every order fixture and `./laundry` for its offline
 * mode. Through that one import the landing page shipped all of it.
 * This module reaches only `sellers` and `getVendorById`, which are
 * leaf fixtures. `./seller` re-exports both functions, so every call
 * site and `seller-me-contract.spec.ts` are unchanged.
 */
import type { Seller, Vendor } from "@/lib/types";
import { sellers } from "@/lib/data/sellers";
import { getVendorById as getVendorByIdData } from "@/lib/data/vendors";
import { ApiError, http, isMockMode } from "./http";

/**
 * `undefined` means **this account has no kitchen** — a 404, and only a
 * 404. Every other failure throws.
 *
 * This used to be `catch { return undefined }`, and that one line was the
 * whole of the M39 sign-in loop. `/seller/me` is not in the server's
 * `PASSWORD_CHANGE_EXEMPT` set, so an admin-issued temporary password
 * (M32) makes it answer **403 PASSWORD_CHANGE_REQUIRED** — deliberately,
 * and asserted in `server/test/e2e/temp-password.e2e-spec.ts`. Swallowing
 * that turned "you must set a password first" into "you are not a
 * HomeKrafter", `SellerShell` rendered the sign-in wall, its button
 * returned to `/login`, and the "You're all set" card sent them straight
 * back. A closed loop with no sign-in form in it.
 *
 * The same swallow did it for a 500 and for a dropped connection, which
 * is why the bug read as intermittent: a transient blip showed a real
 * HomeKrafter a rejection screen.
 *
 * A read may answer `undefined` for "no such thing". It may not answer
 * `undefined` for "I could not ask" — see `lib/silent-failure.spec.ts`.
 */
export async function getMySeller(): Promise<Seller | undefined> {
  // Mock parity for the M37 commission block: the real record carries the
  // platform rate so no screen hardcodes one; offline mode models the
  // shipped default (10%, deduction off).
  if (isMockMode()) return { ...sellers[0], commission: { pct: 10, enabled: false } };
  try {
    return await http.get<Seller>("/seller/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

/** Same contract as `getMySeller` — `/seller/storefront` is equally non-exempt, so it fails the same way. */
export async function getSellerVendor(vendorId: string): Promise<Vendor | undefined> {
  if (isMockMode()) return getVendorByIdData(vendorId);
  try {
    return await http.get<Vendor>("/seller/storefront");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}
