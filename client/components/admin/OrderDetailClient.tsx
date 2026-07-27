"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getAdminLaundryBooking,
  getAdminMarketplaceOrder,
  getAdminOrderById,
  getAdminSnackOrder,
  getLaundryServices,
  issueRefund,
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
 * `/admin/orders/[type]/[id]` (M11a) — full read-only detail for one
 * unified order row, branching on `type` to pull the real `Order` /
 * `LaundryBooking` / `SnackOrder` record for its line items (the list
 * summary is deliberately thin — see `AdminOrderSummary`'s doc comment).
 *
 * **Full visibility, stubbed action** — per the M11a brief, refund/status
 * override controls are explicitly M11b scope. The disabled button below
 * communicates that boundary rather than silently omitting any action
 * affordance.
 */
export function OrderDetailClient({ type, id }: OrderDetailClientProps) {
  const { ready, role } = useAuth();
  const [summary, setSummary] = useState<AdminOrderSummary | null | undefined>(undefined);
  const [marketplaceOrder, setMarketplaceOrder] = useState<Order | undefined>(undefined);
  const [laundryBooking, setLaundryBooking] = useState<LaundryBooking | undefined>(undefined);
  const [snackOrder, setSnackOrder] = useState<SnackOrder | undefined>(undefined);
  const [laundryServices, setLaundryServices] = useState<LaundryService[]>([]);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundResult, setRefundResult] = useState<{ amount: number; balanceAfter: number } | undefined>(undefined);
  const [refundError, setRefundError] = useState<string | undefined>(undefined);
  const [refunding, setRefunding] = useState(false);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const found = await getAdminOrderById(type, id);
      if (cancelled) return;
      setSummary(found ?? null);
      if (!found) return;
      setRefundAmount(String(found.total));

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

  async function handleIssueRefund() {
    if (!summary?.customerUserId) return;
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) {
      setRefundError("Enter a refund amount greater than 0.");
      return;
    }
    setRefundError(undefined);
    setRefunding(true);
    const txn = await issueRefund({
      userId: summary.customerUserId,
      amount,
      title: `Refund — Order #${summary.reference}`,
      refType: type === "marketplace" ? "order" : "laundryBooking",
      refId: summary.reference,
    });
    setRefunding(false);
    if (!txn) {
      setRefundError("Couldn't issue that refund.");
      return;
    }
    setRefundResult({ amount, balanceAfter: txn.balanceAfter });
  }

  if (!ready || summary === undefined) {
    return <div className={styles.loading}>Loading order…</div>;
  }

  if (summary === null) {
    return (
      <div>
        <Link href="/admin/orders" className={styles.back}>
          <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          Back to orders
        </Link>
        <Card className={styles.notFound}>Order not found.</Card>
      </div>
    );
  }

  function serviceName(serviceId: string): string {
    return laundryServices.find((s) => s.id === serviceId)?.name ?? serviceId;
  }

  return (
    <div>
      <Link href="/admin/orders" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to orders
      </Link>

      <div className={styles.header}>
        <div className={styles.headerBody}>
          <span className={styles.reference}>#{summary.reference}</span>
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
        {summary.customerUserId ? (
          <>
            <p className={styles.stubNote}>
              Issuing a refund credits {summary.customerName}&rsquo;s wallet with a
              <code> category: &quot;refund&quot;</code> ledger entry — see{" "}
              <Link href={`/admin/wallet/${summary.customerUserId}`} className={styles.walletLink}>
                their full ledger
              </Link>
              .
            </p>
            <div className={styles.refundRow}>
              <label className={styles.refundField}>
                <span className={styles.fieldLabel}>Refund amount (₹)</span>
                <input
                  className={styles.refundInput}
                  type="number"
                  min={1}
                  value={refundAmount}
                  onChange={(event) => setRefundAmount(event.target.value)}
                />
              </label>
              <Button variant="primary" size="sm" onClick={handleIssueRefund} disabled={refunding}>
                {refunding ? "Processing…" : "Issue refund"}
              </Button>
            </div>
            {refundError && <p className={styles.refundError}>{refundError}</p>}
            {refundResult && !refundError && (
              <p className={styles.refundSuccess}>
                Refunded {formatCurrency(refundResult.amount)} — new wallet balance{" "}
                {formatCurrency(refundResult.balanceAfter)}.
              </p>
            )}
            <p className={styles.stubNote}>Status overrides are still M8 scope — this needs a real, audited fulfillment write.</p>
          </>
        ) : (
          <p className={styles.stubNote}>
            {type === "snack"
              ? "Snack orders come in over WhatsApp with no registered account — there's no wallet to refund. Handle adjustments directly with the customer."
              : "Status overrides land with M8's real order-fulfillment writes."}
          </p>
        )}
      </Card>
    </div>
  );
}
