"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { ProductModerationRow } from "./ProductModerationRow";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getAllProductsAdmin,
  getVendors,
  moderateProduct,
  type AdminProductSummary,
  type ProductModerationAction,
} from "@/lib/api";
import type { Vendor } from "@/lib/types";
import styles from "./CatalogClient.module.css";

type StatusFilter = "all" | "active" | "hidden" | "flagged" | "featured";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "flagged", label: "Flagged" },
  { value: "hidden", label: "Taken down" },
  { value: "featured", label: "Featured" },
];

/**
 * `/admin/catalog` (M11b) — every `Product` across every vendor,
 * unscoped, search/filter by vendor + status, with inline
 * approve/hide/flag/feature actions (`moderateProduct`) and an edit link
 * to `/admin/catalog/[id]`. "Take down" is a real soft-delete: hidden
 * products are filtered out of every consumer browse query going forward
 * (see `lib/api/products.ts#isBrowsable`) — those browse pages are Server
 * Components, so the takedown becomes visible on their next server-side
 * fetch, not necessarily this same client tab (see `lib/api/admin.ts`'s
 * "Catalog & review moderation" section header for the full caveat).
 */
export function CatalogClient() {
  const { ready, role } = useAuth();
  const [products, setProducts] = useState<AdminProductSummary[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [list, vendorList] = await Promise.all([getAllProductsAdmin(), getVendors()]);
      if (cancelled) return;
      setProducts(list);
      setVendors(vendorList);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  async function handleAction(productId: string, action: ProductModerationAction) {
    const updated = await moderateProduct(productId, action);
    if (!updated) return;
    setProducts((current) =>
      current.map((p) =>
        p.id === productId
          ? { ...p, moderationStatus: updated.moderationStatus, featured: updated.featured }
          : p,
      ),
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const status = p.moderationStatus ?? "active";
      if (vendorFilter !== "all" && p.vendorId !== vendorFilter) return false;
      if (statusFilter === "featured" && !p.featured) return false;
      if (statusFilter !== "all" && statusFilter !== "featured" && status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.vendorName.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
      );
    });
  }, [products, query, vendorFilter, statusFilter]);

  if (!ready || loading) {
    return <div className={styles.loading}>Loading catalog…</div>;
  }

  return (
    <div>
      <AdminPageHeader title="Catalog" subtitle={`${products.length} product${products.length === 1 ? "" : "s"} across every vendor`} />
      <CatalogTabs active="products" />

      <div className={styles.filters}>
        <SearchField
          className={styles.search}
          placeholder="Search by product, vendor or category…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className={styles.select}
          value={vendorFilter}
          onChange={(event) => setVendorFilter(event.target.value)}
          aria-label="Filter by vendor"
        >
          <option value="all">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <div className={styles.chipRow} role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={statusFilter === f.value} onClick={() => setStatusFilter(f.value)} />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className={styles.empty}>No products match these filters.</Card>
      ) : (
        <div className={styles.list}>
          {filtered.map((product) => (
            <ProductModerationRow key={product.id} product={product} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}
