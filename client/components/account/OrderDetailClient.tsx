"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusTimeline } from "@/components/ui/StatusTimeline";
import { AppTrackingBand } from "@/components/laundry/AppTrackingBand";
import {
  getAddressById,
  getLaundryServices,
  getLaundrySlots,
  getOrderHistoryEntry,
  type OrderHistoryEntry,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Address, LaundryService, LaundrySlot } from "@/lib/types";
import styles from "./OrderDetailClient.module.css";

export interface OrderDetailClientProps {
  id: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  wallet: "Paid from wallet",
  razorpay: "Card / UPI",
  cod: "Cash on delivery",
};

/**
 * Order/booking detail (M7a) — basic status stepper (no live tracking,
 * per `lib/channel.ts`), item/service summary, address and payment. Fetches
 * client-side on mount (see `OrderDetailPage`'s comment on why) via
 * `getOrderHistoryEntry(id)`, which itself covers both seeded and this-
 * session-live orders/bookings.
 */
export function OrderDetailClient({ id }: OrderDetailClientProps) {
  const [entry, setEntry] = useState<OrderHistoryEntry | null | undefined>(undefined);
  const [addresses, setAddresses] = useState<Record<string, Address>>({});
  const [laundrySlots, setLaundrySlots] = useState<LaundrySlot[]>([]);
  const [laundryServices, setLaundryServices] = useState<LaundryService[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getOrderHistoryEntry(id), getLaundrySlots(), getLaundryServices()]).then(
      async ([found, slots, services]) => {
        if (cancelled) return;
        setEntry(found ?? null);
        setLaundrySlots(slots);
        setLaundryServices(services);

        const addressIds = new Set<string>();
        if (found?.order) {
          for (const addrId of found.order.shippingAddressIds) addressIds.add(addrId);
        }
        if (found?.booking) addressIds.add(found.booking.addressId);

        const resolved: Record<string, Address> = {};
        await Promise.all(
          Array.from(addressIds).map(async (addrId) => {
            const address = await getAddressById(addrId);
            if (address) resolved[addrId] = address;
          }),
        );
        if (!cancelled) setAddresses(resolved);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (entry === undefined) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading…</p>
      </div>
    );
  }

  if (entry === null) {
    return (
      <div className={styles.wrap}>
        <Link href="/account/orders" className={styles.backLink}>
          <ArrowLeft size={15} strokeWidth={1.8} /> Back to orders
        </Link>
        <Card className={styles.notFound}>
          <p className={styles.emptyTitle}>We couldn&rsquo;t find that order</p>
          <p className={styles.emptyCopy}>
            It may have been from an older session. Check your full list on the Orders page.
          </p>
        </Card>
      </div>
    );
  }

  const { order, booking } = entry;

  return (
    <div className={styles.wrap}>
      <Link href="/account/orders" className={styles.backLink}>
        <ArrowLeft size={15} strokeWidth={1.8} /> Back to orders
      </Link>

      <div className={styles.header}>
        <span className={styles.eyebrow}>
          {entry.kind === "laundry" ? "Laundry booking" : "Marketplace order"}
        </span>
        <h1 className={styles.title}>#{entry.number}</h1>
        <p className={styles.subtitle}>{formatDate(entry.date, { day: "2-digit", month: "long", year: "numeric" })}</p>
      </div>

      <Card className={styles.statusCard}>
        <StatusTimeline orientation="horizontal" steps={entry.steps} />
      </Card>

      {/* Delivery is the only moment a review can be written (the server
          requires a delivered order), and until M15 nothing in the app
          said so — every rating on the site was seed data. */}
      {order?.status === "delivered" && (
        <Card className={styles.actionsCard}>
          <div className={styles.actionsText}>
            <span className={styles.cardTitle}>How was it?</span>
            <p className={styles.actionsBody}>
              Your review is what the next buyer reads before trusting a home kitchen.
            </p>
          </div>
          <Link href="/account/reviews" className={styles.actionLink}>
            Review these items
          </Link>
        </Card>
      )}

      {order && (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>Items</span>
          <div className={styles.itemRows}>
            {order.items.map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <span>
                  {item.name} × {item.quantity}
                  {item.giftWrap ? " · gift wrapped" : ""}
                </span>
                <span>{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className={styles.totals}>
            <div className={styles.itemRow}>
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className={styles.itemRow}>
              <span>Shipping</span>
              <span>{order.shippingFee === 0 ? "Free" : formatCurrency(order.shippingFee)}</span>
            </div>
            {order.walletApplied > 0 && (
              <div className={styles.itemRow}>
                <span>Paid from wallet</span>
                <span>− {formatCurrency(order.walletApplied)}</span>
              </div>
            )}
            <div className={styles.totalRow}>
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
          {order.cashbackEarned > 0 && (
            <p className={styles.cashback}>
              {order.status === "delivered"
                ? `Earned ${formatCurrency(order.cashbackEarned)} wallet cashback`
                : `Earn ${formatCurrency(order.cashbackEarned)} wallet cashback on this order`}
            </p>
          )}
          {order.refundStatus !== "none" && (
            <p className={styles.refundNote}>Refund status: {order.refundStatus}</p>
          )}
        </Card>
      )}

      {order && (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>Shipping &amp; payment</span>
          <div className={styles.itemRows}>
            {order.shippingAddressIds.map((addrId) => {
              const address = addresses[addrId];
              return (
                <div key={addrId} className={styles.addressRow}>
                  {address ? (
                    <>
                      <span className={styles.addressLabel}>{address.label}</span>
                      <span className={styles.addressLine}>
                        {address.recipientName} · {address.line1}, {address.city} {address.pincode}
                      </span>
                    </>
                  ) : (
                    <span className={styles.addressLine}>Gift recipient address</span>
                  )}
                </div>
              );
            })}
            <div className={styles.itemRow}>
              <span>Payment</span>
              <span>{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</span>
            </div>
          </div>
        </Card>
      )}

      {booking && (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>Booking details</span>
          <div className={styles.itemRows}>
            {booking.lines.map((line, index) => {
              const service = laundryServices.find((s) => s.id === line.serviceId);
              const qty = line.estimatedWeightKg ?? line.itemCount ?? line.estimatedHours ?? 0;
              return (
                <div key={index} className={styles.itemRow}>
                  <span>
                    {service?.name ?? "Service"} (est. {qty} {service?.unitLabel})
                  </span>
                  <span>{formatCurrency(line.estimatedPrice)}</span>
                </div>
              );
            })}
            <div className={styles.itemRow}>
              <span>Pickup</span>
              <span>
                {formatDate(booking.pickupSlot.date)} ·{" "}
                {laundrySlots.find((s) => s.id === booking.pickupSlot.slotId)?.label ?? ""}
              </span>
            </div>
            <div className={styles.itemRow}>
              <span>Delivery</span>
              <span>
                {formatDate(booking.deliverySlot.date)} ·{" "}
                {laundrySlots.find((s) => s.id === booking.deliverySlot.slotId)?.label ?? ""}
              </span>
            </div>
            {addresses[booking.addressId] && (
              <div className={styles.addressRow}>
                <span className={styles.addressLabel}>{addresses[booking.addressId].label}</span>
                <span className={styles.addressLine}>
                  {addresses[booking.addressId].recipientName} ·{" "}
                  {addresses[booking.addressId].line1}, {addresses[booking.addressId].city}
                </span>
              </div>
            )}
            <div className={styles.itemRow}>
              <span>Payment</span>
              <span>{PAYMENT_LABEL[booking.paymentMethod] ?? booking.paymentMethod}</span>
            </div>
          </div>
          <div className={styles.totalRow}>
            <span>Estimated total</span>
            <span>{formatCurrency(booking.estimatedTotal)}</span>
          </div>
          {booking.walletCashback !== undefined && (
            <p className={styles.cashback}>
              {booking.status === "delivered"
                ? `Earned ${formatCurrency(booking.walletCashback)} wallet cashback`
                : `Earn ${formatCurrency(booking.walletCashback)} wallet cashback on this booking`}
            </p>
          )}
        </Card>
      )}

      {booking && booking.status !== "cancelled" && (
        <AppTrackingBand />
      )}
    </div>
  );
}
