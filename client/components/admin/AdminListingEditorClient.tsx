"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
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
  getCategories,
  getOccasions,
  getAdminProductById,
  updateProductAdmin,
} from "@/lib/api";
import type { Category, Occasion, Product } from "@/lib/types";
import styles from "./AdminListingEditorClient.module.css";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

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
        setValues(productToFormValues(product));
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
    if (!values.name.trim() || !values.categoryId || values.weightRows.some((r) => !r.label.trim())) {
      setError("Fill in a product name, category, and label every weight tier before saving.");
      return;
    }
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
    return <div className={styles.loading}>Loading listing…</div>;
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
      <Link href="/admin/catalog" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to catalog
      </Link>
      <AdminPageHeader title="Edit listing" subtitle={values.name} />
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
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/admin/catalog")} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
