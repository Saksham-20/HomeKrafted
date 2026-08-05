"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SellerPageHeader } from "./SellerPageHeader";
import {
  EMPTY_LISTING_FORM,
  ListingForm,
  toSellerListingInput,
  type ListingFormValues,
} from "./ListingForm";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  createSellerListing,
  getCategories,
  getOccasions,
  getSellerListing,
  updateSellerListing,
} from "@/lib/api";
import type { Category, Occasion, Product } from "@/lib/types";
import styles from "./SellerListingEditorClient.module.css";

function productToFormValues(product: Product): ListingFormValues {
  const defaultRowIndex = Math.max(
    0,
    product.weightOptions.findIndex((w) => w.sku === product.defaultWeightSku),
  );
  return {
    name: product.name,
    categoryId: product.categoryId,
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

export interface SellerListingEditorClientProps {
  /** Present in edit mode (`/seller/listings/[id]`); absent for create (`/seller/listings/new`). */
  productId?: string;
}

/** Shared screen for `/seller/listings/new` and `/seller/listings/[id]` — loads catalog reference data (+ the existing product, in edit mode), then renders `ListingForm` and wires up create/update. */
export function SellerListingEditorClient({ productId }: SellerListingEditorClientProps) {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const isEdit = Boolean(productId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [values, setValues] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      const [cats, occs, product] = await Promise.all([
        getCategories(),
        getOccasions(),
        productId ? getSellerListing(seller.vendorId!, productId) : Promise.resolve(undefined),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setOccasions(occs);
      if (productId) {
        if (product) {
          setValues(productToFormValues(product));
        } else {
          setNotFound(true);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, productId]);

  async function handleSubmit() {
    if (!seller?.vendorId) return;
    if (!values.name.trim() || !values.categoryId || values.weightRows.some((r) => !r.label.trim())) {
      setError("Fill in a product name, category, and label every weight tier before saving.");
      return;
    }
    setError(undefined);
    setSaving(true);
    const input = toSellerListingInput(values);
    if (isEdit && productId) {
      await updateSellerListing(seller.vendorId, productId, input);
    } else {
      await createSellerListing(seller.vendorId, input);
    }
    setSaving(false);
    router.push("/seller/listings");
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading…</div>;
  }

  if (notFound) {
    return <div className={styles.loading}>Listing not found.</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title={isEdit ? "Edit listing" : "Add listing"}
        subtitle={isEdit ? values.name : "Create a new product for your storefront."}
      />
      <ListingForm values={values} onChange={setValues} categories={categories} occasions={occasions} />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create listing"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/seller/listings")} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
