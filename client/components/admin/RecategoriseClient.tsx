"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { ApiError } from "@/lib/api/http";
import {
  applyRecategorisation,
  getRecategorisationProposals,
  type RecategorisationProposal,
} from "@/lib/api/admin";
import styles from "./RecategoriseClient.module.css";

type Filter = "suggested" | "unplaceable" | "keep" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "suggested", label: "Suggested moves" },
  { value: "unplaceable", label: "Couldn’t place" },
  { value: "keep", label: "Already right" },
  { value: "all", label: "Everything" },
];

/**
 * `/admin/catalog/recategorise` (G1 §3.5) — where each live listing
 * probably belongs, and one button per row to agree with it.
 *
 * **Nothing is re-filed automatically, and there is deliberately no "move
 * them all" button.** The M36 rule: a guess written onto a real storefront
 * looks authoritative, and "a script did it" is not something a maker can
 * argue with. So the rule proposes, a person reads the words it matched on,
 * and the move happens one row at a time.
 *
 * Three things are shown that a tidier screen would have hidden:
 *
 * - **The words that matched**, on every row. That is the whole audit
 *   trail; a proposal you cannot check is one you end up trusting blindly.
 * - **The listings the rule could not place**, under their own filter
 *   rather than dropped. Those are the ones that most need a person, and a
 *   silent skip hides them in the gap between two rows.
 * - **The ones already filed correctly**, so the screen says what it did
 *   *not* want to touch as well as what it did.
 *
 * The default filter is the one with work in it (the portal kit's rule).
 */
export function RecategoriseClient() {
  const [rows, setRows] = useState<RecategorisationProposal[] | null>(null);
  const [filter, setFilter] = useState<Filter>("suggested");
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ignore = false;
    getRecategorisationProposals("craft")
      .then((list) => {
        if (ignore) return;
        setRows(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        // A failed read is a Notice with Try again, never the empty state.
        setRows([]);
        setError(err instanceof ApiError ? err.message : "We could not work out the proposals.");
      });
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      suggested: all.filter((row) => row.proposed).length,
      unplaceable: all.filter((row) => row.confidence === "none").length,
      keep: all.filter((row) => row.confidence === "keep").length,
      all: all.length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const all = rows ?? [];
    if (filter === "suggested") return all.filter((row) => row.proposed);
    if (filter === "unplaceable") return all.filter((row) => row.confidence === "none");
    if (filter === "keep") return all.filter((row) => row.confidence === "keep");
    return all;
  }, [rows, filter]);

  async function move(row: RecategorisationProposal) {
    if (!row.proposed) return;
    setMovingId(row.productId);
    setError(null);
    try {
      await applyRecategorisation(row.productId, row.proposed.categoryId);
      // Kept on screen, marked, rather than vanishing: an operator working
      // down a list needs to see what they have already done.
      setMoved((current) => ({ ...current, [row.productId]: row.proposed!.name }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not move.");
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <AdminPageHeader
        title="Recategorise"
        subtitle="Where each gift probably belongs on the new shelves. Nothing moves until you say so, and every row shows the words it matched on."
      />

      <CatalogTabs active="recategorise" />

      <div aria-live="polite">
        {error ? (
          <Notice
            tone="danger"
            actions={
              <Button size="sm" variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
                Try again
              </Button>
            }
          >
            {error}
          </Notice>
        ) : null}
      </div>

      <SegmentedFilter
        label="Which listings"
        options={FILTERS.map((option) => ({
          value: option.value,
          label: option.label,
          count: counts[option.value],
        }))}
        value={filter}
        onChange={(next) => setFilter(next as Filter)}
      />

      {rows === null ? (
        <LoadingRows rows={6} />
      ) : shown.length === 0 ? (
        <p className={styles.empty}>
          {filter === "suggested"
            ? "Nothing to move — every gift is already on the shelf the rule would pick."
            : "Nothing here."}
        </p>
      ) : (
        <ul className={styles.list}>
          {shown.map((row) => (
            <li key={row.productId}>
              <Card className={styles.row}>
                <div className={styles.main}>
                  <h2 className={styles.name}>{row.name}</h2>
                  <p className={styles.meta}>
                    {row.maker} · currently on <strong>{row.currentShelf.name}</strong>
                  </p>
                  {row.why.length > 0 ? (
                    <p className={styles.why}>
                      matched {row.why.map((word) => `“${word}”`).join(", ")}
                    </p>
                  ) : (
                    <p className={styles.why}>
                      No word in its name or description matched any shelf — this one needs a person.
                    </p>
                  )}
                </div>

                <div className={styles.action}>
                  {moved[row.productId] ? (
                    <span className={styles.done}>Moved to {moved[row.productId]}</span>
                  ) : row.proposed ? (
                    <>
                      <span className={styles.proposed}>{row.proposed.name}</span>
                      <Button
                        size="sm"
                        disabled={movingId === row.productId}
                        onClick={() => void move(row)}
                      >
                        {movingId === row.productId ? "Moving…" : "Move it"}
                      </Button>
                    </>
                  ) : (
                    <span className={styles.proposed}>
                      {row.confidence === "keep" ? "Already right" : "No suggestion"}
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
