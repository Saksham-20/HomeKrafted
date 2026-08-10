import type { ProductModerationStatus } from "@/lib/types";

export interface ModerationNotice {
  /** What to tell the HomeKrafter, with the admin's reason quoted verbatim. */
  text: string;
  /** `pending` reads as informational; everything else needs attention. */
  tone: "pending" | "attention";
}

/**
 * What a HomeKrafter is told about a listing's review state.
 *
 * **One source, because the reason is the product.** M22's rule is that a
 * refusal reaches the person verbatim — that sentence is the only thing
 * telling them what to change. Until M27 it appeared on the list row and
 * vanished inside the editor, which is the one screen where they can act
 * on it: they would read "Not approved: photo is too dark", click Edit,
 * and land on a form with no indication anything was wrong.
 *
 * Extracted here rather than copied into each editor so the four states
 * cannot drift into two phrasings of the same fact. Never paraphrase
 * `moderationNote` on the way through.
 *
 * Returns `null` for a live listing — an approved item does not need a
 * badge saying so, and adding one everywhere buries the states that need
 * reading.
 */
export function moderationNotice(
  status: ProductModerationStatus | undefined,
  note: string | undefined,
): ModerationNotice | null {
  switch (status ?? "active") {
    case "pending":
      return {
        // The `submittedAt` fact matters most to somebody mid-edit: M22
        // keeps the original queue position on a re-save, and without
        // being told that, the rational move is to not touch it.
        text: "Waiting for review — buyers can’t see this yet. We usually look within a day. Saving an edit won’t lose your place in the queue.",
        tone: "pending",
      };
    case "rejected":
      return {
        text: note
          ? `Not approved: ${note} — edit and save to send it back for review.`
          : "Not approved yet. Edit and save to send it back for review.",
        tone: "attention",
      };
    case "hidden":
      return {
        text: note ? `Taken down by Homekrafted: ${note}` : "Taken down by Homekrafted.",
        tone: "attention",
      };
    case "flagged":
      return {
        text: note
          ? `Paused while we look into this: ${note}`
          : "Paused while we look into this.",
        tone: "attention",
      };
    default:
      return null;
  }
}
