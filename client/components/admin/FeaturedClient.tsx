"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SearchField } from "@/components/ui/SearchField";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SaveBar } from "@/components/portal/SaveBar";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import {
  MAX_FEATURED_PRODUCTS,
  getAllProductsAdmin,
  getFeaturedProducts,
  setFeaturedProducts,
  type AdminProductSummary,
} from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import { appendItem, canAppend, moveItem, removeItem } from "@/lib/portal/reorder";
import styles from "./FeaturedClient.module.css";

/** How many live listings the picker shows at once — a screenful, not a catalogue. */
const PICKER_SIZE = 12;

/** The server's sentence when there is one, our own when the request never got an answer. */
function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * `/admin/catalog/featured` (2026-09-19) — which listings lead the
 * default browse, and in what order.
 *
 * **Two pieces of state, and only one is saved.** `ids` is the working
 * list an admin is arranging; `baseline` is what the server last held.
 * Save is enabled by `isDirty(baseline, ids)` and the baseline is reset
 * from the response after a save, or the bar stays lit for ever (the
 * portal kit's rule).
 *
 * **Array position is the rank.** The first listing is rank 1, and saving
 * replaces the whole set: anything featured that is not in the list is
 * unfeatured. That is why removing a row here is a real decision and the
 * save bar says how many listings are in the list.
 *
 * **Order is by buttons, not by dragging.** A drag needs a pointer and
 * a lot of care to be usable from a keyboard or a screen reader; two
 * labelled buttons per row are keyboard-operable as they stand, and the
 * screen announces where a listing ended up. Focus follows the listing
 * that moved so a run of presses keeps moving the same one.
 *
 * **Focus stays where the person is working.** Every button that changes the
 * list either unmounts itself (Remove, and Add, which is replaced by a
 * "Featured · N" label) or moves under the cursor (Move). Left alone, focus
 * falls to `<body>` and the next Tab starts at the top of the page, so a run
 * of removals or additions by keyboard would mean re-tabbing from the header
 * each time. `PendingFocus` says where it goes next, and the effect on `ids`
 * puts it there once the list has re-rendered.
 *
 * **Featuring is not publishing.** A listing that is hidden, flagged or
 * paused by its maker can still be in the list — it is shown with why it
 * is not live, so it can be taken out — but the picker only offers live
 * listings, so nobody adds one by accident. Buyers only ever see a
 * featured listing that also passes the review gate.
 *
 * **Save says what it loaded from.** `baseline` rides along as `basedOn`, so
 * a list opened before another admin featured something is refused (409)
 * rather than silently unfeaturing it; the notice then offers a reload.
 */

/** Where focus goes once the list has re-rendered after a change. */
type PendingFocus =
  | { kind: "move"; id: string; direction: "up" | "down" }
  /** `index` is the position the removed row had — the row that slides into it takes focus. */
  | { kind: "remove"; index: number }
  /** The listing just added; its Add button is gone, so the next Add in the results is next. */
  | { kind: "add"; id: string };

export function FeaturedClient() {
  const { ready, role } = useAuth();
  const isAdmin = ready && role === "admin";

  const [ids, setIds] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<string[]>([]);
  /** Every listing seen so far, by id — the featured list and whatever the picker returned. */
  const [known, setKnown] = useState<Map<string, AdminProductSummary>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The refusal was the stale-list 409, so the notice offers a reload rather than "try again". */
  const [saveConflict, setSaveConflict] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [resultsToken, setResultsToken] = useState(0);
  /**
   * The picker's last answer and the request it answered. "Loading" is
   * derived — the answer is for a different key than the one now wanted —
   * rather than a flag set at the top of an effect, so typing never
   * blanks the list mid-search: the previous results stay until the new
   * ones land.
   */
  const [answer, setAnswer] = useState<{
    key: string;
    items: AdminProductSummary[];
    error: string | null;
  } | null>(null);

  /** Read out by a polite live region: "Amber moved to position 2 of 5." */
  const [announcement, setAnnouncement] = useState("");
  /** Where to put focus after a change, once the list has re-rendered. */
  const pendingFocus = useRef<PendingFocus | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  /** Wraps the search field: `SearchField` does not forward a ref, and the input is what focus returns to. */
  const searchRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // The featured list
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;
    getFeaturedProducts()
      .then((list) => {
        if (ignore) return;
        const next = list.items.map((product) => product.id);
        setIds(next);
        setBaseline(next);
        setKnown((current) => {
          const merged = new Map(current);
          for (const product of list.items) merged.set(product.id, product);
          return merged;
        });
      })
      .catch((error: unknown) => {
        if (ignore) return;
        // A failed read is a Notice with Try again, never the empty state —
        // "nothing is featured" over a list we could not fetch would invite
        // an admin to save an empty one.
        setLoadError(messageOf(error, "We couldn’t load the featured list."));
      })
      .finally(() => {
        if (!ignore) setLoaded(true);
      });
    return () => {
      ignore = true;
    };
  }, [isAdmin, reloadToken]);

  // -------------------------------------------------------------------------
  // The picker: live listings only
  // -------------------------------------------------------------------------
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const resultsKey = `${debouncedQuery}|${resultsToken}`;
  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;
    // `active` is the review gate's "live" — the same allowlist buyers are
    // held to. A listing still waiting for review is not something to lead
    // a page with.
    getAllProductsAdmin({ status: "active", q: debouncedQuery || undefined, pageSize: PICKER_SIZE })
      .then((page) => {
        if (!ignore) setAnswer({ key: resultsKey, items: page.items, error: null });
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setAnswer({
            key: resultsKey,
            items: [],
            error: messageOf(error, "We couldn’t search the catalogue."),
          });
        }
      });
    return () => {
      ignore = true;
    };
  }, [isAdmin, debouncedQuery, resultsKey]);

  const results = answer?.items ?? [];
  const resultsLoading = answer?.key !== resultsKey;
  const resultsError = answer?.key === resultsKey ? answer.error : null;

  // After a change the focused button may be gone (Remove, Add) or the row
  // may have a new index (Move, and if it hit an end, one of its two buttons
  // is now disabled). Put focus somewhere the person can carry on from.
  // Looked up in the DOM rather than held in refs: `Button` does not take
  // one, and a `data-` attribute on each button is all this needs.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const searchInput = () => searchRef.current?.querySelector<HTMLInputElement>("input") ?? null;

    if (target.kind === "move") {
      // The same direction's button, or the other one if that can no longer
      // be pressed, so a run of presses keeps moving the same listing.
      const buttons = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-move-id]") ?? [],
      ).filter((button) => button.dataset.moveId === target.id);
      const preferred = buttons.find((button) => button.dataset.moveDir === target.direction);
      const other = buttons.find((button) => button.dataset.moveDir !== target.direction);
      (preferred && !preferred.disabled ? preferred : other)?.focus();
      return;
    }

    if (target.kind === "remove") {
      // The row that slid into the removed one's place — or the new last row
      // if it was the last — so removing several in a row is repeated Enter.
      // An empty list has no rows: the search field is the way forward.
      const removers = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-remove-id]") ?? [],
      );
      (removers[Math.min(target.index, removers.length - 1)] ?? searchInput())?.focus();
      return;
    }

    // Add: the added row's button has become a "Featured · N" label. Carry on
    // down the results from there (the next listing to consider), then back
    // up, then the search field — which is also where a now-full list ends up,
    // since every Add is disabled.
    const rows = Array.from(resultsRef.current?.children ?? []) as HTMLElement[];
    const at = rows.findIndex((row) => row.dataset.resultId === target.id);
    const addIn = (row: HTMLElement | undefined) =>
      row?.querySelector<HTMLButtonElement>("button[data-add-id]:not(:disabled)") ?? null;
    let next: HTMLButtonElement | null = null;
    for (let i = at + 1; at !== -1 && i < rows.length && !next; i += 1) next = addIn(rows[i]);
    for (let i = at - 1; at !== -1 && i >= 0 && !next; i -= 1) next = addIn(rows[i]);
    (next ?? searchInput())?.focus();
  }, [ids]);

  const nameOf = useCallback((id: string) => known.get(id)?.name ?? id, [known]);

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const id = ids[index];
      if (id === undefined) return;
      const next = moveItem(ids, index, direction);
      pendingFocus.current = { kind: "move", id, direction: direction === -1 ? "up" : "down" };
      setIds(next);
      setSaved(false);
      setSaveError(null);
      setSaveConflict(false);
      setAnnouncement(`${nameOf(id)} moved to position ${next.indexOf(id) + 1} of ${next.length}.`);
    },
    [ids, nameOf],
  );

  const remove = useCallback(
    (id: string) => {
      pendingFocus.current = { kind: "remove", index: ids.indexOf(id) };
      setIds((current) => removeItem(current, id));
      setSaved(false);
      setSaveError(null);
      setSaveConflict(false);
      setAnnouncement(`${nameOf(id)} removed from the featured list.`);
    },
    [ids, nameOf],
  );

  const add = useCallback(
    (product: AdminProductSummary) => {
      if (canAppend(ids, product.id, MAX_FEATURED_PRODUCTS) !== "ok") return;
      pendingFocus.current = { kind: "add", id: product.id };
      setKnown((current) => new Map(current).set(product.id, product));
      setIds(appendItem(ids, product.id, MAX_FEATURED_PRODUCTS));
      setSaved(false);
      setSaveError(null);
      setSaveConflict(false);
      setAnnouncement(`${product.name} added at position ${ids.length + 1}.`);
    },
    [ids],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveConflict(false);
    setSaved(false);
    try {
      // `baseline` is what this screen loaded (or last saved): the server
      // refuses the save if it would unfeature a listing added since.
      const list = await setFeaturedProducts(ids, baseline);
      const next = list.items.map((product) => product.id);
      // Both reset from what the server answered with, not from what was
      // sent: the response is the truth about ranks, and the baseline has
      // to equal the working list or the bar stays lit.
      setIds(next);
      setBaseline(next);
      setKnown((current) => {
        const merged = new Map(current);
        for (const product of list.items) merged.set(product.id, product);
        return merged;
      });
      setSaved(true);
      // No sr-only announcement here: the success notice below is a live
      // region and the save bar's status says "Saved" — a third one read
      // the same fact out three times.
      setAnnouncement("");
    } catch (error) {
      setSaveError(messageOf(error, "That didn’t save. Try again."));
      setSaveConflict(error instanceof ApiError && error.status === 409);
    } finally {
      setSaving(false);
    }
  }, [ids, baseline]);

  const dirty = isDirty(baseline, ids);
  const full = ids.length >= MAX_FEATURED_PRODUCTS;

  return (
    <div className={styles.wrap}>
      <AdminPageHeader
        title="Featured"
        subtitle="Choose which listings are shown ahead of the rest, and in what order. The first one here comes first."
      />

      <CatalogTabs active="featured" />

      {loadError ? (
        <Notice
          tone="danger"
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoadError(null);
                setLoaded(false);
                setReloadToken((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Notice>
      ) : null}

      {saveError ? (
        <Notice
          tone="danger"
          actions={
            saveConflict ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  // Replaces the working list with the server's, which is the
                  // point: the sentence says what changed and the admin decides
                  // again from there.
                  setSaveError(null);
                  setSaveConflict(false);
                  setLoaded(false);
                  setReloadToken((n) => n + 1);
                }}
              >
                Reload the list
              </Button>
            ) : undefined
          }
        >
          {saveError}
        </Notice>
      ) : null}
      {saved && !dirty ? (
        <Notice tone="success" live>
          {ids.length === 0
            ? "Saved. Nothing is featured, so buyers see listings ranked by rating."
            : "Saved. Buyers now see these first, in this order."}
        </Notice>
      ) : null}

      <p className="hk-sr-only" aria-live="polite">
        {announcement}
      </p>

      {!loaded ? (
        <LoadingRows rows={5} />
      ) : loadError ? null : (
        <div className={styles.layout}>
          <Card padding="md" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Featured, in order</h2>
              <span className={styles.count}>
                {ids.length} of {MAX_FEATURED_PRODUCTS}
              </span>
            </div>

            {ids.length === 0 ? (
              <p className={styles.empty}>
                Nothing is featured. Until something is, buyers see listings ranked by rating.
                Search for the ones you want first and add them.
              </p>
            ) : (
              <ol ref={listRef} className={styles.list} aria-label="Featured listings, first to last">
                {ids.map((id, index) => {
                  const product = known.get(id);
                  const image = product?.images[0];
                  const status = product?.moderationStatus ?? "active";
                  const paused = product?.isAvailable === false;
                  const name = nameOf(id);
                  return (
                    <li key={id} className={styles.row}>
                      <span className={styles.rank} aria-hidden="true">
                        {index + 1}
                      </span>
                      <div className={styles.thumb}>
                        <ImageSlot
                          ratio="1/1"
                          label={image?.placeholder ?? name}
                          alt=""
                          src={image?.src}
                          sizes="52px"
                          compact
                        />
                      </div>
                      <div className={styles.info}>
                        <span className={styles.name}>{name}</span>
                        <span className={styles.meta}>
                          {product ? `${product.vendorName} · ${product.categoryName}` : "Details unavailable"}
                        </span>
                        {/* Featuring is not publishing: say why a row will not
                            actually be seen, so it can be taken out. */}
                        {status !== "active" ? (
                          <span className={styles.notLive}>
                            <StatusPill status={status} /> Not live, so buyers do not see it.
                          </span>
                        ) : paused ? (
                          <span className={styles.notLive}>Paused by the maker, so buyers do not see it.</span>
                        ) : null}
                      </div>
                      <div className={styles.controls}>
                        <Button
                          variant="icon"
                          size="sm"
                          aria-label={`Move ${name} up`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          data-move-id={id}
                          data-move-dir="up"
                        >
                          <ChevronUp size={16} strokeWidth={1.8} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="icon"
                          size="sm"
                          aria-label={`Move ${name} down`}
                          disabled={index === ids.length - 1}
                          onClick={() => move(index, 1)}
                          data-move-id={id}
                          data-move-dir="down"
                        >
                          <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="icon"
                          size="sm"
                          aria-label={`Remove ${name} from the featured list`}
                          onClick={() => remove(id)}
                          data-remove-id={id}
                        >
                          <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card padding="md" className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Add a live listing</h2>
            </div>
            <div ref={searchRef}>
              <SearchField
                placeholder="Search by product, maker or category…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search live listings to feature"
              />
            </div>
            {full ? (
              <p className={styles.hint}>
                The list is full at {MAX_FEATURED_PRODUCTS}. Remove one to add another.
              </p>
            ) : null}

            {resultsError ? (
              <Notice
                tone="danger"
                actions={
                  <Button size="sm" variant="secondary" onClick={() => setResultsToken((n) => n + 1)}>
                    Try again
                  </Button>
                }
              >
                {resultsError}
              </Notice>
            ) : resultsLoading && results.length === 0 ? (
              <LoadingRows rows={4} />
            ) : results.length === 0 ? (
              <p className={styles.empty}>
                {debouncedQuery ? `No live listing matches “${debouncedQuery}”.` : "No live listings yet."}
              </p>
            ) : (
              <ul ref={resultsRef} className={styles.results} aria-busy={resultsLoading}>
                {results.map((product) => {
                  const position = ids.indexOf(product.id);
                  const image = product.images[0];
                  return (
                    <li key={product.id} className={styles.resultRow} data-result-id={product.id}>
                      <div className={styles.thumb}>
                        <ImageSlot
                          ratio="1/1"
                          label={image?.placeholder ?? product.name}
                          alt=""
                          src={image?.src}
                          sizes="52px"
                          compact
                        />
                      </div>
                      <div className={styles.info}>
                        <span className={styles.name}>{product.name}</span>
                        <span className={styles.meta}>
                          {product.vendorName} · {product.categoryName}
                        </span>
                        {product.isAvailable === false ? (
                          <span className={styles.notLive}>Paused by the maker right now.</span>
                        ) : null}
                      </div>
                      {position >= 0 ? (
                        <span className={styles.inList}>Featured · {position + 1}</span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={full}
                          onClick={() => add(product)}
                          aria-label={`Add ${product.name} to the featured list`}
                          data-add-id={product.id}
                        >
                          <Plus size={14} strokeWidth={2} aria-hidden="true" />
                          Add
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {loaded && !loadError ? (
        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={saved}
          onSave={() => void save()}
          onDiscard={() => {
            setIds(baseline);
            setSaveError(null);
            setSaveConflict(false);
            setSaved(false);
          }}
          saveLabel="Save featured list"
        />
      ) : null}
    </div>
  );
}
