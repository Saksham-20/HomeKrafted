"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, TextArea } from "@/components/portal/Field";
import { Notice } from "@/components/portal/Notice";
import { ApiError } from "@/lib/api/http";
import { mergeCategory, setCategoryArchived, updateCategory } from "@/lib/api/admin";
import { Icon } from "@/components/ui/Icon";
import { ICON_GROUPS } from "@/lib/icons/registry";
import type { Category } from "@/lib/types";
import styles from "./ShelfEditor.module.css";

export interface ShelfEditorProps {
  shelf: Category;
  /** Shelves this one could be merged into — same side of the catalogue. */
  mergeTargets: { id: string; name: string }[];
  onChanged: () => void;
  onClose: () => void;
}

/**
 * G1 — everything about a shelf that is not its name
 * (docs/GIFTING-REWORK.md §3–§4).
 *
 * It opens under the row rather than on its own page, because each of these
 * is a small decision made while looking at the tree: the icon next to the
 * one beside it, the synonyms against the names already there, the merge
 * against the duplicate two rows down.
 *
 * Three of the four controls are destructive-ish in different ways, and
 * each says what it will do **before** the button rather than after it —
 * the portal's no-`window.confirm` rule. A prompt cannot explain that a
 * merge moves listings and leaves the old address working, and that is the
 * whole thing worth knowing before pressing it.
 */
export function ShelfEditor({ shelf, mergeTargets, onChanged, onClose }: ShelfEditorProps) {
  const [description, setDescription] = useState(shelf.description ?? "");
  const [synonyms, setSynonyms] = useState((shelf.synonyms ?? []).join(", "));
  const [icon, setIcon] = useState(shelf.icon ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);

  const archived = Boolean(shelf.archivedAt);

  /** The server's own sentence reaches the operator, never a generic one (M36). */
  function report(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateCategory(shelf.id, {
        description: description.trim() || null,
        // Split on commas, not spaces: "gift box" is one synonym.
        synonyms: synonyms
          .split(",")
          .map((word) => word.trim())
          .filter(Boolean),
        icon: icon.trim() || null,
      });
      setSaved(true);
      onChanged();
    } catch (err) {
      report(err, "That did not save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    setSaving(true);
    setError(null);
    try {
      await setCategoryArchived(shelf.id, !archived);
      setConfirmingArchive(false);
      onChanged();
    } catch (err) {
      // The refusal names how many live subcategories are in the way, which
      // is the only thing that tells an operator what to do first.
      report(err, "That did not save.");
      setConfirmingArchive(false);
    } finally {
      setSaving(false);
    }
  }

  async function merge() {
    if (!mergeInto) return;
    setSaving(true);
    setError(null);
    try {
      const result = await mergeCategory(shelf.id, mergeInto);
      setMergeResult(
        `Merged into ${result.into.name}. ${result.listingsMoved} listing${result.listingsMoved === 1 ? "" : "s"} moved; the old web address still works.`,
      );
      setConfirmingMerge(false);
      onChanged();
    } catch (err) {
      report(err, "That did not merge.");
      setConfirmingMerge(false);
    } finally {
      setSaving(false);
    }
  }

  const mergeTargetName = mergeTargets.find((target) => target.id === mergeInto)?.name;

  return (
    <div className={styles.panel}>
      <div aria-live="polite">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {mergeResult ? <Notice tone="success">{mergeResult}</Notice> : null}
      </div>

      <Field
        label="What this shelf is"
        hint="One sentence, shown to buyers under the heading. Say what it holds, don't sell it."
      >
        <TextArea
          rows={2}
          value={description}
          maxLength={200}
          onChange={(event) => {
            setDescription(event.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Poured, shaped and scented candles, and the holders they sit in."
        />
      </Field>

      <Field
        label="Other words for it"
        hint="Comma separated — “achaar”, “kada”, “diya”. Search reads these, so a maker who uses their own word still lands here. Nothing renders them."
      >
        <Input
          value={synonyms}
          onChange={(event) => {
            setSynonyms(event.target.value);
            setSaved(false);
          }}
          placeholder="kada, kangan, bangle"
        />
      </Field>

      {/*
        Picked from the registry, never typed (G3 §6).

        This was a free-text box asking an operator to type
        "lucide-lab:yarn-ball" exactly — a control whose failure mode is
        silent, because an unrecognised id falls back to the wrapped gift
        and looks like a shelf nobody got round to. The list is the same
        one the browse pages draw from, so a shelf cannot be given a mark
        that does not exist.
      */}
      <Field
        label="Icon"
        hint="What this shelf draws with on the browse page. Leave it unset for the wrapped-gift fallback."
      >
        <div className={styles.iconPicker}>
          <span className={styles.iconPreview} aria-hidden="true">
            <Icon id={icon || null} size={26} />
          </span>
          <Select
            value={icon}
            onChange={(event) => {
              setIcon(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">No icon (wrapped gift)</option>
            {ICON_GROUPS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.icons.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
      </Field>

      <div className={styles.actions}>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
        {saved ? <span className={styles.saved}>Saved.</span> : null}
      </div>

      <div className={styles.danger}>
        <h3 className={styles.dangerTitle}>Retire or merge</h3>

        <p className={styles.dangerLead}>
          {archived
            ? "This shelf is retired: makers and buyers don’t see it, but every link to it still works."
            : "Retiring hides a shelf from the pickers and the browse page. Nothing is deleted — every link, breadcrumb and past order still works."}
        </p>
        {confirmingArchive ? (
          <div className={styles.actions}>
            <Button size="sm" onClick={() => void toggleArchive()} disabled={saving}>
              {saving ? "Working…" : archived ? `Confirm: bring ${shelf.name} back` : `Confirm: retire ${shelf.name}`}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmingArchive(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirmingArchive(true)}>
            {archived ? "Bring it back" : "Retire this shelf"}
          </Button>
        )}

        {mergeTargets.length > 0 && !archived ? (
          <>
            <p className={styles.dangerLead}>
              Merging moves every listing here onto another shelf and retires this one. The old web
              address keeps working and sends people to the new shelf. Listings are not sent back for
              review.
            </p>
            <Field label={`Merge ${shelf.name} into`}>
              <Select
                value={mergeInto}
                onChange={(event) => {
                  setMergeInto(event.target.value);
                  setConfirmingMerge(false);
                }}
              >
                <option value="">Choose a shelf…</option>
                {mergeTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </Select>
            </Field>
            {confirmingMerge ? (
              <div className={styles.actions}>
                <Button size="sm" onClick={() => void merge()} disabled={saving}>
                  {saving ? "Merging…" : `Confirm: move everything into ${mergeTargetName}`}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmingMerge(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={!mergeInto}
                onClick={() => setConfirmingMerge(true)}
              >
                Merge
              </Button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
