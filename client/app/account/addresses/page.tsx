import { getAddresses } from "@/lib/api";
import { AddressBookClient } from "@/components/account/AddressBookClient";

/**
 * Address book (M7a) — server wrapper: fetches the current address book
 * (`getAddresses()`, the same read Checkout's `initialAddresses` uses) and
 * hands off to the client CRUD screen. `AddressBookClient` mutates via
 * `lib/api/addresses.ts`'s `createAddress`/`updateAddress`/
 * `deleteAddress`/`setDefaultAddress`, keeping its own local copy in sync
 * with each mutation's result.
 */
export default async function AddressesPage() {
  const addresses = await getAddresses();
  return <AddressBookClient initialAddresses={addresses} />;
}
