"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import {
  getReviewQueue,
  moderateCatalogItem,
  REVIEW_KIND_LABEL,
  type ReviewQueueItem,
} from "@/lib/api";
import styles from "./ReviewQueuePanel.module.css";

/**
 * Menu items and meal plans awaiting review.
 *
 * **This panel is the fix for a listing that could never go live.** M22 put
 * the review gate on `Product`, `Snack` and `MealPlan` — all three default
 * to `pending`, all three are filtered out of buyer-facing queries. The
 * admin half was built for `Product` alone, so a snack created after M22
 * sat pending forever: no screen listed it, and no endpoint could approve
 * it. Its maker was correctly told "waiting for approval" and nobody on the
 * platform could act on it. Found on the live site, 2026-08-10.
 *
 * **Products are deliberately excluded.** They already have the Waiting tab
 * on this screen with search, vendor filtering and pagination. Listing them
 * here as well would put the same decision in two places on one page, which
 * is how two operators end up disagreeing about which one is authoritative.
 *
 * **It hides itself when the queue is empty.** A permanent empty panel on
 * the catalogue screen is noise; `AdminDashboardClient`'s SLA card is where
 * "is anyone waiting" is answered, and it now counts all three kinds.
 */
export function ReviewQueuePanel() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which row is mid-refusal, and the reason typed so far. */
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);

  /**
   * Bumped after a decision to refetch. A decision moves an item out of
   * this queue and changes the count, and the response cannot tell us
   * either — the same reason `CatalogClient` reloads rather than patching
   * the row in place.
   */
  const [reloadToken, setReloadToken] = useState(0);

  // Same shape as `CatalogClient`'s loader: the async work lives in an IIFE
  // inside the effect with a `cancelled` guard, rather than in a
  // `useCallback` the effect calls — which `react-hooks/set-state-in-effect`
  // rejects.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const queue = await getReviewQueue();
        if (cancelled) return;
        // Products keep their own tab — see the doc comment.
        setItems(queue.items.filter((i) => i.kind !== "product"));
        setError(null);
      } catch {
        if (!cancelled) setError("Could not load the review queue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function decide(item: ReviewQueueItem, action: "approve" | "reject", reason?: string) {
    setBusyId(item.id);
    setError(null);
    try {
      await moderateCatalogItem(item.kind, item.id, action, reason);
      setRejecting(null);
      setReloadToken((n) => n + 1);
    } catch (err) {
      // The server refuses a refusal with no reason on purpose. Swallowing
      // that would make it look like the click did nothing.
      setError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  // Nothing waiting, or still finding out — either way, say nothing.
  if (loading || (items.length === 0 && !error)) return null;

  return (
    <Card padding="md" className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          Menu items &amp; meal plans waiting for review
        </h2>
        <p className={styles.note}>
          {items.length} waiting. Buyers cannot see these yet. Until this queue
          existed there was no way to approve one.
        </p>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <ul className={styles.list}>
        {items.map((item) => {
          const isRejecting = rejecting?.id === item.id;
          return (
            <li key={`${item.kind}-${item.id}`} className={styles.row}>
              <div className={styles.thumb}>
                <ImageSlot
                  ratio="1/1"
                  label={item.name}
                  alt={item.name}
                  src={item.imageSrc}
                  sizes="48px"
                  compact
                />
              </div>

              <div className={styles.body}>
                <span className={styles.name}>
                  {item.editHref ? (
                    <Link href={item.editHref}>{item.name}</Link>
                  ) : (
                    item.name
                  )}
                </span>
                <span className={styles.meta}>
                  <span className={styles.kind}>{REVIEW_KIND_LABEL[item.kind]}</span> ·{" "}
                  {item.makerName} · waiting since{" "}
                  {new Date(item.submittedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>

                {isRejecting && (
                  <div className={styles.rejectRow}>
                    {/*
                      A reason is required by the server, and it reaches the
                      HomeKrafter verbatim — it is the only thing telling
                      them what to change (M22). So it is typed here rather
                      than picked from a list of codes.
                    */}
                    <label className={styles.reasonLabel} htmlFor={`reason-${item.id}`}>
                      What needs changing? They are shown this word for word.
                    </label>
                    <textarea
                      id={`reason-${item.id}`}
                      className={styles.reason}
                      rows={2}
                      value={rejecting.reason}
                      onChange={(e) => setRejecting({ id: item.id, reason: e.target.value })}
                      placeholder="The photo is too dark to see the jar — please reshoot in daylight."
                    />
                  </div>
                )}
              </div>

              <div className={styles.actions}>
                {isRejecting ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === item.id || rejecting.reason.trim().length === 0}
                      onClick={() => void decide(item, "reject", rejecting.reason)}
                    >
                      {busyId === item.id ? "Sending…" : "Send back"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setRejecting(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => void decide(item, "approve")}
                    >
                      {busyId === item.id ? "Approving…" : "Approve"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => setRejecting({ id: item.id, reason: "" })}
                    >
                      Send back
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
