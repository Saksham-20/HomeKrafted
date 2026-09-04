"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { FormPage } from "@/components/portal/FormPage";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SaveBar } from "@/components/portal/SaveBar";
import {
  EMPTY_LISTING_FORM,
  LISTING_FORM_SECTIONS,
  ListingForm,
  hasListingFormErrors,
  toSellerListingInput,
  validateListingForm,
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
} from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import type { Category, Occasion, Product } from "@/lib/types";

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
  const [values, setValues] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  const [initialValues, setInitialValues] = useState<ListingFormValues | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<ListingFormErrors>({});

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [cats, occs, product] = await Promise.all([
        getCategories(),
        getOccasions(),
        getAdminProductById(productId),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setOccasions(occs);
      if (product) {
        const loaded = productToFormValues(product);
        setValues(loaded);
        setInitialValues(loaded);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, productId]);

  async function handleSubmit() {
    const problems = validateListingForm(values);
    if (hasListingFormErrors(problems)) {
      setFieldErrors(problems);
      setError("Something is missing — it is marked on the form.");
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
            if (hasListingFormErrors(fieldErrors)) setFieldErrors(validateListingForm(next));
          }}
          categories={categories}
          occasions={occasions}
          taxonomy={adminTaxonomyActions}
          errors={fieldErrors}
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
