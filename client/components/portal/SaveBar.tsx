"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import styles from "./SaveBar.module.css";

export interface SaveBarProps {
  /** The form differs from what was loaded or last saved. */
  dirty: boolean;
  saving?: boolean;
  /** The last save succeeded and nothing has changed since. */
  saved?: boolean;
  /** The server's sentence, or the fallback — rendered and announced. */
  error?: string;
  onSave: () => void;
  /** Reverts the form to its last saved state. Shown only while dirty. */
  onDiscard?: () => void;
  saveLabel?: string;
  savingLabel?: string;
  /** For a form that has no dirty tracking (a create screen): Save stays enabled. */
  alwaysEnabled?: boolean;
  /** Extra controls left of the buttons — a Cancel link on a create screen. */
  children?: ReactNode;
  className?: string;
}

/**
 * The sticky save bar under every long form (2026-09-04) — the
 * "contextual save bar" pattern, without the top-bar takeover.
 *
 * It says three things a lone Save button cannot: whether there is
 * anything to save, whether the last save landed, and what the server
 * said if it did not. Sticky to the bottom of the viewport, so on a
 * twenty-field page the button is always in reach and "did I save that?"
 * has an answer on screen. Discard appears only once something has
 * changed, next to the thing it undoes.
 */
export function SaveBar({
  dirty,
  saving = false,
  saved = false,
  error,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  savingLabel = "Saving…",
  alwaysEnabled = false,
  children,
  className,
}: SaveBarProps) {
  const showSaved = saved && !dirty && !error;
  return (
    <div className={clsx(styles.bar, dirty && styles.dirty, className)}>
      <p
        className={clsx(styles.status, error && styles.error, showSaved && styles.saved)}
        role="status"
        aria-live="polite"
      >
        {error ? (
          <>
            <AlertCircle size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{error}</span>
          </>
        ) : saving ? (
          <span>{savingLabel}</span>
        ) : dirty ? (
          <>
            <span className={styles.dot} aria-hidden="true" />
            <span>Unsaved changes</span>
          </>
        ) : showSaved ? (
          <>
            <Check size={16} strokeWidth={2} aria-hidden="true" />
            <span>Saved</span>
          </>
        ) : null}
      </p>
      <div className={styles.buttons}>
        {children}
        {onDiscard && dirty && !saving && (
          <Button variant="secondary" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving || (!dirty && !alwaysEnabled)}
        >
          {saving ? savingLabel : saveLabel}
        </Button>
      </div>
    </div>
  );
}
