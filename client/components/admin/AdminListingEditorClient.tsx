"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { focusFirstError } from "@/components/portal/focus-first-error";
import { resolveFamily } from "@/lib/sell/listing-families";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { FormPage } from "@/components/portal/FormPage";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SaveBar } from "@/components/portal/SaveBar";
import {
  EMPTY_LISTING_FORM,
  LISTING_FORM_SECTIONS,
  ListingForm,
  hasListingFormErrors,
  prepTimeMinsToFormValue,
  toSellerListingInput,
  validateListingForm,
  countListingFormErrors,
  firstListingErrorId,
  type ListingFormErrors,
  type ListingFormValues,
} from "@/components/seller/ListingForm";
import { AdminPageHeader } from "./AdminPageHeader";
import { adminTaxonomyActions } from "@/lib/taxonomy-actions";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getCategories,
  getOccasions,
  getAdminProductById,
  updateProductAdmin,
  getPlatformSettings,
} from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import type { Category, Occasion, Product, SellerCommission } from "@/lib/types";

function productToFormValues(product: Product): ListingFormValues {
  const defaultRowIndex = Math.max(
    0,
    product.weightOptions.findIndex((w) => w.sku === product.defaultWeightSku),
  );
  return {
    name: product.name,
    categoryId: product.categoryId,
    categoryIds: product.categoryIds ?? [],
    occasionIds: product.occasionIds,
    dietary: product.dietary,
    // Blank when the listing has never been asked — see `parsePrepTime`.
    // Days for a craft listing, minutes for food — see `prepTimeMinsToFormValue`.
    prepTimeMins: prepTimeMinsToFormValue(product.prepTimeMins, product.kind ?? "food"),
    description: product.description,
    isPackaged: product.isPackaged,
    isHamper: product.isHamper ?? false,
    // All three absent read as what a pre-M20 listing was.
    kind: product.kind ?? "food",
    shippingScope: product.shippingScope ?? "local",
    isSnack: product.isSnack ?? false,
    cashbackPct: String(product.cashbackPct),
    tags: product.tags,
    imagePath: product.images[0]?.src ?? "",
    weightRows: product.weightOptions.map((w) => ({
      sku: w.sku,
      label: w.label,
      price: String(w.price),
      mrp: String(w.mrp),
      stock: String(w.stock),
    })),
    defaultRowIndex,
    dimensions: product.dimensions ?? "",
    material: product.material ?? "",
    careInstructions: product.careInstructions ?? "",
    ingredients: product.ingredients ?? "",
    shelfLife: product.shelfLife ?? "",
    storageInstructions: product.storageInstructions ?? "",
    disclaimer: product.disclaimer ?? "",
    allergens: product.allergens ?? [],
    servingGuidance: product.servingGuidance ?? "",
    fulfillmentType: product.fulfillmentType ?? "fresh_nearby",
    fulfilment: product.fulfilment ?? "",
    isPersonalisable: product.isPersonalisable ?? false,
    personalisationPrompt: product.personalisationPrompt ?? "",
  };
}

export interface AdminListingEditorClientProps {
  productId: string;
}

/**
 * `/admin/catalog/[id]` (M11b) — full-record edit for any vendor's
 * listing, unscoped. Reuses `ListingForm` (`components/seller/ListingForm.tsx`)
 * verbatim — it's a pure props-driven form with no seller-shell coupling —
 * and writes through `updateProductAdmin` (unscoped sibling of
 * `updateSellerListing`) instead of a vendor-scoped mutation.
 */
export function AdminListingEditorClient({ productId }: AdminListingEditorClientProps) {
  const router = useRouter();
  const { ready, role } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  /**
   * The live commission rate (2026-09-16), so an admin listing on a
   * maker's behalf sees the same "you receive ₹N → customer pays ₹M"
   * preview a HomeKrafter does on their own edit screen — absent while
   * loading reads as no fee (`ListingForm`'s own rule), never a guess.
   */
  const [commission, setCommission] = useState<SellerCommission | undefined>();
  const [values, setValues] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  const [initialValues, setInitialValues] = useState<ListingFormValues | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<ListingFormErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      try {
        const [cats, occs, product, settings] = await Promise.all([
          getCategories(),
          getOccasions(),
          getAdminProductById(productId),
          // `undefined` on failure by its own contract (a read, not a
          // mutation — the M36 carve-out) — the listing editor loads either
          // way, it only costs the earnings preview.
          getPlatformSettings(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setOccasions(occs);
        if (settings) {
          setCommission({ pct: settings.commissionPct, enabled: settings.commissionEnabled, gstPct: settings.commissionGstPct });
        }
        if (product) {
          const loaded = productToFormValues(product);
          setValues(loaded);
          setInitialValues(loaded);
        } else {
          setNotFound(true);
        }
        setLoadError(null);
      } catch (caught) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(caught, "Couldn't load this listing. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, productId, reloadToken]);

  /**
   * What this listing is, which decides which questions block. Read off the
   * category chosen on this form, exactly as the create screen does — the
   * two edit the same object and must not disagree about what it owes.
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
      // "Something is missing — it is marked on the form" was true only if
      // the operator could find the mark, and the fields that fail sit two
      // thirds of the way down. Count it and jump to it.
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
    const input = toSellerListingInput(values);
    try {
      await updateProductAdmin(productId, input);
      router.push("/admin/catalog");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save this listing. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <AdminPageHeader back={{ href: "/admin/catalog", label: "Catalog" }} title="Edit listing" />
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
        <AdminPageHeader back={{ href: "/admin/catalog", label: "Catalog" }} title="Edit listing" />
        <LoadingRows rows={3} />
      </div>
    );
  }

  if (notFound) {
    return (
      <NotFoundCard
        title="We couldn’t find that listing"
        body="Nothing in the catalogue matches this id. It may have been deleted by the HomeKrafter since the queue was loaded."
        reference={productId}
        backHref="/admin/catalog"
        backLabel="Back to catalog"
      />
    );
  }

  return (
    <div>
      <AdminPageHeader
        back={{ href: "/admin/catalog", label: "Catalog" }}
        title="Edit listing"
        subtitle={values.name}
      />
      <FormPage sections={LISTING_FORM_SECTIONS.map((s) => ({ ...s }))} navLabel="Sections">
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
          commission={commission}
        />
        <SaveBar
          dirty={isDirty(initialValues, values)}
          saving={saving}
          error={error}
          onSave={() => void handleSubmit()}
          onDiscard={
            initialValues
              ? () => {
                  setValues(initialValues);
                  setFieldErrors({});
                  setError(undefined);
                }
              : undefined
          }
        >
          <Button variant="secondary" size="sm" onClick={() => router.push("/admin/catalog")} disabled={saving}>
            Cancel
          </Button>
        </SaveBar>
      </FormPage>
    </div>
  );
}
