"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SellerPageHeader } from "./SellerPageHeader";
import { ListingRow } from "./ListingRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { deleteSellerListing, getCategories, getSellerListings } from "@/lib/api";
import type { Category, Product } from "@/lib/types";
import styles from "./ListingsClient.module.css";

/** `/seller/listings` (M10a) — this maker's `Product`s as a list with derived stock status, edit/delete. Create lives at `/seller/listings/new`, edit at `/seller/listings/[id]` (both share `ListingForm`). */
export function ListingsClient() {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    // A HomeKrafter without a `vendorId` (a laundry partner, say) has no
    // storefront to list against. That's derivable from `seller` at render
    // time (`noStorefront` below), so this effect just skips — no
    // set-state-in-effect needed to reach the "not set up" card.
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      try {
        const [listings, cats] = await Promise.all([
          getSellerListings(seller.vendorId!),
          getCategories(),
        ]);
        if (cancelled) return;
        setProducts(listings);
        setCategories(cats);
      } catch (error) {
        if (cancelled) return;
        if (!isForbidden(error)) throw error;
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  async function handleDelete(productId: string) {
    if (!seller?.vendorId) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    if (!window.confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    await deleteSellerListing(seller.vendorId, productId);
    setProducts((current) => current.filter((p) => p.id !== productId));
  }

  const noStorefront = ready && !!seller && !seller.vendorId;
  if (noStorefront || unavailable) {
    return <ModuleUnavailable module="Listings" />;
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading your listings…</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title="Listings"
        subtitle={`${products.length} product${products.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/seller/listings/new")}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Add listing
          </Button>
        }
      />

      {products.length === 0 ? (
        <Card className={styles.empty}>
          No listings yet — add your first product to start selling.
        </Card>
      ) : (
        <div className={styles.list}>
          {products.map((product) => (
            <ListingRow
              key={product.id}
              product={product}
              categoryName={categories.find((c) => c.id === product.categoryId)?.name}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
