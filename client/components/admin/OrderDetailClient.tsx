"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getAdminLaundryBooking,
  getAdminMarketplaceOrder,
  getAdminOrderById,
  getAdminSnackOrder,
  getLaundryServices,
  overrideAdminOrderStatus,
  refundAdminOrder,
  type AdminOrderSummary,
  type AdminOrderType,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { LaundryBooking, LaundryService, Order, SnackOrder } from "@/lib/types";
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
 * control records what happened; the refund control moves money. They sit
 * in one card in that order — routine first, destructive second — and the
 * status control says so in its confirmation, because an operator
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
  const [laundryServices, setLaundryServices] = useState<LaundryService[]>([]);
  const [refundResult, setRefundResult] = useState<{ amount: number } | undefined>(undefined);
  const [refundError, setRefundError] = useState<string | undefined>(undefined);
  const [refunding, setRefunding] = useState(false);
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
        const [booking, services] = await Promise.all([getAdminLaundryBooking(id), getLaundryServices()]);
        if (cancelled) return;
        setLaundryBooking(booking);
        setLaundryServices(services);
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
    return <RouteSkeleton variant="page" />;
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

  function serviceName(serviceId: string): string {
    return laundryServices.find((s) => s.id === serviceId)?.name ?? serviceId;
  }

  // Whatever the server says is pickable, minus the one it is already on.
  // An empty list (an older API, or a kind with nothing to offer) simply
  // hides the control rather than rendering an empty select.
  const statusOptions = (summary.statusOptions ?? []).filter((s) => s !== summary.status);

  return (
    <div>
      <Link href="/admin/orders" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to orders
      </Link>

      <div className={styles.header}>
        <div className={styles.headerBody}>
          {/* The page's only heading. It was a `span`, so this screen
              shipped with no `h1` at all — nothing for a screen reader to
              land on, and nothing naming the record in the document
              outline. */}
          <h1 className={styles.reference}>#{summary.reference}</h1>
          <span className={styles.meta}>
            {TYPE_LABEL[type]} · {formatDate(summary.placedAt)} · {summary.customerName}
            {summary.customerPhone ? ` (${summary.customerPhone})` : ""}
          </span>
          <span className={styles.meta}>Seller: {summary.sellerNames.join(", ")}</span>
        </div>
        <div className={styles.headerRight}>
          <StatusPill status={summary.status} />
          <span className={styles.total}>{formatCurrency(summary.total)}</span>
        </div>
      </div>

      {type === "marketplace" && marketplaceOrder && (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>Items</span>
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
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Subtotal</span>
              <span className={styles.fieldValue}>{formatCurrency(marketplaceOrder.subtotal)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Shipping</span>
              <span className={styles.fieldValue}>{formatCurrency(marketplaceOrder.shippingFee)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Wallet applied</span>
              <span className={styles.fieldValue}>{formatCurrency(marketplaceOrder.walletApplied)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Cashback earned</span>
              <span className={styles.fieldValue}>{formatCurrency(marketplaceOrder.cashbackEarned)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Payment method</span>
              <span className={styles.fieldValue}>{marketplaceOrder.paymentMethod}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Refund status</span>
              <span className={styles.fieldValue}>{marketplaceOrder.refundStatus}</span>
            </div>
          </div>
        </Card>
      )}

      {type === "laundry" && laundryBooking && (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>Lines</span>
          {laundryBooking.lines.map((line, index) => (
            <div key={`${line.serviceId}-${index}`} className={styles.itemRow}>
              <span className={styles.itemName}>{serviceName(line.serviceId)}</span>
              <span className={styles.itemPrice}>{formatCurrency(line.estimatedPrice)}</span>
            </div>
          ))}
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Pickup</span>
              <span className={styles.fieldValue}>{formatDate(laundryBooking.pickupSlot.date)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Delivery</span>
              <span className={styles.fieldValue}>{formatDate(laundryBooking.deliverySlot.date)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Payment method</span>
              <span className={styles.fieldValue}>{laundryBooking.paymentMethod}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Wallet cashback</span>
              <span className={styles.fieldValue}>{formatCurrency(laundryBooking.walletCashback ?? 0)}</span>
            </div>
          </div>
        </Card>
      )}

      {type === "snack" && snackOrder && (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>Items</span>
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
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Channel</span>
              <span className={styles.fieldValue}>{snackOrder.channel}</span>
            </div>
          </div>
        </Card>
      )}

      <Card className={styles.card}>
        <span className={styles.cardTitle}>Actions</span>

        {/* Routine first, destructive second. The status control records
            what happened; the refund below moves money. */}
        {statusOptions.length > 0 && (
          <div className={styles.statusOverride}>
            <span className={styles.fieldLabel}>Correct the status</span>
            <p className={styles.stubNote}>
              This records the status only — no money moves, and the buyer is told. To
              return money, use Issue refund below.
            </p>
            <div className={styles.statusRow}>
              {/* The global screen-reader class, not a local copy — a
                  re-implemented one that gets `display: none` wrong hides
                  the label from assistive tech too, and fails silently. */}
              <label className="hk-sr-only" htmlFor="status-override">
                New status
              </label>
              <select
                id="status-override"
                className={styles.statusSelect}
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
              </select>
              {/* Two-step inline, the pattern `ProductModerationRow`
                  established — not `window.confirm` (the money sentence
                  belongs in our own type) and not a modal (which would owe
                  the M16 focus contract for a one-line confirmation). */}
              {confirmingStatus ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApplyStatus}
                    disabled={savingStatus}
                  >
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
            {statusError && (
              <p className={styles.refundError} role="alert">
                {statusError}
              </p>
            )}
            {statusResult && !statusError && (
              <p className={styles.refundSuccess} role="status">
                {statusResult}
              </p>
            )}
          </div>
        )}

        {summary.customerUserId ? (
          <>
            <p className={styles.stubNote}>
              Refunding credits {summary.customerName}&rsquo;s wallet with the full order total and
              marks the order refunded, so it cannot be refunded twice — see{" "}
              <Link href={`/admin/wallet/${summary.customerUserId}`} className={styles.walletLink}>
                their full ledger
              </Link>
              . For a partial adjustment, use{" "}
              <Link href={`/admin/wallet/${summary.customerUserId}`} className={styles.walletLink}>
                their wallet
              </Link>{" "}
              instead, where the reason is recorded against the entry.
            </p>
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
              <Button variant="primary" size="sm" onClick={handleIssueRefund} disabled={refunding}>
                {refunding ? "Processing…" : "Issue refund"}
              </Button>
            </div>
            {refundError && (
              <p className={styles.refundError} role="alert">
                {refundError}
              </p>
            )}
            {refundResult && !refundError && (
              <p className={styles.refundSuccess} role="status">
                Refunded {formatCurrency(refundResult.amount)} to {summary.customerName}&rsquo;s
                wallet.
              </p>
            )}
          </>
        ) : (
          <p className={styles.stubNote}>
            {type === "snack"
              ? "Snack orders come in over WhatsApp with no registered account — there's no wallet to refund. Handle adjustments directly with the customer."
              : "This booking has no linked wallet, so there is nothing to refund from here. Handle adjustments directly with the customer."}
          </p>
        )}
      </Card>
    </div>
  );
}
