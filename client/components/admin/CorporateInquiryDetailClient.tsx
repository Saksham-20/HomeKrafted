"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { AdminPageHeader } from "./AdminPageHeader";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { StatusPill } from "./StatusPill";
import {
  createCorporateQuote,
  getAdminCorporateInquiry,
  getVendors,
  revokeCorporateQuoteLink,
  sendCorporateQuote,
  setCorporateInquiryNotes,
  setCorporateInquiryStatus,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  AdminCorporateInquiryDetail,
  CorporateInquiryStatus,
  CorporateQuoteLineInput,
  Vendor,
} from "@/lib/types";
import styles from "./CorporateInquiryDetailClient.module.css";

const STATUSES: CorporateInquiryStatus[] = ["new", "contacted", "quoted", "closed"];

interface LineDraft {
  vendorId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_LINE: LineDraft = { vendorId: "", description: "", quantity: "", unitPrice: "" };

/** A fortnight out — long enough to get an answer, short enough that prices hold. */
function defaultValidUntil(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

/**
 * One enquiry, and the quotes raised against it.
 *
 * The quote builder is here rather than inline on the queue because it is
 * a real form — several lines, a total, an expiry — and an expanding row
 * would lose it on a mis-click.
 */
export function CorporateInquiryDetailClient({ inquiryId }: { inquiryId: string }) {
  const [inquiry, setInquiry] = useState<AdminCorporateInquiryDetail | undefined>(undefined);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [building, setBuilding] = useState(false);
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [taxAmount, setTaxAmount] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAdminCorporateInquiry(inquiryId), getVendors()])
      .then(([detail, allVendors]) => {
        if (cancelled) return;
        setInquiry(detail);
        setNotes(detail?.internalNotes ?? "");
        setVendors(allVendors);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this enquiry.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inquiryId]);

  async function reload() {
    setInquiry(await getAdminCorporateInquiry(inquiryId));
  }

  /** Every mutation goes through here, so none of them can swallow a failure silently. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const subtotal = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0,
  );
  const total = subtotal + (Number(taxAmount) || 0) + (Number(deliveryFee) || 0);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleCreateQuote() {
    const payload: CorporateQuoteLineInput[] = lines
      .filter((line) => line.vendorId && line.description.trim())
      .map((line) => ({
        vendorId: line.vendorId,
        description: line.description.trim(),
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
      }));

    if (payload.length === 0) {
      setError("Every line needs a HomeKrafter and a description before this can be quoted.");
      return;
    }
    if (payload.some((line) => line.quantity < 1)) {
      setError("Every line needs a quantity of at least 1.");
      return;
    }

    await run(async () => {
      await createCorporateQuote(inquiryId, {
        validUntil: new Date(validUntil).toISOString(),
        notes: quoteNotes.trim() || undefined,
        taxAmount: Number(taxAmount) || 0,
        deliveryFee: Number(deliveryFee) || 0,
        lines: payload,
      });
      setBuilding(false);
      setLines([{ ...EMPTY_LINE }]);
      setQuoteNotes("");
      setTaxAmount("");
      setDeliveryFee("");
    });
  }

  if (loading) return <RouteSkeleton variant="page" />;
  if (!inquiry) {
    return (
      <NotFoundCard
        title="We couldn’t find that enquiry"
        body="Nothing matches this id. It may have been opened from a stale tab, or the enquiry may have been removed since."
        reference={inquiryId}
        backHref="/admin/corporate"
        backLabel="Back to enquiries"
      />
    );
  }

  return (
    <div>
      <AdminPageHeader
        title={inquiry.companyName}
        subtitle={`${inquiry.contactName} · ${inquiry.email} · ${inquiry.phone}`}
      />

      <Link href="/admin/corporate" className={styles.back}>
        ← All enquiries
      </Link>

      {error && (
        <p className={styles.error} role="alert" aria-live="polite">
          {error}
        </p>
      )}

      <Card className={styles.section}>
        <div className={styles.headRow}>
          <StatusPill
            status={inquiry.orderType ?? "corporate"}
            label={inquiry.orderType === "bulk" ? "Bulk" : "Corporate"}
          />
          <StatusPill status={inquiry.status} />
          <span className={styles.meta}>Received {formatDate(inquiry.createdAt)}</span>
        </div>

        <dl className={styles.facts}>
          <div>
            <dt>Quantity</dt>
            <dd>{inquiry.estimatedQuantity} units</dd>
          </div>
          {inquiry.occasion && (
            <div>
              <dt>Occasion</dt>
              <dd>{inquiry.occasion}</dd>
            </div>
          )}
          {inquiry.budgetRange && (
            <div>
              <dt>Budget</dt>
              <dd>{inquiry.budgetRange}</dd>
            </div>
          )}
        </dl>

        <p className={styles.message}>{inquiry.message}</p>

        <div className={styles.statusRow}>
          <span className={styles.label}>Move to</span>
          {STATUSES.map((status) => (
            <Button
              key={status}
              variant={inquiry.status === status ? "primary" : "secondary"}
              size="sm"
              disabled={busy || inquiry.status === status}
              onClick={() => run(() => setCorporateInquiryStatus(inquiryId, status))}
            >
              {status}
            </Button>
          ))}
        </div>
      </Card>

      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>Internal notes</h2>
        <p className={styles.hint}>Only visible here. The customer never sees this.</p>
        <Textarea
          label="Notes"
          value={notes}
          rows={3}
          onChange={(event) => setNotes(event.target.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => run(() => setCorporateInquiryNotes(inquiryId, notes))}
        >
          Save notes
        </Button>
      </Card>

      <Card className={styles.section}>
        <div className={styles.headRow}>
          <h2 className={styles.sectionTitle}>Quotes</h2>
          {!building && (
            <Button variant="primary" size="sm" onClick={() => setBuilding(true)}>
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              New quote
            </Button>
          )}
        </div>

        {inquiry.quotes.length === 0 && !building && (
          <p className={styles.hint}>
            No quotes yet. Build one to send them a price they can accept from an emailed link —
            no account needed on their side.
          </p>
        )}

        {inquiry.quotes.map((quote) => (
          <div key={quote.id} className={styles.quote}>
            <div className={styles.headRow}>
              {/* `accepted` maps to gold by default because an accepted
                  snack order is still in progress. On a quote it is the
                  outcome, so the tone is overridden. */}
              <StatusPill
                status={quote.status}
                tone={quote.status === "accepted" ? "success" : undefined}
              />
              <span className={styles.quoteTotal}>{formatCurrency(quote.total)}</span>
              <span className={styles.meta}>valid to {formatDate(quote.validUntil)}</span>
            </div>

            <ul className={styles.quoteLines}>
              {quote.lines.map((line) => (
                <li key={line.id}>
                  {line.quantity} × {line.description} — {line.vendorName} ·{" "}
                  {formatCurrency(line.lineTotal)}
                </li>
              ))}
            </ul>

            {quote.acceptedAt && (
              <p className={styles.accepted}>
                Accepted by <strong>{quote.acceptedName}</strong> on {formatDate(quote.acceptedAt)}.
                {/* The recorded narrowing: acceptance is an agreement on
                    price, not an order. Saying so here stops an admin
                    assuming fulfilment started on its own. */}{" "}
                No orders were created — place them once you have a delivery address and payment
                terms.
              </p>
            )}

            <div className={styles.quoteActions}>
              {quote.status !== "accepted" && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => sendCorporateQuote(quote.id))}
                >
                  {quote.sentAt ? "Re-send (new link)" : "Send"}
                </Button>
              )}
              {quote.hasLiveLink && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Withdraw the link? Anyone holding it will stop being able to open or accept this quote.",
                      )
                    ) {
                      void run(() => revokeCorporateQuoteLink(quote.id));
                    }
                  }}
                >
                  Withdraw link
                </Button>
              )}
            </div>
          </div>
        ))}

        {building && (
          <div className={styles.builder}>
            <h3 className={styles.builderTitle}>New quote</h3>

            {lines.map((line, index) => (
              <div key={index} className={styles.lineRow}>
                <select
                  className={styles.select}
                  value={line.vendorId}
                  onChange={(event) => updateLine(index, { vendorId: event.target.value })}
                  aria-label="HomeKrafter"
                >
                  <option value="">HomeKrafter…</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.input}
                  placeholder="Custom Diwali hamper"
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                  aria-label="Description"
                />
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  aria-label="Quantity"
                />
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  placeholder="Unit ₹"
                  value={line.unitPrice}
                  onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                  aria-label="Unit price"
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                  disabled={lines.length <= 1}
                  aria-label="Remove line"
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}

            <button
              type="button"
              className={styles.addButton}
              onClick={() => setLines((c) => [...c, { ...EMPTY_LINE }])}
            >
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              Add line
            </button>

            <p className={styles.hint}>
              Every line names a HomeKrafter, even a fully custom one. Without it nobody can see
              the work and nobody can be paid for it.
            </p>

            <div className={styles.builderGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Valid until</span>
                <input
                  className={styles.input}
                  type="date"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Delivery ₹</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  value={deliveryFee}
                  onChange={(event) => setDeliveryFee(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Tax ₹</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  value={taxAmount}
                  onChange={(event) => setTaxAmount(event.target.value)}
                />
              </label>
            </div>

            <Textarea
              label="Notes on the quote"
              value={quoteNotes}
              rows={2}
              onChange={(event) => setQuoteNotes(event.target.value)}
              hint="Shown to the customer, above the Accept button."
            />

            {/* The total, before it is created — nobody should have to save
                a quote to find out what it says. */}
            <p className={styles.builderTotal}>
              Subtotal {formatCurrency(subtotal)} · <strong>Total {formatCurrency(total)}</strong>
            </p>

            <div className={styles.quoteActions}>
              <Button variant="primary" size="sm" disabled={busy} onClick={handleCreateQuote}>
                {busy ? "Saving…" : "Create draft"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setBuilding(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
