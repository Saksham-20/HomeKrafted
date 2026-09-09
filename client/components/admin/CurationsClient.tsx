"use client";

/**
 * CurationsClient — lets admins curate four product rails:
 * `bestsellers-food`, `bestsellers-craft`, `trending-food`, `trending-craft`.
 *
 * Each rail maps 1-to-1 with a `Collection` slug. When the collection
 * already exists (identified by slug in the admin collections list) we
 * PATCH it by id; otherwise we POST a new one with the canonical slug.
 *
 * Includes live Sales Intelligence: detects when uncurated products
 * have higher orders, ratings, or customer review velocity than currently
 * selected rail items, offering 1-click swaps and smart auto-filling.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Utensils,
  Zap,
} from "lucide-react";
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

/**
 * Composite performance score:
 * Order volume is given highest priority (100 pts / order).
 * Customer rating (0-50 pts) and review counts break ties.
 * If orders are 0 (e.g. newly launched), ratings and reviews drive the score.
 */
function getProductScore(p: AdminProductSummary): number {
  const orders = p.orderCount ?? 0;
  const rating = Number(p.rating) || 0;
  const reviews = p.reviewCount ?? 0;
  return orders * 100 + rating * 10 + reviews;
}

export function CurationsClient() {
  useAuth();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRail, setActiveRail] = useState<RailSlug>(RAILS[0].slug);

  // Per-rail local product-id ordering
  const [railProductIds, setRailProductIds] = useState<Record<RailSlug, string[]>>({
    "bestsellers-food": [],
    "bestsellers-craft": [],
    "trending-food": [],
    "trending-craft": [],
  });

  // Catalog cache per kind (pre-loaded on mount)
  const [catalogByKind, setCatalogByKind] = useState<Record<"food" | "craft", AdminProductSummary[]>>({
    food: [],
    craft: [],
  });

  // All seen products map for quick lookups
  const [seenProducts, setSeenProducts] = useState<Map<string, AdminProductSummary>>(new Map());

  // Search input
  const [searchQ, setSearchQ] = useState("");

  // Catalog browser filter tab: 'all' | 'top' | 'better'
  const [catalogFilter, setCatalogFilter] = useState<"all" | "top" | "better">("all");

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
  // Fetch collections & initial products across both food and craft
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getCollectionsAdmin(),
      getAllProductsAdmin({ kind: "food", pageSize: 150 }),
      getAllProductsAdmin({ kind: "craft", pageSize: 150 }),
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

  // Reset search and filter when active rail changes
  useEffect(() => {
    setSearchQ("");
    setCatalogFilter("all");
    setSaveMsg(null);
  }, [activeRail]);

  // -------------------------------------------------------------------------
  // Sales Intelligence & Performance Comparisons
  // -------------------------------------------------------------------------

  // Curated products currently in the rail
  const currentCuratedProducts = useMemo(() => {
    return currentIds.map((id) => seenProducts.get(id)).filter(Boolean) as AdminProductSummary[];
  }, [currentIds, seenProducts]);

  // All products of the active category kind
  const allKindProducts = useMemo(() => {
    return catalogByKind[activeRailDef.kind] ?? [];
  }, [catalogByKind, activeRailDef.kind]);

  // Candidate products (not currently in rail), sorted by score descending
  const candidatesNotInRail = useMemo(() => {
    return allKindProducts
      .filter((p) => !currentIds.includes(p.id))
      .sort((a, b) => getProductScore(b) - getProductScore(a));
  }, [allKindProducts, currentIds]);

  // Map of candidateId -> { inferiorItem, rank, scoreDiff } for any candidate
  // that outperforms an existing item in the curated rail
  const candidateBetterThanMap = useMemo(() => {
    const map = new Map<
      string,
      { inferiorItem: AdminProductSummary; rank: number; scoreDiff: number }
    >();
    if (currentCuratedProducts.length === 0) return map;

    for (const candidate of candidatesNotInRail) {
      const candidateScore = getProductScore(candidate);
      let lowestInferior: AdminProductSummary | null = null;
      let lowestRank = -1;
      let lowestScore = Infinity;

      currentCuratedProducts.forEach((curated, idx) => {
        const curScore = getProductScore(curated);
        if (candidateScore > curScore && curScore < lowestScore) {
          lowestScore = curScore;
          lowestInferior = curated;
          lowestRank = idx + 1;
        }
      });

      if (lowestInferior) {
        map.set(candidate.id, {
          inferiorItem: lowestInferior,
          rank: lowestRank,
          scoreDiff: candidateScore - lowestScore,
        });
      }
    }
    return map;
  }, [candidatesNotInRail, currentCuratedProducts]);

  const betterCandidatesCount = useMemo(() => {
    return candidateBetterThanMap.size;
  }, [candidateBetterThanMap]);

  // -------------------------------------------------------------------------
  // Filtered available catalog products
  // -------------------------------------------------------------------------
  const availableCatalog = useMemo(() => {
    let list = allKindProducts;
    if (catalogFilter === "top") {
      list = [...allKindProducts].sort((a, b) => getProductScore(b) - getProductScore(a));
    } else if (catalogFilter === "better") {
      list = candidatesNotInRail.filter((p) => candidateBetterThanMap.has(p.id));
    }

    const q = searchQ.trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.vendorName?.toLowerCase().includes(q) ||
        p.categoryName?.toLowerCase().includes(q),
    );
  }, [allKindProducts, catalogFilter, candidatesNotInRail, candidateBetterThanMap, searchQ]);

  // -------------------------------------------------------------------------
  // Rail item ordering and manipulation helpers
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

  // 1-Click Swap an inferior curated item with an outperforming candidate
  const handleSwap = useCallback(
    (curatedId: string, candidate: AdminProductSummary) => {
      setSeenProducts((prev) => new Map(prev).set(candidate.id, candidate));
      setRailProductIds((prev) => {
        const ids = [...(prev[activeRail] ?? [])];
        const idx = ids.indexOf(curatedId);
        if (idx !== -1) {
          ids[idx] = candidate.id;
        }
        return { ...prev, [activeRail]: ids };
      });
      setSaveMsg({
        text: `✓ Swapped in "${candidate.name}". Click "Save rail" to publish live.`,
        isError: false,
      });
    },
    [activeRail],
  );

  // Auto-fill an empty rail with top performers
  const handleAutoFill = useCallback(() => {
    const top8 = [...allKindProducts]
      .sort((a, b) => getProductScore(b) - getProductScore(a))
      .slice(0, 8);

    setSeenProducts((prev) => {
      const next = new Map(prev);
      for (const p of top8) next.set(p.id, p);
      return next;
    });

    setRailProductIds((prev) => ({
      ...prev,
      [activeRail]: top8.map((p) => p.id),
    }));

    setSaveMsg({
      text: `✓ Auto-populated rail with top 8 ${activeRailDef.kind === "food" ? "dishes" : "gifts"}! Click "Save rail" to publish.`,
      isError: false,
    });
  }, [allKindProducts, activeRail, activeRailDef.kind]);

  // Upgrade rail with top candidates
  const handleApplyAllSuggestions = useCallback(() => {
    const targetCount = Math.max(8, currentIds.length);
    const topCandidates = [...allKindProducts]
      .sort((a, b) => getProductScore(b) - getProductScore(a))
      .slice(0, targetCount);

    setSeenProducts((prev) => {
      const next = new Map(prev);
      for (const p of topCandidates) next.set(p.id, p);
      return next;
    });

    setRailProductIds((prev) => ({
      ...prev,
      [activeRail]: topCandidates.map((p) => p.id),
    }));

    setSaveMsg({
      text: `✓ Promoted top ${topCandidates.length} best-performing items into this rail! Click "Save rail" to publish.`,
      isError: false,
    });
  }, [allKindProducts, activeRail, currentIds.length]);

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

            {/* Sales Intelligence Alert Banner */}
            {betterCandidatesCount > 0 && currentIds.length > 0 && (
              <div className={styles.insightBanner}>
                <div className={styles.insightHeader}>
                  <TrendingUp size={16} className={styles.insightIcon} />
                  <span>Sales &amp; Rating Intelligence</span>
                </div>
                <p className={styles.insightBody}>
                  Detected <strong>{betterCandidatesCount} {activeRailDef.kind === "food" ? "dishes" : "gifts"}</strong> in your live catalog with higher order volume or customer reviews than items currently in this rail.
                </p>
                <div className={styles.insightActions}>
                  <button
                    type="button"
                    className={styles.insightBtn}
                    onClick={handleApplyAllSuggestions}
                  >
                    <Zap size={13} />
                    Auto-upgrade to top performers
                  </button>
                  <button
                    type="button"
                    className={styles.insightSecondaryBtn}
                    onClick={() => setCatalogFilter("better")}
                  >
                    View outperforming items →
                  </button>
                </div>
              </div>
            )}

            {currentIds.length === 0 ? (
              <div className={styles.emptyCard}>
                <Sparkles size={24} className={styles.emptyCardIcon} />
                <h4 className={styles.emptyCardTitle}>No products selected yet</h4>
                <p className={styles.emptyCardSub}>
                  This rail is currently empty. You can browse and select live products from the catalog on the right, or auto-fill with the platform&apos;s top-performing items.
                </p>
                <button
                  type="button"
                  className={styles.autoFillBtn}
                  onClick={handleAutoFill}
                >
                  <Zap size={14} />
                  Auto-fill with top {activeRailDef.kind === "food" ? "dishes" : "gifts"}
                </button>
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

                  // Check if this item is beaten by any uncurated candidate
                  const hasBetterCandidate = product
                    ? candidatesNotInRail.some(
                        (c) => getProductScore(c) > getProductScore(product),
                      )
                    : false;

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
                        <div className={styles.itemNameRow}>
                          <span className={styles.itemName} title={product?.name ?? id}>
                            {product?.name ?? id}
                          </span>
                          {hasBetterCandidate && (
                            <span
                              className={styles.inferiorFlag}
                              title="Higher-performing candidate available in catalog"
                            >
                              Lower performer
                            </span>
                          )}
                        </div>
                        <div className={styles.itemMeta}>
                          <span>{product?.vendorName ?? "Kitchen"}</span>
                          {price != null && (
                            <>
                              <span>&bull;</span>
                              <span className={styles.itemPrice}>{formatCurrency(price)}</span>
                            </>
                          )}
                          <span>&bull;</span>
                          <span className={styles.metricPill}>
                            <ShoppingBag size={11} />
                            {product?.orderCount ?? 0} orders
                          </span>
                          {product?.rating ? (
                            <>
                              <span>&bull;</span>
                              <span className={styles.metricPill}>
                                <Star size={11} className={styles.starIcon} />
                                {Number(product.rating).toFixed(1)} ({product.reviewCount ?? 0})
                              </span>
                            </>
                          ) : null}
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

            {/* Filter pills: All / Top / Outperforming */}
            <div className={styles.catalogFilterRow}>
              <button
                type="button"
                className={`${styles.filterPill}${catalogFilter === "all" ? ` ${styles.filterPillActive}` : ""}`}
                onClick={() => setCatalogFilter("all")}
              >
                All ({allKindProducts.length})
              </button>
              <button
                type="button"
                className={`${styles.filterPill}${catalogFilter === "top" ? ` ${styles.filterPillActive}` : ""}`}
                onClick={() => setCatalogFilter("top")}
              >
                <Flame size={12} />
                Top Candidates
              </button>
              {betterCandidatesCount > 0 && (
                <button
                  type="button"
                  className={`${styles.filterPill} ${styles.filterPillHighlight}${catalogFilter === "better" ? ` ${styles.filterPillActive}` : ""}`}
                  onClick={() => setCatalogFilter("better")}
                >
                  <TrendingUp size={12} />
                  Outperforming Curated ({betterCandidatesCount})
                </button>
              )}
            </div>

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

            {availableCatalog.length === 0 ? (
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
                  const outperforming = candidateBetterThanMap.get(product.id);

                  return (
                    <div
                      key={product.id}
                      className={`${styles.catalogCard}${inRail ? ` ${styles.catalogCardInRail}` : ""}${outperforming && !inRail ? ` ${styles.outperformCard}` : ""}`}
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
                          <span>&bull;</span>
                          <span className={styles.metricPill}>
                            <ShoppingBag size={11} />
                            {product.orderCount ?? 0} orders
                          </span>
                          {product.rating > 0 && (
                            <>
                              <span>&bull;</span>
                              <span className={styles.metricPill}>
                                <Star size={11} className={styles.starIcon} />
                                {Number(product.rating).toFixed(1)} ({product.reviewCount ?? 0})
                              </span>
                            </>
                          )}
                        </div>
                        {outperforming && !inRail && (
                          <div className={styles.outperformBadge}>
                            <TrendingUp size={12} />
                            <span>
                              Better than #{outperforming.rank} ({outperforming.inferiorItem.name})
                            </span>
                          </div>
                        )}
                      </div>

                      {inRail ? (
                        <span className={styles.inRailBadge}>
                          <Check size={13} />
                          In rail
                        </span>
                      ) : outperforming ? (
                        <div className={styles.candidateActions}>
                          <button
                            type="button"
                            className={styles.swapBtn}
                            onClick={() => handleSwap(outperforming.inferiorItem.id, product)}
                            title={`Replace #${outperforming.rank} with this better performer`}
                          >
                            <ArrowRightLeft size={11} />
                            Swap #{outperforming.rank}
                          </button>
                          <button
                            type="button"
                            className={styles.addBtn}
                            onClick={() => addProduct(product)}
                          >
                            <Plus size={13} />
                            Add
                          </button>
                        </div>
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
