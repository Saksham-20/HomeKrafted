import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import styles from "./NotFoundCard.module.css";

export interface NotFoundCardProps {
  /** What was being opened, sentence-initial: "We couldn't find that order". */
  title: string;
  /** Why it might have happened, and what is still true. One or two sentences. */
  body: string;
  /** The identifier that did not resolve, shown so it can be checked against the source it was copied from. */
  reference?: string;
  backHref: string;
  backLabel: string;
}

/**
 * "That record isn't here", for any signed-in detail screen.
 *
 * Twelve detail screens each rendered their own version of this — six in
 * admin (M26), six in the HomeKrafter portal (M27) — and every one was
 * the same one-liner in a centred card: `Order not found.`,
 * `Listing not found.`, `Snack not found.` No heading, no reason, no way
 * onward but the small back link above it. That is a dead end wearing the
 * clothes of a result: the person is told the thing they clicked does not
 * exist and given nothing to do about it, on a screen with no `h1` for a
 * screen reader to land on.
 *
 * Three parts, deliberately, and the third is the one that was missing
 * everywhere: **what happened, why it might have happened, and a way
 * out.** The heading is a real `h1` because these screens have no other
 * one — the page title lives inside the record that failed to load.
 *
 * Not to be confused with its neighbour `RouteMessage`, which is the
 * full-route panel a `not-found.tsx` boundary renders when the *route*
 * does not resolve. This one is a card inside a page that loaded fine and
 * returned 200; the record inside it is what is missing.
 */
export function NotFoundCard({ title, body, reference, backHref, backLabel }: NotFoundCardProps) {
  return (
    <div>
      <Link href={backHref} className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        {backLabel}
      </Link>
      <Card className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>
          {body}
          {reference ? (
            <>
              {" "}
              Reference: <code className={styles.reference}>{reference}</code>
            </>
          ) : null}
        </p>
        <Link href={backHref} className={styles.action}>
          {backLabel}
        </Link>
      </Card>
    </div>
  );
}
