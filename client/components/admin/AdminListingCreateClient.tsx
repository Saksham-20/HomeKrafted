"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import {
  EMPTY_LISTING_FORM,
  ListingForm,
  toSellerListingInput,
  type ListingFormValues,
} from "@/components/seller/ListingForm";
import { AdminPageHeader } from "./AdminPageHeader";
import { adminTaxonomyActions } from "@/lib/taxonomy-actions";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  createProductAdmin,
  getAllSellers,
  getCategories,
  getOccasions,
} from "@/lib/api";
import type { Category, Occasion, Seller } from "@/lib/types";
import styles from "./AdminListingEditorClient.module.css";

/**
 * The picker's first row. An empty value rather than a vendor id, because
 * "no vendor chosen" is exactly what the server reads as *the platform's
 * own storefront* — Homekrafted has a `Vendor` row but no `Seller`, so it
 * cannot come out of the HomeKrafter list, and inventing a client-side id
 * for it would be a second place that has to know which slug the platform
 * sells under.
 */
const PLATFORM_OPTION: ComboboxOption = {
  value: "",
  label: "Homekrafted",
  hint: "the platform's own storefront",
};

/**
 * `/admin/catalog/new` (M44) — an admin lists a product.
 *
 * **Two jobs, and the second is the one that matters.** The obvious one
 * is the platform listing its own products, which is why the vendor
 * defaults to Homekrafted. The other is *assisted onboarding*: the
 * research into how Swiggy actually signs restaurants up found that they
 * do not make partners type their menus — the restaurant sends
 * photographs and somebody at Swiggy transcribes them into structured
 * fields. On this platform a home cook who cannot face a listing form is
 * the normal case, not the edge case, so an operator has to be able to
 * type a kitchen's products up *for* them, against that kitchen's own
 * storefront: their reviews, their followers, their payout.
 *
 * Reuses `ListingForm` verbatim, exactly as the edit screen does — it is
 * a props-driven form with no seller-shell coupling, and a second copy of
 * it would be a second place for the weight-tier rules to drift.
 */
export function AdminListingCreateClient() {
  const router = useRouter();
  const { ready, role } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [values, setValues] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [cats, occs, sellerPage] = await Promise.all([
        getCategories(),
        getOccasions(),
        getAllSellers(),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setOccasions(occs);
      setSellers(sellerPage.items);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  const vendorOptions = useMemo<ComboboxOption[]>(
    () => [
      PLATFORM_OPTION,
      ...sellers.map((seller) => ({
        value: seller.vendorId,
        label: seller.displayName,
        // The status, not a place: this list holds pending and suspended
        // kitchens too, and listing onto a suspended storefront is a
        // thing an operator should see before they do it.
        hint: seller.status === "approved" ? undefined : seller.status,
      })),
    ],
    [sellers],
  );

  const attributedTo =
    vendorOptions.find((option) => option.value === vendorId)?.label ?? "Homekrafted";

  async function handleSubmit() {
    if (!values.name.trim() || !values.categoryId || values.weightRows.some((r) => !r.label.trim())) {
      setError("Fill in a product name, category, and label every weight tier before saving.");
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await createProductAdmin({
        ...toSellerListingInput(values),
        // Empty means the platform's own storefront — see `PLATFORM_OPTION`.
        vendorId: vendorId || undefined,
      });
      router.push("/admin/catalog");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create this listing. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) return <RouteSkeleton variant="page" />;

  return (
    <div>
      <Link href="/admin/catalog" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to catalog
      </Link>
      <AdminPageHeader
        title="New listing"
        subtitle="Goes live straight away — you are the review."
      />

      <Card className={styles.attribution} padding="sm">
        <Combobox
          label="Whose storefront"
          value={vendorId ? [vendorId] : []}
          onChange={(next) => setVendorId(next[0] ?? "")}
          options={vendorOptions}
          placeholder="Search HomeKrafters…"
          emptyMessage="No HomeKrafter by that name."
          hint={
            vendorId
              ? `Lists on ${attributedTo}'s storefront — their reviews, their followers, their payout.`
              : "Leave as Homekrafted for a platform listing, or pick a HomeKrafter to type one up on their behalf."
          }
        />
      </Card>

      <ListingForm
        values={values}
        onChange={setValues}
        categories={categories}
        occasions={occasions}
        taxonomy={adminTaxonomyActions}
      />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? "Creating…" : `Create listing for ${attributedTo}`}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/admin/catalog")} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
