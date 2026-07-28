import { AddressBookClient } from "@/components/account/AddressBookClient";

/**
 * Address book (M7a; M8.4a swap) — `getAddresses()` is a real owner-scoped
 * read now, so `AddressBookClient` fetches it itself on mount instead of
 * this page fetching it server-side (same reasoning as `OrdersListClient`
 * pre-M8.4 — see `lib/auth/session.ts`'s file header).
 * `AddressBookClient` mutates via `lib/api/addresses.ts`'s
 * `createAddress`/`updateAddress`/`deleteAddress`/`setDefaultAddress`,
 * keeping its own local copy in sync with each mutation's result.
 */
export default function AddressesPage() {
  return <AddressBookClient />;
}
