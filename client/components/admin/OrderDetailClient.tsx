"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { Field, Select } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getAdminLaundryBooking,
  getAdminMarketplaceOrder,
  getAdminOrderById,
  getAdminSnackOrder,
  overrideAdminOrderStatus,
  refundAdminOrder,
  type AdminOrderSummary,
  type AdminOrderType,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { LaundryBooking, Order, SnackOrder } from "@/lib/types";
import styles from "./OrderDetailClient.module.css";

export interface OrderDetailClientProps {
  type: AdminOrderType;
  id: string;
}

const TYPE_LABEL: Record<AdminOrderType, string> = {
  marketplace: "Marketplace order",
  laundry: "Laundry booking",
  snack: "Snack order",
};

/**
 * Human labels for the hyphenated status strings the API deals in.
 *
 * A lookup with a fallback to the raw value, not an exhaustive map: the
 * list of statuses is the server's, and a new one appearing here as
 * `out-for-delivery` is mildly ugly, where a map that threw or rendered
 * blank would be a control an operator cannot use.
 */
const STATUS_LABEL: Record<string, string> = {
  "pending-payment": "Pending payment",
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  scheduled: "Scheduled",
  "picked-up": "Picked up",
  "in-progress": "In progress",
  "out-for-delivery": "Out for delivery",
  received: "Received",
  accepted: "Accepted",
};

/**
 * `/admin/orders/[type]/[id]` (M11a) — full read-only detail for one
 * unified order row, branching on `type` to pull the real `Order` /
 * `LaundryBooking` / `SnackOrder` record for its line items (the list
 * summary is deliberately thin — see `AdminOrderSummary`'s doc comment).
 *
 * **Two actions, and they are not the same kind of thing.** The status
 * control records what happened; the refund control moves money. They are
 * two sections in that order — routine first, destructive second — and
 * the status control says so in its description, because an operator
 * reaching for "cancelled" reasonably expects the customer to be made
 * whole and this path would not do that. `cancelled` and `returned` are
 * therefore not offered at all (the server refuses them too).
 */
export function OrderDetailClient({ type, id }: OrderDetailClientProps) {
  const { ready, role } = useAuth();
  const [summary, setSummary] = useState<AdminOrderSummary | null | undefined>(undefined);
  const [marketplaceOrder, setMarketplaceOrder] = useState<Order | undefined>(undefined);
  const [laundryBooking, setLaundryBooking] = useState<LaundryBooking | undefined>(undefined);
  const [snackOrder, setSnackOrder] = useState<SnackOrder | undefined>(undefined);
  const [refundResult, setRefundResult] = useState<{ amount: number } | undefined>(undefined);
  const [refundError, setRefundError] = useState<string | undefined>(undefined);
  const [refunding, setRefunding] = useState(false);
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | undefined>(undefined);
  const [statusResult, setStatusResult] = useState<string | undefined>(undefined);
  /**
   * Minted once per mounted order, not per click. That is what makes a
   * retry after a timeout — the case a per-click key cannot help with —
   * land on the same server-side idempotency record instead of crediting
   * the wallet a second time.
   */
  const [refundKey] = useState(() => `admin-refund-${type}-${id}-${crypto.randomUUID()}`);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const found = await getAdminOrderById(type, id);
      if (cancelled) return;
      setSummary(found ?? null);
      if (!found) return;

      if (type === "marketplace") {
        setMarketplaceOrder(await getAdminMarketplaceOrder(id));
      } else if (type === "laundry") {
        // Service names ride on the booking payload since M37.
        setLaundryBooking(await getAdminLaundryBooking(id));
      } else {
        setSnackOrder(await getAdminSnackOrder(id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, type, id]);

  /**
   * Apply the chosen status, then re-read rather than assume.
   *
   * `expectedStatus` is the one the screen is currently showing, which
   * turns this into a compare-and-set: if another admin moved the order
   * while this tab was open, the server answers 409 and we reload instead
   * of overwriting their decision and sending the buyer a second message.
   */
  async function handleApplyStatus() {
    if (!summary || !pendingStatus || savingStatus) return;
    setStatusError(undefined);
    setStatusResult(undefined);
    setSavingStatus(true);
    try {
      await overrideAdminOrderStatus(type, id, pendingStatus, summary.status);
      const refreshed = await getAdminOrderById(type, id);
      if (refreshed) setSummary(refreshed);
      setStatusResult(
        `Status set to ${STATUS_LABEL[pendingStatus] ?? pendingStatus} — the buyer has been told.`,
      );
      setPendingStatus("");
      setConfirmingStatus(false);
    } catch (error) {
      setStatusError(
        error instanceof Error && error.message
          ? error.message
          : "Couldn't change that status. Nothing was saved — try again.",
      );
      setConfirmingStatus(false);
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleIssueRefund() {
    if (!summary?.customerUserId || refunding) return;
    setRefundError(undefined);
    setRefunding(true);
    try {
      const result = await refundAdminOrder(type, id, refundKey);
      setRefundResult({ amount: result.amount });
      setConfirmingRefund(false);
      // The order's own `refundStatus` changed server-side; re-read it so
      // the summary panel above stops claiming the order is unrefunded.
      if (type === "marketplace") setMarketplaceOrder(await getAdminMarketplaceOrder(id));
    } catch (error) {
      setRefundError(
        error instanceof Error && error.message
          ? error.message
          : "Couldn't issue that refund. Nothing was credited — try again.",
      );
    } finally {
      setRefunding(false);
    }
  }

  if (!ready || summary === undefined) {
    return (
      <div>
        <AdminPageHeader title="Order" back={{ href: "/admin/orders", label: "Orders" }} />
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (summary === null) {
    return (
      <NotFoundCard
        title="We couldn’t find that order"
        body={`Nothing matches this id as a ${TYPE_LABEL[type].toLowerCase()}. It may have been opened from a stale tab, or the reference may belong to a different kind of order — the orders list searches all three.`}
        reference={id}
        backHref="/admin/orders"
        backLabel="Back to orders"
      />
    );
  }

  // Whatever the server says is pickable, minus the one it is already on.
  // An empty list (an older API, or a kind with nothing to offer) simply
  // hides the control rather than rendering an empty select.
  const statusOptions = (summary.statusOptions ?? []).filter((s) => s !== summary.status);

  return (
    <div>
      <AdminPageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        eyebrow={TYPE_LABEL[type]}
        /* The page's only heading. It was a `span` once, so this screen
           shipped with no `h1` at all — nothing for a screen reader to
           land on, and nothing naming the record in the document outline. */
        title={`#${summary.reference}`}
        subtitle={`${formatDate(summary.placedAt)} · ${summary.customerName}${
          summary.customerPhone ? ` (${summary.customerPhone})` : ""
        } · HomeKrafter: ${summary.sellerNames.join(", ")}`}
        actions={
          <div className={styles.headerRight}>
            <StatusPill status={summary.status} />
            <span className={styles.total}>{formatCurrency(summary.total)}</span>
          </div>
        }
      />

      {type === "marketplace" && marketplaceOrder && (
        <FormSection id="order-items" title="Items">
          {marketplaceOrder.items.map((item) => (
            <div key={item.id} className={styles.itemRow}>
              <span className={styles.itemName}>
                {item.name}
                <span className={styles.itemQty}>×{item.quantity}</span>
              </span>
              <span className={styles.itemPrice}>{formatCurrency(item.price)}</span>
            </div>
          ))}
          <div className={styles.grid}>
            <Fact label="Subtotal" value={formatCurrency(marketplaceOrder.subtotal)} />
            <Fact label="Shipping" value={formatCurrency(marketplaceOrder.shippingFee)} />
            <Fact label="Wallet applied" value={formatCurrency(marketplaceOrder.walletApplied)} />
            <Fact label="Cashback earned" value={formatCurrency(marketplaceOrder.cashbackEarned)} />
            <Fact label="Payment method" value={marketplaceOrder.paymentMethod} />
            <Fact label="Refund status" value={marketplaceOrder.refundStatus} />
          </div>
        </FormSection>
      )}

      {type === "laundry" && laundryBooking && (
        <FormSection id="order-items" title="Lines">
          {laundryBooking.lines.map((line, index) => (
            <div key={`${line.serviceId}-${index}`} className={styles.itemRow}>
              <span className={styles.itemName}>{line.serviceName ?? line.serviceId}</span>
              <span className={styles.itemPrice}>{formatCurrency(line.estimatedPrice)}</span>
            </div>
          ))}
          <div className={styles.grid}>
            <Fact label="Pickup" value={formatDate(laundryBooking.pickupSlot.date)} />
            <Fact label="Delivery" value={formatDate(laundryBooking.deliverySlot.date)} />
            <Fact label="Payment method" value={laundryBooking.paymentMethod} />
            <Fact label="Wallet cashback" value={formatCurrency(laundryBooking.walletCashback ?? 0)} />
          </div>
        </FormSection>
      )}

      {type === "snack" && snackOrder && (
        <FormSection id="order-items" title="Items">
          {snackOrder.items.map((item) => (
            <div key={item.snackId} className={styles.itemRow}>
              <span className={styles.itemName}>
                {item.name}
                <span className={styles.itemQty}>×{item.quantity}</span>
              </span>
              <span className={styles.itemPrice}>{formatCurrency(item.price)}</span>
            </div>
          ))}
          <div className={styles.grid}>
            <Fact label="Channel" value={snackOrder.channel} />
          </div>
        </FormSection>
      )}

      {/* Routine first, destructive second. The status control records
          what happened; the refund below moves money. */}
      {statusOptions.length > 0 && (
        <FormSection
          id="order-status"
          title="Correct the status"
          description="Records the status only — no money moves, and the buyer is told. To return money, use the refund below."
        >
          <div className={styles.statusRow}>
            <Field label="New status" className={styles.statusField}>
              <Select
                value={pendingStatus}
                disabled={savingStatus || confirmingStatus}
                onChange={(event) => {
                  setPendingStatus(event.target.value);
                  setConfirmingStatus(false);
                  setStatusError(undefined);
                  setStatusResult(undefined);
                }}
              >
                <option value="">Choose a status…</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABEL[option] ?? option}
                  </option>
                ))}
              </Select>
            </Field>
            {/* Two-step inline, the pattern `ProductModerationRow`
                established — not `window.confirm` (the money sentence
                belongs in our own type) and not a modal (which would owe
                the M16 focus contract for a one-line confirmation). */}
            {confirmingStatus ? (
              <>
                <Button variant="primary" size="sm" onClick={handleApplyStatus} disabled={savingStatus}>
                  {savingStatus
                    ? "Saving…"
                    : `Confirm: mark as ${STATUS_LABEL[pendingStatus] ?? pendingStatus}`}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmingStatus(false)}
                  disabled={savingStatus}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmingStatus(true)}
                disabled={!pendingStatus || pendingStatus === summary.status}
              >
                Apply
              </Button>
            )}
          </div>
          {statusError && <Notice tone="danger">{statusError}</Notice>}
          {statusResult && !statusError && (
            <Notice tone="success" live>
              {statusResult}
            </Notice>
          )}
        </FormSection>
      )}

      <FormSection
        id="order-refund"
        title="Refund"
        description={
          summary.customerUserId
            ? `Credits ${summary.customerName}'s wallet with the full order total and marks the order refunded, so it cannot be refunded twice. For a partial amount, use their wallet instead, where the reason is recorded against the entry.`
            : undefined
        }
        actions={
          summary.customerUserId ? (
            <Link href={`/admin/wallet/${summary.customerUserId}`} className={styles.walletLink}>
              Open their wallet
            </Link>
          ) : undefined
        }
      >
        {summary.customerUserId ? (
          <>
            <div className={styles.refundRow}>
              {/* The amount was an editable number field wired to a raw
                  wallet credit. It looked like a partial-refund control
                  and behaved like one, but nothing downstream knew the
                  order had been refunded at all — so the same order could
                  be refunded again the next day. This is now the amount
                  the audited endpoint will credit, stated rather than
                  typed. */}
              <span className={styles.refundField}>
                <span className={styles.fieldLabel}>Refund amount</span>
                <span className={styles.refundAmount}>{formatCurrency(summary.total)}</span>
              </span>
              {confirmingRefund ? (
                <>
                  <Button variant="primary" size="sm" onClick={handleIssueRefund} disabled={refunding}>
                    {refunding ? "Processing…" : `Confirm: refund ${formatCurrency(summary.total)}`}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingRefund(false)}
                    disabled={refunding}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setConfirmingRefund(true)}
                  disabled={refunding || Boolean(refundResult)}
                >
                  Issue refund
                </Button>
              )}
            </div>
            {refundError && <Notice tone="danger">{refundError}</Notice>}
            {refundResult && !refundError && (
              <Notice tone="success" live>
                Refunded {formatCurrency(refundResult.amount)} to {summary.customerName}&rsquo;s wallet.
              </Notice>
            )}
          </>
        ) : (
          <p className={styles.stubNote}>
            {type === "snack"
              ? "Snack orders come in over WhatsApp with no registered account — there's no wallet to refund. Handle adjustments directly with the customer."
              : "This booking has no linked wallet, so there is nothing to refund from here. Handle adjustments directly with the customer."}
          </p>
        )}
      </FormSection>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}
