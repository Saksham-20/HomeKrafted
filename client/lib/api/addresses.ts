/**
 * Address-book CRUD (M8.4a — real). `GET/POST/PATCH/DELETE
 * /users/me/addresses*` (`docs/API.md` "Users & addresses"), owner-scoped
 * from the verified JWT — no `userId` in any request body. Mock mode keeps
 * the pre-M8.4a in-memory mutation over the shared `lib/data` `addresses`
 * array.
 */

import type { Address } from "@/lib/types";
import { addresses, currentUser } from "@/lib/data";
import { http, isMockMode } from "./http";

export async function getAddressById(id: string): Promise<Address | undefined> {
  if (isMockMode()) return addresses.find((a) => a.id === id);
  const all = await http.get<Address[]>("/users/me/addresses");
  return all.find((a) => a.id === id);
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

/** Creates a new address. The very first address in an empty book is automatically the default (real endpoint enforces this server-side too). */
export async function createAddress(input: AddressInput): Promise<Address> {
  if (isMockMode()) {
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
  return http.post<Address>("/users/me/addresses", input);
}

/** Patches an existing address's fields (not `isDefault` — see `setDefaultAddress`). */
export async function updateAddress(
  id: string,
  patch: Partial<AddressInput>,
): Promise<Address | undefined> {
  if (isMockMode()) {
    const address = addresses.find((a) => a.id === id);
    if (!address) return undefined;
    Object.assign(address, patch);
    return address;
  }
  try {
    return await http.patch<Address>(`/users/me/addresses/${encodeURIComponent(id)}`, patch);
  } catch {
    return undefined;
  }
}

/** Removes an address. If it was the default and others remain, the server promotes another to default. */
export async function deleteAddress(id: string): Promise<void> {
  if (isMockMode()) {
    const index = addresses.findIndex((a) => a.id === id);
    if (index === -1) return;
    const wasDefault = addresses[index].isDefault;
    addresses.splice(index, 1);
    if (wasDefault && addresses.length > 0) {
      addresses[0].isDefault = true;
    }
    return;
  }
  await http.delete<void>(`/users/me/addresses/${encodeURIComponent(id)}`);
}

/** Sets one address as the default, unsetting every other one. */
export async function setDefaultAddress(id: string): Promise<void> {
  if (isMockMode()) {
    for (const address of addresses) {
      address.isDefault = address.id === id;
    }
    return;
  }
  await http.post<Address>(`/users/me/addresses/${encodeURIComponent(id)}/default`);
}
