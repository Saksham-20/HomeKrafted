"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Field, FieldGrid, Input } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { AdminPageHeader } from "./AdminPageHeader";
import { CollectionsTabs } from "./CollectionsTabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, createOccasion, getOccasionsAdmin, updateOccasion } from "@/lib/api";
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

function toDraft(occasion: Occasion): RowDraft {
  return { celebratedOn: toDateInput(occasion.celebratedOn), tagline: occasion.tagline ?? "" };
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
 * them into a countdown they don't have. Clearing the date is how one
 * goes back.
 */
export function OccasionsClient() {
  const { ready, role } = useAuth();
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | undefined>();
  const [savedId, setSavedId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The add form. Collapsed by default: this screen's daily job is
  // rolling dates forward, and a form sitting open above that list would
  // make adding look like the thing you came here to do.
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftTagline, setDraftTagline] = useState("");
  const [draftImage, setDraftImage] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const existingNames = useMemo(
    () => new Set(occasions.map((o) => o.name.trim().toLowerCase())),
    [occasions],
  );
  const duplicate = existingNames.has(draftName.trim().toLowerCase()) && draftName.trim() !== "";

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const list = await getOccasionsAdmin();
      if (cancelled) return;
      setOccasions(list);
      setDrafts(Object.fromEntries(list.map((o) => [o.id, toDraft(o)])));
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
    setDrafts((current) => ({ ...current, [updated.id]: toDraft(updated) }));
  }

  async function save(occasion: Occasion) {
    const draft = drafts[occasion.id];
    if (!draft) return;
    setSavingId(occasion.id);
    setError(null);
    try {
      const updated = await updateOccasion(occasion.id, {
        // An empty date field means "make this evergreen", which needs the
        // explicit flag — omitting `celebratedOn` means "leave it alone".
        ...(draft.celebratedOn
          ? { celebratedOn: new Date(`${draft.celebratedOn}T00:00:00`).toISOString() }
          : { clearCelebratedOn: true }),
        tagline: draft.tagline.trim(),
      });
      if (updated) {
        replace(updated);
        setSavedId(occasion.id);
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save this occasion. Try again."));
    } finally {
      setSavingId(undefined);
    }
  }

  function resetDraft() {
    setDraftName("");
    setDraftDate("");
    setDraftTagline("");
    setDraftImage("");
    setCreateError(null);
  }

  async function create() {
    const name = draftName.trim();
    if (!name) {
      setCreateError("Give the occasion a name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createOccasion({
        name,
        // An empty date is a real answer, not a missing one — a birthday
        // has no season. The hint under the field says what it means, so
        // evergreen is chosen rather than fallen into.
        celebratedOn: draftDate ? new Date(`${draftDate}T00:00:00`).toISOString() : undefined,
        tagline: draftTagline.trim() || undefined,
        imageSrc: draftImage.trim() || undefined,
      });
      setOccasions((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setDrafts((current) => ({ ...current, [created.id]: toDraft(created) }));
      setJustAdded(created.name);
      resetDraft();
      setAdding(false);
    } catch (err) {
      setCreateError(apiErrorMessage(err, "Couldn't add that occasion. Try again."));
    } finally {
      setCreating(false);
    }
  }

  const addButton = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => {
        setAdding(true);
        setJustAdded(null);
      }}
      disabled={adding}
    >
      <Plus size={15} strokeWidth={2} aria-hidden="true" />
      Add an occasion
    </Button>
  );

  if (!ready || loading) {
    return (
      <div>
        <AdminPageHeader title="Occasions" actions={addButton} />
        <CollectionsTabs active="occasions" />
        <LoadingRows rows={5} />
      </div>
    );
  }

  const dated = occasions.filter((o) => o.celebratedOn).length;

  return (
    <div>
      <AdminPageHeader
        title="Occasions"
        subtitle={`${dated} of ${occasions.length} have a date set — the rest show under "any time of year". Festival dates move every year: set the next date each one falls on, and the hub counts down to it.`}
        actions={addButton}
      />
      <CollectionsTabs active="occasions" />
      {error && <Notice tone="danger">{error}</Notice>}

      {justAdded && (
        <Notice tone="success" live onDismiss={() => setJustAdded(null)}>
          Added “{justAdded}”. It is now pickable on every listing and gift guide.
        </Notice>
      )}

      {adding && (
        <FormSection
          id="occasion-new"
          title="New occasion"
          description="A duplicate is refused by name — edit the existing one below instead."
          footer={
            <div className={styles.actions}>
              <Button variant="primary" size="sm" onClick={create} disabled={creating || duplicate}>
                {creating ? "Adding…" : "Add occasion"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  resetDraft();
                }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          }
        >
          <FieldGrid columns={2}>
            <Field
              label="Name"
              span="full"
              error={
                duplicate
                  ? "That one already exists — edit it below instead of adding a second."
                  : (createError ?? undefined)
              }
            >
              <Input
                value={draftName}
                maxLength={60}
                autoFocus
                placeholder="e.g. Onam"
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setCreateError(null);
                }}
              />
            </Field>
            <Field
              label="Next date"
              optional
              hint="Leave empty for occasions with no season — it shows under “any time of year”."
            >
              <Input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
            </Field>
            <Field label="Tagline" optional hint="One line for the hub card.">
              <Input
                value={draftTagline}
                maxLength={160}
                placeholder="Sweets, lamps and gifts for the festival of lights"
                onChange={(event) => setDraftTagline(event.target.value)}
              />
            </Field>
            <div className={styles.fieldWide}>
              <ImageUpload
                value={draftImage}
                onChange={setDraftImage}
                purpose="collection"
                label="Cover image"
                ratio="16/9"
                hint="Optional. Shown on the occasion hub card."
              />
            </div>
          </FieldGrid>
        </FormSection>
      )}

      {occasions.length === 0 ? (
        <EmptyState
          title="No occasions yet."
          body="Add one and it becomes pickable on every listing and gift guide, with its own hub page."
        />
      ) : (
        <div className={styles.list}>
          {occasions.map((occasion) => {
            const draft = drafts[occasion.id];
            if (!draft) return null;
            const changed =
              draft.celebratedOn !== toDateInput(occasion.celebratedOn) ||
              draft.tagline !== (occasion.tagline ?? "");
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

                <div className={styles.field}>
                  <Field label="Next date" optional>
                    <Input
                      dense
                      type="date"
                      value={draft.celebratedOn}
                      onChange={(event) => edit(occasion.id, { celebratedOn: event.target.value })}
                    />
                  </Field>
                </div>

                <div className={styles.fieldWide}>
                  <Field label="Tagline" optional>
                    <Input
                      dense
                      value={draft.tagline}
                      maxLength={160}
                      placeholder="One line for the hub card"
                      onChange={(event) => edit(occasion.id, { tagline: event.target.value })}
                    />
                  </Field>
                </div>

                <div className={styles.actions}>
                  <Button
                    variant={changed ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => save(occasion)}
                    disabled={savingId === occasion.id || !changed}
                  >
                    {savingId === occasion.id ? "Saving…" : "Save"}
                  </Button>
                  {savedId === occasion.id && !changed && (
                    <span className={styles.saved} role="status">
                      Saved.
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
