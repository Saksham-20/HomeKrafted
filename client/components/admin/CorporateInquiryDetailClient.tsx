"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { Field, FieldGrid, Input, Select, TextArea } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { AdminPageHeader } from "./AdminPageHeader";
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

const STAGES: { value: CorporateInquiryStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "closed", label: "Closed" },
];

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
  const [notesSaved, setNotesSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // The quote whose link is about to be withdrawn — a two-step inline
  // confirm rather than `window.confirm`, so the sentence saying what it
  // does is in our own type.
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

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

  async function handleSaveNotes() {
    setBusy(true);
    setError(undefined);
    try {
      await setCorporateInquiryNotes(inquiryId, notes);
      await reload();
      setNotesSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the notes. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(quoteId: string) {
    setBusy(true);
    setError(undefined);
    try {
      await revokeCorporateQuoteLink(quoteId);
      await reload();
      setConfirmRevoke(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't withdraw that link. Try again.");
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

  if (loading) {
    return (
      <div>
        <AdminPageHeader title="Enquiry" back={{ href: "/admin/corporate", label: "Enquiries" }} />
        <LoadingRows rows={4} />
      </div>
    );
  }
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

  const notesDirty = notes !== (inquiry.internalNotes ?? "");

  return (
    <div>
      <AdminPageHeader
        back={{ href: "/admin/corporate", label: "Enquiries" }}
        eyebrow="Corporate & bulk"
        title={inquiry.companyName}
        subtitle={`${inquiry.contactName} · ${inquiry.email} · ${inquiry.phone} · Received ${formatDate(inquiry.createdAt)}`}
        actions={
          <div className={styles.headRow}>
            <StatusPill
              status={inquiry.orderType ?? "corporate"}
              label={inquiry.orderType === "bulk" ? "Bulk" : "Corporate"}
            />
            <StatusPill status={inquiry.status} />
          </div>
        }
      />

      {error && (
        <Notice tone="danger" onDismiss={() => setError(undefined)}>
          {error}
        </Notice>
      )}

      <FormSection
        id="enquiry-ask"
        title="What they asked for"
        footer={
          <SegmentedFilter
            label="Stage"
            value={inquiry.status}
            onChange={(status) => {
              if (status !== inquiry.status && !busy) void run(() => setCorporateInquiryStatus(inquiryId, status));
            }}
            options={STAGES}
          />
        }
      >
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
      </FormSection>

      <FormSection
        id="enquiry-notes"
        title="Internal notes"
        description="Only visible here. The customer never sees this."
        footer={
          <div className={styles.quoteActions}>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !notesDirty}
              onClick={handleSaveNotes}
            >
              Save notes
            </Button>
            {notesSaved && !notesDirty && (
              <span className={styles.meta} role="status">
                Saved.
              </span>
            )}
          </div>
        }
      >
        <Field label="Notes" labelAsText>
          <TextArea
            value={notes}
            rows={3}
            autoGrow
            onChange={(event) => {
              setNotes(event.target.value);
              setNotesSaved(false);
            }}
            placeholder="Who you spoke to, what they liked, what to follow up on."
          />
        </Field>
      </FormSection>

      <FormSection
        id="enquiry-quotes"
        title="Quotes"
        description="A quote goes out as an emailed link the customer can accept without an account. Accepting agrees a price — it creates no orders."
        actions={
          !building ? (
            <Button variant="primary" size="sm" onClick={() => setBuilding(true)}>
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              New quote
            </Button>
          ) : undefined
        }
      >
        {inquiry.quotes.length === 0 && !building && (
          <p className={styles.hint}>No quotes yet. Build one to send them a price.</p>
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
              {quote.hasLiveLink && confirmRevoke !== quote.id && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmRevoke(quote.id)}
                >
                  Withdraw link
                </Button>
              )}
              {confirmRevoke === quote.id && (
                <>
                  <span className={styles.meta}>
                    Anyone holding the link will stop being able to open or accept this quote.
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleRevoke(quote.id)}
                  >
                    Confirm: withdraw
                  </Button>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmRevoke(null)}>
                    Keep it
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}

        {building && (
          <div className={styles.builder}>
            <h3 className={styles.builderTitle}>New quote</h3>

            {lines.map((line, index) => (
              <div key={index} className={styles.lineRow}>
                <Select
                  dense
                  value={line.vendorId}
                  onChange={(event) => updateLine(index, { vendorId: event.target.value })}
                  aria-label={`Line ${index + 1} HomeKrafter`}
                >
                  <option value="">HomeKrafter…</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </Select>
                <Input
                  dense
                  placeholder="Custom Diwali hamper"
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                  aria-label={`Line ${index + 1} description`}
                />
                <Input
                  dense
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  aria-label={`Line ${index + 1} quantity`}
                />
                <Input
                  dense
                  type="number"
                  min={0}
                  inputMode="decimal"
                  affixStart="₹"
                  placeholder="Unit"
                  value={line.unitPrice}
                  onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                  aria-label={`Line ${index + 1} unit price`}
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                  disabled={lines.length <= 1}
                  aria-label={`Remove line ${index + 1}`}
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

            <FieldGrid columns={3}>
              <Field label="Valid until">
                <Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
              </Field>
              <Field label="Delivery" optional>
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  affixStart="₹"
                  value={deliveryFee}
                  onChange={(event) => setDeliveryFee(event.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Tax" optional>
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  affixStart="₹"
                  value={taxAmount}
                  onChange={(event) => setTaxAmount(event.target.value)}
                  placeholder="0"
                />
              </Field>
            </FieldGrid>

            <Field label="Notes on the quote" optional hint="Shown to the customer, above the Accept button.">
              <TextArea value={quoteNotes} rows={2} onChange={(event) => setQuoteNotes(event.target.value)} />
            </Field>

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
      </FormSection>
    </div>
  );
}
