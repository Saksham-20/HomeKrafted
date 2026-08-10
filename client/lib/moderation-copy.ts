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
        text: "Waiting for approval — buyers can’t see this yet. We usually look within a day. Saving an edit won’t lose your place in the queue.",
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

export interface ModerationPill {
  /** Two or three words, for a list row. */
  label: string;
  /** Same split as `ModerationNotice.tone` — drives the pill's colour. */
  tone: "pending" | "attention";
}

/**
 * The same four states as a **pill for a list row**, where the full
 * sentence does not fit.
 *
 * **Why this is here and not in the rows.** `/seller/listings` grew a
 * private `reviewState()` and `/seller/meal-plans` a private
 * `MODERATION_LABEL`, and `/seller/menu` grew nothing at all — so a snack
 * awaiting approval showed a green "AVAILABLE" pill and no hint that no
 * buyer could see it. Three list rows, three answers to one question, one
 * of them silence. That is the drift `moderationNotice` was extracted to
 * prevent, reappearing one component further out.
 *
 * The division of labour: **the row says which state, the editor says
 * why.** The reason itself is never shortened — `moderationNote` reaches
 * the HomeKrafter verbatim (M22) next to the edit link that resolves it.
 *
 * `pending` is deliberately a *different tone* from the other three. "We
 * have not looked yet" is not a reprimand, and colouring it like a refusal
 * tells a kitchen they did something wrong by listing something.
 *
 * Returns `null` for `active` — a live listing needs no badge, and one
 * everywhere buries the states worth reading.
 */
export function moderationPill(status: ProductModerationStatus | undefined): ModerationPill | null {
  switch (status ?? "active") {
    // "Approval", not "review", in every state label — the long form above
    // opens the same way. Keep the two in step: they sit one tap apart, on
    // the row and in the editor it links to.
    case "pending":
      return { label: "Waiting for approval", tone: "pending" };
    // Not "Rejected". The route back is an edit, and M22 re-queues a
    // rejected listing on any change — a word that sounds final describes
    // the wrong situation.
    case "rejected":
      return { label: "Needs a change", tone: "attention" };
    case "hidden":
      return { label: "Hidden by us", tone: "attention" };
    case "flagged":
      return { label: "Paused", tone: "attention" };
    default:
      return null;
  }
}
