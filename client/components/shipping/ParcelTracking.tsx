"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Package, Phone, Truck } from "lucide-react";
import type { Consignment, ConsignmentStatus } from "@/lib/types/shipping";
import { formatDate } from "@/lib/format";
import styles from "./ParcelTracking.module.css";

/**
 * What a parcel's state is called on a buyer's or a HomeKrafter's screen.
 *
 * Deliberately not the carrier's own words. `recd_at_fwd_dc` is
 * warehouse vocabulary, and every label here has to be true of a candle as
 * well as a curry — one pipeline carries food and craft since M20, so
 * nothing here says "still warm" (the `lib/kitchen-copy.ts` rule).
 *
 * The three states a buyer should never be shown as a courier fact are
 * absent by omission rather than by a fallback: `pending` and `failed` are
 * a booking that has not happened, and telling somebody waiting for food
 * that "the carrier refused this parcel" reads as the order being broken
 * when the kitchen will simply bring it over itself.
 */
const LABEL: Record<ConsignmentStatus, string | null> = {
  pending: null,
  failed: null,
  booked: "A rider has been booked",
  "out-for-pickup": "The rider is on the way to the kitchen",
  picked: "Collected from the kitchen",
  "in-transit": "On its way to you",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  exception: "Delayed — we're on it",
  returned: "On its way back to the kitchen",
  cancelled: "This delivery was called off",
};

const STEPS: ConsignmentStatus[] = ["booked", "out-for-pickup", "picked", "in-transit", "out-for-delivery", "delivered"];

function stepIndex(status: ConsignmentStatus): number {
  const i = STEPS.indexOf(status);
  // `exception` is a live parcel that has hit a snag, so it keeps the
  // progress it had rather than dropping to the start of the rail.
  return i >= 0 ? i : status === "exception" ? STEPS.indexOf("in-transit") : -1;
}

export interface ParcelTrackingProps {
  load: () => Promise<Consignment[]>;
  /** A HomeKrafter needs the waybill to write on the box; a buyer does not. */
  showWaybill?: boolean;
  heading?: string;
}

/**
 * The parcel panel, shared by the buyer's order detail and the
 * HomeKrafter's.
 *
 * Renders **nothing at all** when there is no live parcel — most orders on
 * this platform have none, and an empty "Delivery" card on every order
 * page would be a section that exists to say a feature is off.
 */
export function ParcelTracking({ load, showWaybill = false, heading = "Delivery" }: ParcelTrackingProps) {
  const [parcels, setParcels] = useState<Consignment[] | null>(null);

  useEffect(() => {
    let alive = true;
    load()
      .then((rows) => alive && setParcels(rows))
      // A failure here is not the buyer's problem and must not replace
      // the order they came to look at. The panel simply does not appear.
      .catch(() => alive && setParcels([]));
    return () => {
      alive = false;
    };
  }, [load]);

  const live = (parcels ?? []).filter((p) => LABEL[p.status] !== null);
  if (!live.length) return null;

  return (
    <section className={styles.wrap} aria-labelledby="hk-parcels-heading">
      <h2 className={styles.heading} id="hk-parcels-heading">
        {heading}
      </h2>
      {live.map((parcel) => {
        const at = stepIndex(parcel.status);
        return (
          <div className={styles.parcel} key={parcel.id}>
            <p className={styles.status}>
              <Truck aria-hidden size={16} /> {LABEL[parcel.status]}
              {parcel.vendor ? <span className={styles.vendor}> · from {parcel.vendor.name}</span> : null}
            </p>

            <ol className={styles.rail} aria-label="Delivery progress">
              {STEPS.map((step, i) => (
                <li
                  className={styles.step}
                  key={step}
                  data-done={i <= at ? "true" : undefined}
                  // The rail is decorative: the sentence above already
                  // states where the parcel is, and reading six steps
                  // aloud to get to it is worse than not having it.
                  aria-hidden
                />
              ))}
            </ol>

            {parcel.riderName ? (
              <p className={styles.rider}>
                <Package aria-hidden size={15} /> {parcel.riderName}
                {parcel.riderContact ? (
                  <>
                    {" · "}
                    <a className={styles.phone} href={`tel:${parcel.riderContact}`}>
                      <Phone aria-hidden size={13} /> {parcel.riderContact}
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}

            {showWaybill && parcel.awbNumber ? (
              <p className={styles.meta}>
                Waybill <span className={styles.awb}>{parcel.awbNumber}</span> — write this on the parcel.
              </p>
            ) : null}

            {/* The carrier's own live page — the only real-time view that
                exists, since their API carries no rider coordinates. Shown
                only when Shadowfax has minted one, which is never in
                staging and not until a parcel is moving. */}
            {parcel.trackingUrl && parcel.status !== "delivered" ? (
              <p className={styles.meta}>
                <a
                  className={styles.track}
                  href={parcel.trackingUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Track this parcel <ExternalLink aria-hidden size={13} />
                </a>
              </p>
            ) : null}

            {parcel.deliveredAt ? (
              <p className={styles.meta}>Delivered {formatDate(parcel.deliveredAt)}</p>
            ) : parcel.currentLocation ? (
              <p className={styles.meta}>Last seen at {parcel.currentLocation}</p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
