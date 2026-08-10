import { moderationNotice } from "@/lib/moderation-copy";
import type { ProductModerationStatus } from "@/lib/types";
import styles from "./ModerationNotice.module.css";

export interface ModerationNoticeProps {
  status: ProductModerationStatus | undefined;
  note: string | undefined;
}

/**
 * The review-state banner at the top of a HomeKrafter's editor.
 *
 * **Top of the form, above the first field** — deliberately, not near the
 * save button. A rejection reason below the fold reproduces the bug it
 * was meant to fix one screen deeper: the person opens the editor to act
 * on feedback they cannot see, changes something unrelated, and saves.
 *
 * Renders `moderationNote` verbatim (M22). Never summarise it here — the
 * admin wrote a specific sentence and it is the only instruction the
 * HomeKrafter gets.
 */
export function ModerationNotice({ status, note }: ModerationNoticeProps) {
  const notice = moderationNotice(status, note);
  if (!notice) return null;

  return (
    <p
      className={notice.tone === "pending" ? styles.pending : styles.attention}
      // Informational for a queued listing; assertive enough to be
      // announced for one that needs work, since the whole reason the
      // person opened this screen may be sitting in it.
      role={notice.tone === "attention" ? "status" : undefined}
    >
      {notice.text}
    </p>
  );
}
