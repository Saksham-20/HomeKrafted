/**
 * Address-book CRUD mutations (M7a) — same in-memory-mock-mutation
 * pattern already established by `lib/api/orders.ts`'s `createOrder` and
 * `lib/api/laundry.ts`'s `createBooking`: these mutate the shared
 * `addresses` array from `lib/data/user.ts` in place — the exact same
 * array `getAddresses()` (`lib/api/site.ts`) reads and Checkout's
 * `initialAddresses` is seeded from. "Persists" only within one running
 * module instance (a server process between requests, or a browser tab's
 * client bundle within a session) — resets on a hard reload/new process,
 * same caveat as every other pre-M8 mock mutation in this codebase. Real
 * address persistence lands in M8 (`POST`/`PATCH`/`DELETE
 * /api/v1/addresses` against Postgres).
 */

import type { Address } from "@/lib/types";
import { addresses, currentUser } from "@/lib/data";

export async function getAddressById(id: string): Promise<Address | undefined> {
  return addresses.find((a) => a.id === id);
}

export interface AddressInput {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  instructions?: string;
}

/** Creates a new address. The very first address in an empty book is automatically the default; every later one starts non-default (use `setDefaultAddress` to change it) — enforces "exactly one default" the same way `deleteAddress`/`setDefaultAddress` do below. */
export async function createAddress(input: AddressInput): Promise<Address> {
  const address: Address = {
    id: `addr-${Date.now()}`,
    userId: currentUser.id,
    country: "India",
    isDefault: addresses.length === 0,
    ...input,
  };
  addresses.push(address);
  return address;
}

/** Patches an existing address's fields (not `isDefault` — see `setDefaultAddress`). */
export async function updateAddress(
  id: string,
  patch: Partial<AddressInput>,
): Promise<Address | undefined> {
  const address = addresses.find((a) => a.id === id);
  if (!address) return undefined;
  Object.assign(address, patch);
  return address;
}

/** Removes an address. If it was the default and others remain, promotes the first remaining address to default — the book always has exactly one default while non-empty. */
export async function deleteAddress(id: string): Promise<void> {
  const index = addresses.findIndex((a) => a.id === id);
  if (index === -1) return;
  const wasDefault = addresses[index].isDefault;
  addresses.splice(index, 1);
  if (wasDefault && addresses.length > 0) {
    addresses[0].isDefault = true;
  }
}

/** Sets one address as the default, unsetting every other one — enforces "exactly one default" in the book. */
export async function setDefaultAddress(id: string): Promise<void> {
  for (const address of addresses) {
    address.isDefault = address.id === id;
  }
}
