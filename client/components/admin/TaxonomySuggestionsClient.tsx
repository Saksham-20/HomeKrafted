"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Field, Input, TextArea } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { AdminPageHeader } from "./AdminPageHeader";
import { CatalogTabs } from "./CatalogTabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/format";
import {
  apiErrorMessage,
  approveTaxonomySuggestion,
  getTaxonomySuggestions,
  rejectTaxonomySuggestion,
} from "@/lib/api";
import type { TaxonomySuggestion, TaxonomySuggestionStatus } from "@/lib/types";
import styles from "./TaxonomySuggestionsClient.module.css";

type Filter = TaxonomySuggestionStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  // Waiting first and the default: it is the one filter with a
  // HomeKrafter on the other end of it. Same rule as the catalogue's
  // status chips.
  { value: "pending", label: "Waiting" },
  { value: "all", label: "All" },
  { value: "approved", label: "Added" },
  { value: "rejected", label: "Declined" },
];

/** Matches `RejectTaxonomySuggestionDto`'s `@MinLength(10)` — checked here too so the admin is told before the round trip, not after. */
const MIN_REASON = 10;

/**
 * `/admin/catalog/suggestions` (M50) — the shelves and occasions
 * HomeKrafters have asked for.
 *
 * **Approving is what mints the real row.** That is the design, not an
 * implementation detail: `Category` and `Occasion` are a shared
 * vocabulary the whole catalogue browses by, so the person who can see
 * the whole list is the one who decides whether "Achaar" is a genuine gap
 * or the pickles shelf under another name — and can rename it into the
 * vocabulary that already exists on the way in.
 *
 * A decline needs a reason, and it reaches the HomeKrafter **verbatim**
 * (the M22 rule). It is the only thing telling them whether to pick an
 * existing shelf or ask again differently.
 */
export function TaxonomySuggestionsClient() {
  const { ready, role } = useAuth();
  const [items, setItems] = useState<TaxonomySuggestion[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getTaxonomySuggestions(filter === "all" ? undefined : filter);
    setItems(result.items);
    setPendingCount(result.pendingCount);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      // `setLoading` inside the async body rather than in the effect
      // itself: the lint rule that forbids the latter is about the
      // synchronous render-then-immediately-set pattern, and the list
      // genuinely does become stale the moment the filter changes.
      setLoading(true);
      try {
        const result = await getTaxonomySuggestions(filter === "all" ? undefined : filter);
        if (cancelled) return;
        setItems(result.items);
        setPendingCount(result.pendingCount);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Could not load the queue."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, filter]);

  async function decide(run: () => Promise<unknown>, id: string) {
    setBusyId(id);
    setError(null);
    try {
      await run();
      await load();
    } catch (err) {
      // The server refuses on purpose — a name that now clashes, a
      // decision already made — and the sentence is the only thing
      // saying what to do instead (the M36 rule).
      setError(apiErrorMessage(err, "That did not go through — try again."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Catalog"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} shelf or occasion ${pendingCount === 1 ? "request is" : "requests are"} waiting`
            : "Nothing waiting on a decision"
        }
      />
      <CatalogTabs active="suggestions" pendingSuggestions={pendingCount} />

      <Toolbar>
        <SegmentedFilter
          label="Filter requests"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => (f.value === "pending" ? { ...f, count: pendingCount } : f))}
        />
      </Toolbar>

      {error && <Notice tone="danger">{error}</Notice>}

      {loading ? (
        <LoadingRows rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "Nothing waiting." : "Nothing here."}
          body={
            filter === "pending"
              ? "Requests land here when a HomeKrafter cannot find the shelf or occasion they need on their listing form."
              : "Try another filter."
          }
        />
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <SuggestionRow
              key={item.id}
              suggestion={item}
              busy={busyId === item.id}
              onApprove={(name) =>
                decide(() => approveTaxonomySuggestion(item.id, name ? { name } : {}), item.id)
              }
              onReject={(reason) =>
                decide(() => rejectTaxonomySuggestion(item.id, reason), item.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  busy,
  onApprove,
  onReject,
}: {
  suggestion: TaxonomySuggestion;
  busy: boolean;
  onApprove: (name?: string) => void;
  onReject: (reason: string) => void;
}) {
  /**
   * The name starts as asked and is editable in place. Renaming on the
   * way in is the point of a human step — "achaar" filed as "Pickles &
   * Preserves" keeps the vocabulary tidy without refusing somebody who
   * described the same thing in their own words.
   */
  const [name, setName] = useState(suggestion.name);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const decided = suggestion.status !== "pending";
  const noun = suggestion.kind === "category" ? "Shelf" : "Occasion";
  const renamed = name.trim() !== suggestion.name;

  function confirmReject() {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON) {
      setReasonError(`Give them something they can act on — at least ${MIN_REASON} characters.`);
      return;
    }
    onReject(trimmed);
    setRejecting(false);
    setReason("");
    setReasonError(null);
  }

  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.head}>
        <span className={styles.kind}>
          {noun}
          {suggestion.group && ` · ${suggestion.group === "food" ? "to eat" : "to keep"}`}
        </span>
        <span className={styles.status} data-status={suggestion.status}>
          {suggestion.status === "pending"
            ? "Waiting"
            : suggestion.status === "approved"
              ? "Added"
              : "Declined"}
        </span>
      </div>

      {decided ? (
        <p className={styles.name}>{suggestion.name}</p>
      ) : (
        <Field
          label="Name it will be added under"
          hint={
            renamed
              ? `They asked for “${suggestion.name}” — it will be added as what you type here.`
              : "Edit it to fit the vocabulary already on the shelf list."
          }
        >
          <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Field>
      )}

      <p className={styles.meta}>
        {suggestion.vendorName ?? suggestion.suggestedByName ?? "A HomeKrafter"} ·{" "}
        {formatDate(suggestion.createdAt)}
      </p>

      {/* Their own words. The one thing that tells a genuinely missing
          shelf from a synonym of one that already exists. */}
      {suggestion.note && <p className={styles.note}>“{suggestion.note}”</p>}

      {suggestion.decisionNote && (
        <p className={styles.decision}>Told them: {suggestion.decisionNote}</p>
      )}

      {!decided && !rejecting && (
        <div className={styles.actions}>
          <Button
            size="sm"
            onClick={() => onApprove(renamed ? name.trim() : undefined)}
            disabled={busy || name.trim().length < 2}
          >
            {busy ? "Adding…" : `Add this ${noun.toLowerCase()}`}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRejecting(true)} disabled={busy}>
            Decline
          </Button>
        </div>
      )}

      {!decided && rejecting && (
        <div className={styles.reasonBox}>
          <Field
            label="Why not?"
            hint="The HomeKrafter sees this word for word. Point them at the shelf that already covers it."
            error={reasonError ?? undefined}
          >
            <TextArea
              rows={2}
              autoFocus
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError(null);
              }}
              placeholder="e.g. Pickles already covers this — file it under Pickles & Preserves."
            />
          </Field>
          <div className={styles.actions}>
            <Button size="sm" onClick={confirmReject} disabled={busy}>
              Send and decline
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
