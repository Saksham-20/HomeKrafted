"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "./AdminPageHeader";
import { CollectionsTabs } from "./CollectionsTabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { getOccasionsAdmin, updateOccasion } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Occasion } from "@/lib/types";
import styles from "./OccasionsClient.module.css";

interface RowDraft {
  celebratedOn: string;
  tagline: string;
}

/** `<input type="date">` wants `YYYY-MM-DD`; the API returns a full ISO timestamp. */
function toDateInput(iso?: string): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * `/admin/collections/occasions` (M16, H8) — where festival dates get
 * rolled forward.
 *
 * Dates are absolute, not recurrence rules, and that is deliberate:
 * Diwali, Raksha Bandhan and Karwa Chauth are lunisolar and land on a
 * different Gregorian date every year. A "repeats yearly on 8 Nov" flag
 * would be wrong for exactly the occasions this hub exists to sell into,
 * so a person sets them — and this is where they do it.
 *
 * An occasion with no date is evergreen, not broken: a birthday has no
 * season, and `/collections` lists those separately rather than sorting
 * them into a countdown they don't have. "Clear" is how one goes back.
 */
export function OccasionsClient() {
  const { ready, role } = useAuth();
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | undefined>();
  const [savedId, setSavedId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const list = await getOccasionsAdmin();
      if (cancelled) return;
      setOccasions(list);
      setDrafts(
        Object.fromEntries(
          list.map((o) => [o.id, { celebratedOn: toDateInput(o.celebratedOn), tagline: o.tagline ?? "" }]),
        ),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  function edit(id: string, patch: Partial<RowDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    setSavedId(undefined);
  }

  function replace(updated: Occasion) {
    setOccasions((current) => current.map((o) => (o.id === updated.id ? updated : o)));
    setDrafts((current) => ({
      ...current,
      [updated.id]: {
        celebratedOn: toDateInput(updated.celebratedOn),
        tagline: updated.tagline ?? "",
      },
    }));
  }

  async function save(occasion: Occasion) {
    const draft = drafts[occasion.id];
    if (!draft) return;
    setSavingId(occasion.id);
    const updated = await updateOccasion(occasion.id, {
      // An empty date field means "make this evergreen", which needs the
      // explicit flag — omitting `celebratedOn` means "leave it alone".
      ...(draft.celebratedOn
        ? { celebratedOn: new Date(`${draft.celebratedOn}T00:00:00`).toISOString() }
        : { clearCelebratedOn: true }),
      tagline: draft.tagline.trim(),
    });
    setSavingId(undefined);
    if (updated) {
      replace(updated);
      setSavedId(occasion.id);
    }
  }

  if (!ready || loading) return <div className={styles.loading}>Loading occasions…</div>;

  const dated = occasions.filter((o) => o.celebratedOn).length;

  return (
    <div>
      <AdminPageHeader
        title="Occasions"
        subtitle={`${dated} of ${occasions.length} have a date set — the rest show under "any time of year"`}
      />
      <CollectionsTabs active="occasions" />

      <Card className={styles.note} padding="sm">
        Festival dates move every year. Set the <strong>next</strong> date each occasion falls on —
        the hub counts down to it and the home page promotes it from six weeks out. Leave the date
        empty for occasions with no season, like birthdays.
      </Card>

      <div className={styles.list}>
        {occasions.map((occasion) => {
          const draft = drafts[occasion.id];
          if (!draft) return null;
          return (
            <Card key={occasion.id} padding="sm" className={styles.row}>
              <div className={styles.identity}>
                <span className={styles.ring} aria-hidden="true">
                  {occasion.initial}
                </span>
                <div>
                  <div className={styles.name}>{occasion.name}</div>
                  <div className={styles.current}>
                    {occasion.celebratedOn
                      ? formatDate(occasion.celebratedOn)
                      : "No date — any time of year"}
                  </div>
                </div>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>Next date</span>
                <input
                  type="date"
                  className={styles.input}
                  value={draft.celebratedOn}
                  onChange={(event) => edit(occasion.id, { celebratedOn: event.target.value })}
                />
              </label>

              <label className={styles.fieldWide}>
                <span className={styles.label}>Tagline</span>
                <input
                  className={styles.input}
                  value={draft.tagline}
                  maxLength={160}
                  placeholder="One line for the hub card"
                  onChange={(event) => edit(occasion.id, { tagline: event.target.value })}
                />
              </label>

              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => save(occasion)}
                  disabled={savingId === occasion.id}
                >
                  {savingId === occasion.id ? "Saving…" : "Save"}
                </Button>
                {savedId === occasion.id && <span className={styles.saved}>Saved.</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
