"use client";

import { useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { acceptPublicQuote, declinePublicQuote } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PublicCorporateQuote } from "@/lib/types";
import styles from "./QuoteClient.module.css";

export interface QuoteClientProps {
  token: string;
  initialQuote: PublicCorporateQuote;
}

/**
 * The quote itself, and the one action on it.
 *
 * Acceptance is a **two-step confirm** with a typed name, following the
 * house pattern in `PayoutsClient`. For a five-figure commitment reached
 * through a link that can be forwarded to anyone, `acceptedAt` alone is
 * not evidence of who agreed — and a single tap on a phone is too easy to
 * do by accident.
 *
 * There is no login wall and no account-creation prompt anywhere on this
 * page. Procurement will not make an account to accept a quote.
 */
export function QuoteClient({ token, initialQuote }: QuoteClientProps) {
  const [quote, setQuote] = useState(initialQuote);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [authorised, setAuthorised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleAccept() {
    if (!name.trim() || !authorised) return;
    setBusy(true);
    setError(undefined);
    try {
      setQuote(await acceptPublicQuote(token, name.trim()));
      setConfirming(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That didn't go through. Please try again, or call us on the number below.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    if (!window.confirm("Decline this quote? We'll be told, and we can send a revised one.")) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setQuote(await declinePublicQuote(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  const isOpen = quote.status === "valid";

  return (
    <div className={styles.page}>
      <header className={styles.brandBar}>
        {/* Who this is from, first and unmistakably. They may never have
            heard of us before this email. */}
        <span className={styles.brand}>Homekrafted</span>
        <span className={styles.brandNote}>Homemade food &amp; handcrafted gifts</span>
      </header>

      <main className={styles.sheet}>
        <div className={styles.headline}>
          <span className={styles.eyebrow}>Quote for</span>
          <h1 className={styles.company}>{quote.companyName}</h1>
          {quote.occasion && <p className={styles.occasion}>For {quote.occasion}</p>}
        </div>

        {quote.status === "accepted" && (
          /* Not an error state. Somebody clicking their emailed link a
             second time is the ordinary case for a forwarded quote. */
          <div className={clsx(styles.banner, styles.bannerAccepted)}>
            <CheckCircle2 size={18} strokeWidth={1.8} aria-hidden="true" />
            <div>
              <strong>Accepted{quote.acceptedName ? ` by ${quote.acceptedName}` : ""}</strong>
              {quote.acceptedAt && <> on {formatDate(quote.acceptedAt)}</>}
              <p className={styles.bannerBody}>
                We&rsquo;ll be in touch to confirm delivery dates and invoicing. Nothing has been
                charged — this is an agreement on price, not a payment.
              </p>
            </div>
          </div>
        )}

        {quote.status === "expired" && (
          <div className={clsx(styles.banner, styles.bannerExpired)}>
            <Clock size={18} strokeWidth={1.8} aria-hidden="true" />
            <div>
              <strong>This quote expired on {formatDate(quote.validUntil)}</strong>
              <p className={styles.bannerBody}>
                Prices move, so we won&rsquo;t hold this one. Reply to the email it came from and
                we&rsquo;ll send an updated quote.
              </p>
            </div>
          </div>
        )}

        {quote.status === "declined" && (
          <div className={clsx(styles.banner, styles.bannerDeclined)}>
            <XCircle size={18} strokeWidth={1.8} aria-hidden="true" />
            <div>
              <strong>Declined</strong>
              <p className={styles.bannerBody}>
                We&rsquo;ve been told. If that was a mistake, or you&rsquo;d like a revised quote,
                just reply to the email.
              </p>
            </div>
          </div>
        )}

        {/*
          A line table at 360px either scrolls the whole page sideways or
          stacks. It stacks: a card per line, which is what the CSS does
          below the breakpoint. This is the likely reading context — an
          emailed link, opened on a phone.
        */}
        <section className={styles.lines} aria-label="What's included">
          <div className={styles.lineHead} aria-hidden="true">
            <span>Item</span>
            <span className={styles.num}>Qty</span>
            <span className={styles.num}>Unit</span>
            <span className={styles.num}>Total</span>
          </div>
          {quote.lines.map((line, index) => (
            <div key={index} className={styles.line}>
              <span className={styles.lineDesc}>{line.description}</span>
              <span className={clsx(styles.num, styles.lineCell)}>
                <span className={styles.mobileLabel}>Qty </span>
                {line.quantity}
              </span>
              <span className={clsx(styles.num, styles.lineCell)}>
                <span className={styles.mobileLabel}>Unit </span>
                {formatCurrency(line.unitPrice)}
              </span>
              <span className={clsx(styles.num, styles.lineTotal)}>
                {formatCurrency(line.lineTotal)}
              </span>
            </div>
          ))}
        </section>

        <section className={styles.totals} aria-label="Total">
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span className={styles.num}>{formatCurrency(quote.subtotal)}</span>
          </div>
          {quote.deliveryFee > 0 && (
            <div className={styles.totalRow}>
              <span>Delivery</span>
              <span className={styles.num}>{formatCurrency(quote.deliveryFee)}</span>
            </div>
          )}
          <div className={styles.totalRow}>
            <span>Tax</span>
            <span className={styles.num}>{formatCurrency(quote.taxAmount)}</span>
          </div>
          {/*
            The figure they will be invoiced, stated as such. A subtotal
            presented as a total is the single most avoidable way to lose
            trust on a B2B quote.
          */}
          <div className={clsx(styles.totalRow, styles.grandTotal)}>
            <span>Total payable</span>
            <span className={styles.num}>{formatCurrency(quote.total)}</span>
          </div>
          <p className={styles.taxNote}>Tax shown is included in the total above.</p>
        </section>

        {quote.notes && (
          <section className={styles.notes}>
            <h2 className={styles.notesTitle}>Notes</h2>
            <p>{quote.notes}</p>
          </section>
        )}

        {isOpen && (
          <p className={styles.validity}>
            This quote holds until <strong>{formatDate(quote.validUntil)}</strong>.
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert" aria-live="polite">
            {error}
          </p>
        )}

        {isOpen &&
          (confirming ? (
            <section className={styles.confirm} aria-label="Confirm acceptance">
              <h2 className={styles.confirmTitle}>
                Accepting {formatCurrency(quote.total)}
              </h2>
              <p className={styles.confirmBody}>
                This confirms the price. We&rsquo;ll follow up about delivery dates and invoicing
                — nothing is charged here.
              </p>

              <label className={styles.field}>
                <span className={styles.label}>Your full name</span>
                <input
                  className={styles.input}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={quote.contactName}
                  autoComplete="name"
                />
              </label>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={authorised}
                  onChange={(event) => setAuthorised(event.target.checked)}
                />
                <span>
                  I&rsquo;m authorised to accept this on behalf of {quote.companyName}.
                </span>
              </label>

              <div className={styles.actions}>
                <Button
                  variant="primary"
                  onClick={handleAccept}
                  disabled={busy || !name.trim() || !authorised}
                >
                  {busy ? "Confirming…" : `Accept ${formatCurrency(quote.total)}`}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                  Back
                </Button>
              </div>
            </section>
          ) : (
            <div className={styles.actions}>
              <Button variant="primary" onClick={() => setConfirming(true)}>
                Accept this quote
              </Button>
              <Button variant="secondary" onClick={handleDecline} disabled={busy}>
                Decline
              </Button>
            </div>
          ))}

        <footer className={styles.help}>
          Questions, or want something changed? Reply to the email this came from, or call{" "}
          <a href="tel:+919876543210">+91 98765 43210</a>. A person answers.
        </footer>
      </main>
    </div>
  );
}
