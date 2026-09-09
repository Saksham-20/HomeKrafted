'use client';

/**
 * CurationsClient — lets admins curate four product rails:
 * `bestsellers-food`, `bestsellers-craft`, `trending-food`, `trending-craft`.
 *
 * Each rail maps 1-to-1 with a `Collection` slug. When the collection
 * already exists (identified by slug in the admin collections list) we
 * PATCH it by id; otherwise we POST a new one whose title slugifies to the
 * fixed slug we need.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, Trash2 } from 'lucide-react';
import {
  getAllProductsAdmin,
  getCollectionsAdmin,
  upsertCollection,
  type AdminProductSummary,
} from '@/lib/api/admin';
import type { Collection } from '@/lib/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { AdminPageHeader } from './AdminPageHeader';
import { CollectionsTabs } from './CollectionsTabs';
import { LoadingRows } from '@/components/portal/LoadingRows';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import styles from './CurationsClient.module.css';

// ---------------------------------------------------------------------------
// Rail definitions — order is display order in the tab strip.
// The title is the canonical human-readable label AND the value passed to
// upsertCollection so the server generates a stable slug from it on first
// creation. On subsequent saves we use the collection id (PATCH), so the
// title/slug drift issue never arises.
// ---------------------------------------------------------------------------
const RAILS = [
  { slug: 'bestsellers-food',  title: 'Bestsellers — Food',  kind: 'food'  },
  { slug: 'bestsellers-craft', title: 'Bestsellers — Gifts', kind: 'craft' },
  { slug: 'trending-food',     title: 'Trending — Food',     kind: 'food'  },
  { slug: 'trending-craft',    title: 'Trending — Gifts',    kind: 'craft' },
] as const;

type RailSlug = (typeof RAILS)[number]['slug'];

export function CurationsClient() {
  useAuth(); // ensures we are inside an AuthProvider; guards against mis-use

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeRail, setActiveRail]   = useState<RailSlug>(RAILS[0].slug);

  // Per-rail local product-id ordering — initialised from the fetched
  // collection, then mutated client-side until the admin hits Save.
  const [railProductIds, setRailProductIds] = useState<Record<RailSlug, string[]>>({
    'bestsellers-food':  [],
    'bestsellers-craft': [],
    'trending-food':     [],
    'trending-craft':    [],
  });

  // Search state (shared across rails — clears when rail changes)
  const [searchQ, setSearchQ]           = useState('');
  const [searchResults, setSearchResults] = useState<AdminProductSummary[]>([]);
  const [searching, setSearching]       = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Initial data fetch
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getCollectionsAdmin(), getAllProductsAdmin()])
      .then(([cols, prodsPage]) => {
        if (cancelled) return;
        setCollections(cols);

        // Pre-populate seen products map so names are immediately visible
        setSeenProducts((prev) => {
          const next = new Map(prev);
          for (const p of prodsPage.items) next.set(p.id, p);
          return next;
        });

        // Hydrate each rail's product-id list from the fetched collections
        const initial: Record<RailSlug, string[]> = {
          'bestsellers-food':  [],
          'bestsellers-craft': [],
          'trending-food':     [],
          'trending-craft':    [],
        };
        for (const rail of RAILS) {
          const col = cols.find((c) => c.slug === rail.slug);
          if (col) initial[rail.slug] = [...col.productIds];
        }
        setRailProductIds(initial);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // -------------------------------------------------------------------------
  // Product search — debounced on the query string
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!searchQ.trim()) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const page = await getAllProductsAdmin({ q: searchQ.trim() });
        if (!cancelled) setSearchResults(page.items.slice(0, 8));
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQ]);

  // Reset search when the active rail changes
  useEffect(() => {
    setSearchQ('');
    setSearchResults([]);
    setSaveMsg(null);
  }, [activeRail]);

  // -------------------------------------------------------------------------
  // Derived helpers
  // -------------------------------------------------------------------------
  const activeRailDef = useMemo(
    () => RAILS.find((r) => r.slug === activeRail)!,
    [activeRail],
  );

  const existingCollection = useMemo(
    () => collections.find((c) => c.slug === activeRail),
    [collections, activeRail],
  );

  const currentIds = railProductIds[activeRail];

  // Product lookup map (built from search results + any previously-seen results
  // stored in a ref) — we only need names for the items in the current rail,
  // so we build a lookup from all products we have seen in search results.
  const [seenProducts, setSeenProducts] = useState<Map<string, AdminProductSummary>>(new Map());

  useEffect(() => {
    if (searchResults.length === 0) return;
    setSeenProducts((prev) => {
      const next = new Map(prev);
      for (const p of searchResults) next.set(p.id, p);
      return next;
    });
  }, [searchResults]);

  // Filtered search results — exclude products already in the current rail
  const filteredResults = useMemo(
    () => searchResults.filter((p) => !currentIds.includes(p.id)),
    [searchResults, currentIds],
  );

  // -------------------------------------------------------------------------
  // Rail mutation helpers
  // -------------------------------------------------------------------------
  const moveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setRailProductIds((prev) => {
      const ids = [...prev[activeRail]];
      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
      return { ...prev, [activeRail]: ids };
    });
  }, [activeRail]);

  const moveDown = useCallback((index: number) => {
    setRailProductIds((prev) => {
      const ids = [...prev[activeRail]];
      if (index >= ids.length - 1) return prev;
      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
      return { ...prev, [activeRail]: ids };
    });
  }, [activeRail]);

  const removeProduct = useCallback((productId: string) => {
    setRailProductIds((prev) => ({
      ...prev,
      [activeRail]: prev[activeRail].filter((id) => id !== productId),
    }));
  }, [activeRail]);

  const addProduct = useCallback((product: AdminProductSummary) => {
    setSeenProducts((prev) => new Map(prev).set(product.id, product));
    setRailProductIds((prev) => {
      if (prev[activeRail].includes(product.id)) return prev;
      return { ...prev, [activeRail]: [...prev[activeRail], product.id] };
    });
    // Clear search so the result list collapses
    setSearchQ('');
    setSearchResults([]);
  }, [activeRail]);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await upsertCollection({
        id: existingCollection?.id,
        title: activeRailDef.title,
        productIds: currentIds,
      });
      // Update local collections list so subsequent saves use the correct id
      setCollections((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setSaveMsg('Saved!');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [existingCollection, activeRailDef, currentIds]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div>
      <AdminPageHeader
        title="Bestsellers &amp; Trending"
        subtitle="Curate the four product rails that appear on the HomeKrafted home page. Drag products into order — the first item in each rail is shown most prominently."
      />

      <CollectionsTabs active="curations" />

      {/* Rail selector tabs */}
      <div className={styles.railTabs} role="tablist" aria-label="Rail">
        {RAILS.map((rail) => (
          <button
            key={rail.slug}
            role="tab"
            aria-selected={activeRail === rail.slug}
            className={`${styles.railTab}${activeRail === rail.slug ? ` ${styles.railTabActive}` : ''}`}
            onClick={() => setActiveRail(rail.slug)}
          >
            {rail.title}
          </button>
        ))}
      </div>

      {/* Main content */}
      {loading ? (
        <LoadingRows rows={6} />
      ) : (
        <div className={styles.twoCol}>
          {/* Left: current rail items */}
          <Card padding="md">
            <div className={styles.railSection}>
              <p className={styles.sectionLabel}>
                Current items{' '}
                <span style={{ fontWeight: 400, color: 'var(--hk-muted)' }}>
                  ({currentIds.length})
                </span>
              </p>

              {currentIds.length === 0 ? (
                <p className={styles.empty}>No products in this rail yet.</p>
              ) : (
                <ul className={styles.railList} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {currentIds.map((id, idx) => {
                    const product = seenProducts.get(id);
                    return (
                      <li key={id} className={styles.railItem}>
                        <span className={styles.railItemName}>
                          {product?.name ?? id}
                        </span>
                        {product?.kind && (
                          <span className={styles.railItemKind}>{product.kind}</span>
                        )}
                        <button
                          className={styles.iconBtn}
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          aria-label="Move up"
                          title="Move up"
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          className={styles.iconBtn}
                          onClick={() => moveDown(idx)}
                          disabled={idx === currentIds.length - 1}
                          aria-label="Move down"
                          title="Move down"
                        >
                          <ChevronDown size={15} />
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.removeBtn}`}
                          onClick={() => removeProduct(id)}
                          aria-label={`Remove ${product?.name ?? id}`}
                          title="Remove"
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Save row */}
              <div className={styles.saveRow}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save rail'}
                </Button>
              </div>
              {saveMsg && (
                <p
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    textAlign: 'right',
                    color: saveMsg === 'Saved!' ? 'var(--hk-pine, #2a5c45)' : '#c0392b',
                  }}
                >
                  {saveMsg}
                </p>
              )}
            </div>
          </Card>

          {/* Right: product search */}
          <Card padding="md">
            <div className={styles.searchSection}>
              <p className={styles.sectionLabel}>Add a product</p>

              <div className={styles.searchBox}>
                <span className={styles.searchIcon} aria-hidden="true">
                  <Search size={16} />
                </span>
                <input
                  className={styles.searchInput}
                  type="search"
                  placeholder="Search products by name…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  aria-label="Search products"
                />
              </div>

              {searchQ.trim() && (
                <div className={styles.searchResults}>
                  {searching && (
                    <p className={styles.empty} style={{ padding: '12px 0' }}>
                      Searching…
                    </p>
                  )}
                  {!searching && filteredResults.length === 0 && (
                    <p className={styles.empty} style={{ padding: '12px 0' }}>
                      No products found.
                    </p>
                  )}
                  {!searching &&
                    filteredResults.map((product) => (
                      <button
                        key={product.id}
                        className={styles.searchResult}
                        onClick={() => addProduct(product)}
                        aria-label={`Add ${product.name} to rail`}
                      >
                        <Plus size={14} style={{ flexShrink: 0, color: 'var(--hk-pine, #2a5c45)' }} />
                        <span className={styles.resultName}>{product.name}</span>
                        {product.kind && (
                          <span className={styles.railItemKind}>{product.kind}</span>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
