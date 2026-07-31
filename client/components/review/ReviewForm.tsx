"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { createReview } from "@/lib/api";
import { ApiError } from "@/lib/api/http";
import type { Review, ReviewTargetType } from "@/lib/types";
import styles from "./ReviewForm.module.css";

export interface ReviewFormProps {
  targetType: ReviewTargetType;
  targetId: string;
  /** What is being reviewed, for the heading — "Mango Thokku Pickle". */
  targetName: string;
  /** Called with the saved review so the caller can drop it into its list without a refetch. */
  onSubmitted?: (review: Review) => void;
  onCancel?: () => void;
  className?: string;
}

const RATING_LABELS = ["", "Poor", "Not great", "Fine", "Good", "Excellent"] as const;

/**
 * Write-a-review form — the missing half of the review loop. `POST
 * /reviews` existed since M8 with no call site anywhere in the app.
 *
 * The server only accepts a review from someone with a **delivered**
 * order for this item, so a rejection here is a real answer, not a bug:
 * the `403`/`409` messages are surfaced verbatim rather than replaced
 * with "something went wrong", because "you've already reviewed this"
 * and "wait until it arrives" are the two things the writer needs told.
 */
export function ReviewForm({
  targetType,
  targetId,
  targetName,
  onSubmitted,
  onCancel,
  className,
}: ReviewFormProps) {
  const [rating, setRating] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const shown = hovered || rating;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (rating === 0) {
      setError("Pick a star rating first.");
      return;
    }
    if (body.trim().length < 10) {
      setError("Tell other buyers a little more — at least a sentence.");
      return;
    }

    setSubmitting(true);
    try {
      const review = await createReview({
        targetType,
        targetId,
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
      });
      setDone(true);
      onSubmitted?.(review);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Couldn't save that review. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={clsx(styles.form, styles.done, className)} role="status">
        <span className={styles.doneTitle}>Thanks — your review is live.</span>
        <p className={styles.doneBody}>
          {targetName}&apos;s rating has been updated. HomeKrafters can reply to reviews from
          their portal.
        </p>
      </div>
    );
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit}>
      <h3 className={styles.heading}>Review {targetName}</h3>

      <fieldset className={styles.ratingRow}>
        <legend className={styles.legend}>Your rating</legend>
        <div className={styles.stars} onMouseLeave={() => setHovered(0)}>
          {([1, 2, 3, 4, 5] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={clsx(styles.star, value <= shown && styles.starOn)}
              onClick={() => setRating(value)}
              onMouseEnter={() => setHovered(value)}
              onFocus={() => setHovered(value)}
              onBlur={() => setHovered(0)}
              aria-label={`${value} star${value === 1 ? "" : "s"} — ${RATING_LABELS[value]}`}
              aria-pressed={rating === value}
            >
              ★
            </button>
          ))}
        </div>
        <span className={styles.ratingLabel} aria-live="polite">
          {shown > 0 ? RATING_LABELS[shown] : "Tap a star"}
        </span>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>Headline (optional)</span>
        <input
          type="text"
          className={styles.input}
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Tastes like my grandmother's"
        />
      </label>

      <Textarea
        label="Your review"
        value={body}
        maxLength={2000}
        rows={5}
        onChange={(event) => setBody(event.target.value)}
        placeholder="How was it? Freshness, packaging, whether you'd order again."
        hint={`${body.length}/2000`}
      />

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Posting…" : "Post review"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
