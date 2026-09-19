"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { focusFirstError } from "@/components/portal/focus-first-error";
import { resolveFamily } from "@/lib/sell/listing-families";
import { Button } from "@/components/ui/Button";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { FormPage } from "@/components/portal/FormPage";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SaveBar } from "@/components/portal/SaveBar";
import {
  EMPTY_LISTING_FORM,
  LISTING_FORM_SECTIONS,
  ListingForm,
  hasListingFormErrors,
  toSellerListingInput,
  validateListingForm,
  countListingFormErrors,
  firstListingErrorId,
  type ListingFormErrors,
  type ListingFormValues,
} from "@/components/seller/ListingForm";
import { AdminPageHeader } from "./AdminPageHeader";
import { MERCHANDISING_SECTION, MerchandisingSection } from "./MerchandisingSection";
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

/** Whose storefront, then the listing itself — the one decision that changes what everything below means comes first. */
const CREATE_SECTIONS = [
  { id: "listing-vendor", label: "Whose storefront" },
  ...LISTING_FORM_SECTIONS,
  MERCHANDISING_SECTION,
];

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
  const [fieldErrors, setFieldErrors] = useState<ListingFormErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      try {
        const [cats, occs, sellerPage] = await Promise.all([
          getCategories(),
          getOccasions(),
          getAllSellers(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setOccasions(occs);
        setSellers(sellerPage.items);
        setLoadError(null);
      } catch (caught) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(caught, "Couldn't load the listing form. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, reloadToken]);

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

  /**
   * The product family for these values — what the form asks about, and
   * what the validator blocks on. Resolved from the category the maker
   * picked for THIS listing, so it follows the form rather than the
   * account: one kitchen listing a thali and a jar of pickle gets two
   * different sets of questions, which the account-level specialty tag
   * cannot express.
   */
  function familyOf(v: ListingFormValues) {
    return resolveFamily({
      kind: v.kind,
      categorySlug: categories.find((c) => c.id === v.categoryId)?.slug,
    });
  }

  async function handleSubmit() {
    const problems = validateListingForm(values, familyOf(values));
    if (hasListingFormErrors(problems)) {
      setFieldErrors(problems);
      // Says how many and takes the operator to the first, same as the
      // HomeKrafter's own form. "Something is missing" on a twenty-field
      // page is a hunt, and an admin listing on a kitchen's behalf is
      // typing somebody else's product from a photograph — they have even
      // less idea which answer the form wanted.
      const count = countListingFormErrors(problems);
      setError(
        count === 1
          ? "One thing needs fixing — we have taken you to it."
          : `${count} things need fixing — we have taken you to the first.`,
      );
      focusFirstError(firstListingErrorId(problems));
      return;
    }
    setFieldErrors({});
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

  if (loadError) {
    return (
      <div>
        <AdminPageHeader back={{ href: "/admin/catalog", label: "Catalog" }} title="New listing" />
        <Notice
          tone="danger"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                setReloadToken((n) => n + 1);
              }}
            >
              Retry
            </Button>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
  }

  if (!ready || loading) {
    return (
      <div>
        <AdminPageHeader back={{ href: "/admin/catalog", label: "Catalog" }} title="New listing" />
        <LoadingRows rows={3} />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        back={{ href: "/admin/catalog", label: "Catalog" }}
        title="New listing"
        subtitle="Goes live straight away — you are the review."
      />
      <FormPage sections={CREATE_SECTIONS.map((s) => ({ ...s }))} navLabel="Sections">
        <FormSection
          id="listing-vendor"
          title="Whose storefront"
          description="A platform listing, or one typed up on a HomeKrafter's behalf — against their storefront, their reviews, their payout."
          status={vendorId ? { label: attributedTo, tone: "neutral" } : undefined}
        >
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
        </FormSection>

        <ListingForm
          values={values}
          onChange={(next) => {
            setValues(next);
            if (hasListingFormErrors(fieldErrors)) setFieldErrors(validateListingForm(next, familyOf(next)));
          }}
          categories={categories}
          occasions={occasions}
          taxonomy={adminTaxonomyActions}
          errors={fieldErrors}
        />

        {/* Admin-only badges. No featured line: a listing that does not
            exist yet cannot be in the featured list. */}
        <MerchandisingSection
          tags={values.tags}
          onChange={(tags) => setValues((current) => ({ ...current, tags }))}
        />

        <SaveBar
          dirty
          alwaysEnabled
          saving={saving}
          error={error}
          onSave={() => void handleSubmit()}
          saveLabel={`Create listing for ${attributedTo}`}
          savingLabel="Creating…"
        >
          <Button variant="secondary" size="sm" onClick={() => router.push("/admin/catalog")} disabled={saving}>
            Cancel
          </Button>
        </SaveBar>
      </FormPage>
    </div>
  );
}
