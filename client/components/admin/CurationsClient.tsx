"use client";

/**
 * CurationsClient — lets admins curate four product rails:
 * `bestsellers-food`, `bestsellers-craft`, `trending-food`, `trending-craft`.
 *
 * Each rail maps 1-to-1 with a `Collection` slug. When the collection
 * already exists (identified by slug in the admin collections list) we
 * PATCH it by id; otherwise we POST a new one with the canonical slug.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Search, Sparkles, Trash2, Utensils } from "lucide-react";
import {
  getAllProductsAdmin,
  getCollectionsAdmin,
  upsertCollection,
  type AdminProductSummary,
} from "@/lib/api/admin";
import type { Collection } from "@/lib/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatCurrency } from "@/lib/format";
import { AdminPageHeader } from "./AdminPageHeader";
import { CollectionsTabs } from "./CollectionsTabs";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import styles from "./CurationsClient.module.css";

// ---------------------------------------------------------------------------
// Rail definitions
// ---------------------------------------------------------------------------
const RAILS = [
  {
    slug: "bestsellers-food" as const,
    title: "Bestsellers — Food",
    kind: "food" as const,
    hint: "Appears on the home page under Bestsellers → Homemade Food.",
  },
  {
    slug: "bestsellers-craft" as const,
    title: "Bestsellers — Gifts",
    kind: "craft" as const,
    hint: "Appears on the home page under Bestsellers → Handcrafted Gifts.",
  },
  {
    slug: "trending-food" as const,
    title: "Trending — Food",
    kind: "food" as const,
    hint: "Featured dishes across seasonal highlights and recommendations.",
  },
  {
    slug: "trending-craft" as const,
    title: "Trending — Gifts",
    kind: "craft" as const,
    hint: "Appears on the home page in the HomeKrafted Gifts showcase rail.",
  },
] as const;

type RailSlug = (typeof RAILS)[number]["slug"];

export function CurationsClient() {
  useAuth();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [activeRail, setActiveRail] = useState<RailSlug>(RAILS[0].slug);

  // Per-rail local product-id ordering
  const [railProductIds, setRailProductIds] = useState<Record<RailSlug, string[]>>({
    "bestsellers-food": [],
    "bestsellers-craft": [],
    "trending-food": [],
    "trending-craft": [],
  });

  // Catalog cache per kind so switching tabs is instant
  const [catalogByKind, setCatalogByKind] = useState<Record<"food" | "craft", AdminProductSummary[]>>({
    food: [],
    craft: [],
  });

  // All seen products map for quick lookups
  const [seenProducts, setSeenProducts] = useState<Map<string, AdminProductSummary>>(new Map());

  // Search input
  const [searchQ, setSearchQ] = useState("");

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const activeRailDef = useMemo(
    () => RAILS.find((r) => r.slug === activeRail)!,
    [activeRail],
  );

  const existingCollection = useMemo(
    () => collections.find((c) => c.slug === activeRail),
    [collections, activeRail],
  );

  const currentIds = railProductIds[activeRail] ?? [];

  // -------------------------------------------------------------------------
  // Fetch collections & initial products
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getCollectionsAdmin(),
      getAllProductsAdmin({ kind: "food", pageSize: 100 }),
      getAllProductsAdmin({ kind: "craft", pageSize: 100 }),
    ])
      .then(([cols, foodPage, craftPage]) => {
        if (cancelled) return;
        setCollections(cols);

        setCatalogByKind({
          food: foodPage.items,
          craft: craftPage.items,
        });

        // Populate seen products
        setSeenProducts((prev) => {
          const next = new Map(prev);
          for (const p of [...foodPage.items, ...craftPage.items]) next.set(p.id, p);
          return next;
        });

        // Hydrate each rail's product-id list from fetched collections
        const initial: Record<RailSlug, string[]> = {
          "bestsellers-food": [],
          "bestsellers-craft": [],
          "trending-food": [],
          "trending-craft": [],
        };
        for (const rail of RAILS) {
          const col = cols.find((c) => c.slug === rail.slug);
          if (col && Array.isArray(col.productIds)) {
            initial[rail.slug] = [...col.productIds];
          }
        }
        setRailProductIds(initial);
      })
      .catch((err) => {
        console.error("Failed to load curation data", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch missing catalog if needed when active rail changes
  useEffect(() => {
    const kind = activeRailDef.kind;
    if (catalogByKind[kind].length > 0) return;

    let cancelled = false;
    setLoadingCatalog(true);
    getAllProductsAdmin({ kind, pageSize: 100 })
      .then((page) => {
        if (cancelled) return;
        setCatalogByKind((prev) => ({ ...prev, [kind]: page.items }));
        setSeenProducts((prev) => {
          const next = new Map(prev);
          for (const p of page.items) next.set(p.id, p);
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeRailDef.kind, catalogByKind]);

  // Reset search when active rail changes
  useEffect(() => {
    setSearchQ("");
    setSaveMsg(null);
  }, [activeRail]);

  // -------------------------------------------------------------------------
  // Filtered available catalog products
  // -------------------------------------------------------------------------
  const availableCatalog = useMemo(() => {
    const list = catalogByKind[activeRailDef.kind] ?? [];
    const q = searchQ.trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.vendorName?.toLowerCase().includes(q) ||
        p.categoryName?.toLowerCase().includes(q),
    );
  }, [catalogByKind, activeRailDef.kind, searchQ]);

  // -------------------------------------------------------------------------
  // Rail item ordering helpers
  // -------------------------------------------------------------------------
  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      setRailProductIds((prev) => {
        const ids = [...prev[activeRail]];
        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
        return { ...prev, [activeRail]: ids };
      });
      setSaveMsg(null);
    },
    [activeRail],
  );

  const moveDown = useCallback(
    (index: number) => {
      setRailProductIds((prev) => {
        const ids = [...prev[activeRail]];
        if (index >= ids.length - 1) return prev;
        [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
        return { ...prev, [activeRail]: ids };
      });
      setSaveMsg(null);
    },
    [activeRail],
  );

  const removeProduct = useCallback(
    (productId: string) => {
      setRailProductIds((prev) => ({
        ...prev,
        [activeRail]: prev[activeRail].filter((id) => id !== productId),
      }));
      setSaveMsg(null);
    },
    [activeRail],
  );

  const addProduct = useCallback(
    (product: AdminProductSummary) => {
      setSeenProducts((prev) => new Map(prev).set(product.id, product));
      setRailProductIds((prev) => {
        if (prev[activeRail].includes(product.id)) return prev;
        return { ...prev, [activeRail]: [...prev[activeRail], product.id] };
      });
      setSaveMsg(null);
    },
    [activeRail],
  );

  // -------------------------------------------------------------------------
  // Save rail
  // -------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await upsertCollection({
        id: existingCollection?.id,
        slug: activeRailDef.slug,
        title: activeRailDef.title,
        productIds: currentIds,
      });

      // Update local collections list
      setCollections((prev) => {
        const idx = prev.findIndex((c) => c.slug === activeRailDef.slug || c.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });

      setSaveMsg({ text: "✓ Saved! Changes are now live on the landing page.", isError: false });
    } catch (err) {
      setSaveMsg({
        text: err instanceof Error ? err.message : "Failed to save rail.",
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }, [existingCollection, activeRailDef, currentIds]);

  return (
    <div>
      <AdminPageHeader
        title="Bestsellers &amp; Trending"
        subtitle="Select and arrange products to feature as Bestsellers (Food &amp; Gifts) and Trending on the HomeKrafted landing page."
      />

      <CollectionsTabs active="curations" />

      {/* Rail selector tabs */}
      <div className={styles.railTabs} role="tablist" aria-label="Curated Rail">
        {RAILS.map((rail) => {
          const count = railProductIds[rail.slug]?.length ?? 0;
          return (
            <button
              key={rail.slug}
              role="tab"
              aria-selected={activeRail === rail.slug}
              className={`${styles.railTab}${activeRail === rail.slug ? ` ${styles.railTabActive}` : ""}`}
              onClick={() => setActiveRail(rail.slug)}
            >
              {rail.title} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <LoadingRows rows={6} />
      ) : (
        <div className={styles.twoCol}>
          {/* Left: Curated items in this rail */}
          <Card padding="md">
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionLabel}>
                Curated items in {activeRailDef.title} ({currentIds.length})
              </h3>
            </div>
            <p className={styles.sectionSub}>
              Products appear in this exact sequence on the landing page. Top items appear first in the scroll rail.
            </p>

            <div className={styles.liveHint}>
              <Sparkles size={14} style={{ flexShrink: 0 }} />
              <span>{activeRailDef.hint}</span>
            </div>

            {currentIds.length === 0 ? (
              <div className={styles.empty}>
                <p>No products in this rail yet.</p>
                <p style={{ fontSize: 12.5, marginTop: 4 }}>
                  Select products from the catalog on the right to add them here.
                </p>
              </div>
            ) : (
              <ul className={styles.railList} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {currentIds.map((id, idx) => {
                  const product = seenProducts.get(id);
                  const weight = product
                    ? product.weightOptions?.find((w) => w.sku === product.defaultWeightSku) ??
                      product.weightOptions?.[0]
                    : undefined;
                  const imgSrc = product?.images?.[0]?.src;
                  const price = weight?.price;

                  return (
                    <li key={id} className={styles.railItem}>
                      <span className={styles.rankBadge}>#{idx + 1}</span>

                      <div className={styles.itemThumb}>
                        {imgSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imgSrc} alt="" className={styles.thumbImg} />
                        ) : (
                          <div className={styles.thumbFallback}>
                            <Utensils size={16} />
                          </div>
                        )}
                      </div>

                      <div className={styles.itemInfo}>
                        <span className={styles.itemName} title={product?.name ?? id}>
                          {product?.name ?? id}
                        </span>
                        <div className={styles.itemMeta}>
                          <span>{product?.vendorName ?? "Kitchen"}</span>
                          {price != null && (
                            <span className={styles.itemPrice}>{formatCurrency(price)}</span>
                          )}
                        </div>
                      </div>

                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          aria-label="Move up"
                          title="Move up"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => moveDown(idx)}
                          disabled={idx === currentIds.length - 1}
                          aria-label="Move down"
                          title="Move down"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.removeBtn}`}
                          onClick={() => removeProduct(id)}
                          aria-label={`Remove ${product?.name ?? id}`}
                          title="Remove from rail"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Save bar */}
            <div className={styles.saveRow}>
              <div>
                {saveMsg && (
                  <span
                    className={`${styles.saveStatus} ${saveMsg.isError ? styles.saveError : styles.saveSuccess}`}
                  >
                    {saveMsg.text}
                  </span>
                )}
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save rail"}
              </Button>
            </div>
          </Card>

          {/* Right: Select from products */}
          <Card padding="md">
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionLabel}>
                Select from {activeRailDef.kind === "food" ? "Homemade Food" : "Handcrafted Gifts"}
              </h3>
              <span style={{ fontSize: 12, color: "var(--hk-muted)" }}>
                {availableCatalog.length} available
              </span>
            </div>
            <p className={styles.sectionSub}>
              Browse through your verified {activeRailDef.kind === "food" ? "dishes" : "gifts"} and click &ldquo;+ Add to rail&rdquo; to include them.
            </p>

            <div className={styles.searchBox}>
              <span className={styles.searchIcon} aria-hidden="true">
                <Search size={16} />
              </span>
              <input
                className={styles.searchInput}
                type="search"
                placeholder={`Search ${activeRailDef.kind === "food" ? "dishes" : "gifts"} by name or kitchen…`}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                aria-label="Search available products"
              />
            </div>

            {loadingCatalog ? (
              <LoadingRows rows={4} />
            ) : availableCatalog.length === 0 ? (
              <div className={styles.empty}>
                <p>No products found matching &ldquo;{searchQ}&rdquo;.</p>
              </div>
            ) : (
              <div className={styles.catalogList}>
                {availableCatalog.map((product) => {
                  const inRail = currentIds.includes(product.id);
                  const weight =
                    product.weightOptions?.find((w) => w.sku === product.defaultWeightSku) ??
                    product.weightOptions?.[0];
                  const imgSrc = product.images?.[0]?.src;
                  const price = weight?.price;

                  return (
                    <div
                      key={product.id}
                      className={`${styles.catalogCard}${inRail ? ` ${styles.catalogCardInRail}` : ""}`}
                    >
                      <div className={styles.itemThumb}>
                        {imgSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imgSrc} alt="" className={styles.thumbImg} />
                        ) : (
                          <div className={styles.thumbFallback}>
                            <Utensils size={16} />
                          </div>
                        )}
                      </div>

                      <div className={styles.itemInfo}>
                        <span className={styles.itemName} title={product.name}>
                          {product.name}
                        </span>
                        <div className={styles.itemMeta}>
                          <span>{product.vendorName ?? "Kitchen"}</span>
                          {price != null && (
                            <>
                              <span>&bull;</span>
                              <span className={styles.itemPrice}>{formatCurrency(price)}</span>
                            </>
                          )}
                          {product.rating > 0 && (
                            <>
                              <span>&bull;</span>
                              <span>★ {product.rating.toFixed(1)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {inRail ? (
                        <span className={styles.inRailBadge}>
                          <Check size={13} />
                          In rail
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.addBtn}
                          onClick={() => addProduct(product)}
                        >
                          <Plus size={13} />
                          Add to rail
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
