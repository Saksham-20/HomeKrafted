"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Banknote, CreditCard, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { SlotPicker } from "@/components/ui/SlotPicker";
import { PhotoUpload } from "@/components/ui/PhotoUpload";
import { Textarea } from "@/components/ui/Textarea";
import { Chip } from "@/components/ui/Chip";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { StickySummary, type StickySummaryLine } from "@/components/ui/StickySummary";
import { LaundryBookingConfirmation } from "./LaundryBookingConfirmation";
import { AppTrackingBand } from "./AppTrackingBand";
import {
  createBooking,
  createSubscription,
  getDefaultAddress,
  getWallet,
  type LaundrySubscriptionPlanOption,
} from "@/lib/api";
import { isMockMode } from "@/lib/api/http";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/lib/wallet/WalletContext";
import { computeCashback } from "@/lib/cart/pricing";
import { formatCurrency } from "@/lib/format";
import type {
  LaundryBooking,
  LaundryDay,
  LaundryHowItWorksStep,
  LaundryService,
  LaundrySlot,
  LaundrySubscriptionPlan,
  PaymentMethod,
} from "@/lib/types";
import styles from "./LaundryBookingClient.module.css";

export interface LaundryBookingClientProps {
  services: LaundryService[];
  days: LaundryDay[];
  slots: LaundrySlot[];
  steps: LaundryHowItWorksStep[];
  subscriptionPlans: LaundrySubscriptionPlanOption[];
}

/** Default estimate quantities per pricing model, matching the prototype's own sample estimate ("Wash & Fold (est. 4 kg)"). */
const DEFAULT_QTY = { "per-kg": 4, "per-item": 3, "per-hour": 2 } as const;
const MAX_QTY = { "per-kg": 30, "per-item": 20, "per-hour": 12 } as const;

/**
 * Laundry booking flow (M4) — ported from the prototype's Laundry screen
 * (`handoff/prototype/Homekrafted.dc.html`, `isLaundry` block: hero,
 * service picker, pickup slot, how-it-works, booking summary, app-
 * tracking band), extended with the pieces the prototype doesn't have
 * yet: a separate delivery `SlotPicker`, an item-count stepper +
 * `PhotoUpload` for the item-priced services, special instructions,
 * a recurring-subscription toggle, and wallet/COD/online payment. See
 * `CHANGELOG.md`'s M4 entry for the full port-fidelity note.
 */
export function LaundryBookingClient({
  services,
  days,
  slots,
  steps,
  subscriptionPlans,
}: LaundryBookingClientProps) {
  const mock = isMockMode();
  // Live wallet balance (M6) — every balance-sufficiency check reads this,
  // same reasoning as `CheckoutClient`.
  const { balance: walletBalance, pay, earnCashback, refresh: refreshWallet } = useWallet();
  const { ready: authReady, isSignedIn } = useAuth();

  // M8.4a: `wallet`/`addressId` used to be server-fetched props
  // (`app/laundry/page.tsx`) — both are owner-scoped real reads now, so
  // this component fetches them itself on mount instead (same reasoning
  // `OrdersListClient` established pre-M8.4 for session-scoped data; see
  // `lib/auth/session.ts`'s file header). `wallet` here only ever supplies
  // the static `payWithWalletDefault` preference — the live balance above
  // still comes from `useWallet()`.
  const [addressId, setAddressId] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const service = services.find((s) => s.id === serviceId);

  const [weightKg, setWeightKg] = useState<number>(DEFAULT_QTY["per-kg"]);
  const [itemCount, setItemCount] = useState<number>(DEFAULT_QTY["per-item"]);
  const [hours, setHours] = useState<number>(DEFAULT_QTY["per-hour"]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");

  const [pickupDayId, setPickupDayId] = useState(days[0]?.id ?? "");
  const [pickupSlotId, setPickupSlotId] = useState(slots[0]?.id ?? "");
  const [deliveryDayId, setDeliveryDayId] = useState(days[1]?.id ?? days[0]?.id ?? "");
  const [deliverySlotId, setDeliverySlotId] = useState(slots[1]?.id ?? slots[0]?.id ?? "");

  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<LaundrySubscriptionPlan>(
    subscriptionPlans[0]?.value ?? "weekly",
  );

  // Preference, not the effective method — see CheckoutClient's identical
  // pattern: the effective `paymentMethod` (below) falls back to Razorpay
  // whenever the wallet can't cover the estimate, so a service/qty change
  // that grows the total after mount can never leave a disabled-but-
  // still-"selected" wallet tile silently under-billing. Starts
  // `"razorpay"` and is seeded once from the fetched wallet's
  // `payWithWalletDefault` the moment it loads (see the effect below) —
  // `walletSufficient` still gates the *effective* payment method against
  // the live balance on every render regardless.
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod>("razorpay");

  // Both of these are owner-scoped reads (`GET /wallet`,
  // `GET /users/me/addresses`), so they only make sense for a signed-in
  // consumer. Firing them unconditionally made a signed-out visitor's
  // first paint of `/laundry` throw two unhandled `401`s into the console;
  // the booking form itself renders fine either way, and a signed-out
  // visitor picks their address at sign-in instead.
  useEffect(() => {
    if (!authReady || !isSignedIn) return;
    let cancelled = false;
    Promise.all([getWallet(), getDefaultAddress()])
      .then(([w, address]) => {
        if (cancelled) return;
        setAddressId(address.id);
        if (w.payWithWalletDefault && w.balance > 0) setPreferredPaymentMethod("wallet");
      })
      .catch(() => {
        // Non-fatal: keep the form's defaults rather than blocking booking.
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, isSignedIn]);

  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [booking, setBooking] = useState<LaundryBooking | null>(null);

  const pickupDay = days.find((d) => d.id === pickupDayId);
  const pickupSlot = slots.find((s) => s.id === pickupSlotId);
  const deliveryDay = days.find((d) => d.id === deliveryDayId);
  const deliverySlot = slots.find((s) => s.id === deliverySlotId);

  const qty =
    service?.pricingModel === "per-kg"
      ? weightKg
      : service?.pricingModel === "per-item"
        ? itemCount
        : hours;

  const estimatedTotal = Math.round((service?.price ?? 0) * qty);
  const cashback = computeCashback(estimatedTotal);
  const walletSufficient = walletBalance >= estimatedTotal;
  const paymentMethod: PaymentMethod =
    preferredPaymentMethod === "wallet" && !walletSufficient ? "razorpay" : preferredPaymentMethod;

  function setQty(value: number) {
    if (service?.pricingModel === "per-kg") setWeightKg(value);
    else if (service?.pricingModel === "per-item") setItemCount(value);
    else setHours(value);
  }

  function selectService(id: string) {
    setServiceId(id);
  }

  function bookAnother() {
    setBooking(null);
    setPhotos([]);
    setSpecialInstructions("");
    setFormError(null);
  }

  async function handleConfirm() {
    setFormError(null);
    if (!service || !pickupDay || !pickupSlot || !deliveryDay || !deliverySlot || !addressId) return;

    if (deliveryDay.isoDate < pickupDay.isoDate) {
      setFormError("Delivery date can't be before the pickup date.");
      return;
    }

    setPlacing(true);

    let subscriptionId: string | undefined;
    if (subscriptionEnabled) {
      const subscription = await createSubscription({
        serviceId: service.id,
        plan: subscriptionPlan,
        slot: { day: pickupDay.day, slotId: pickupSlot.id },
        nextPickup: pickupDay.isoDate,
      });
      subscriptionId = subscription.id;
    }

    const created = await createBooking({
      serviceId: service.id,
      estimatedWeightKg: service.pricingModel === "per-kg" ? weightKg : undefined,
      itemCount: service.pricingModel === "per-item" ? itemCount : undefined,
      estimatedHours: service.pricingModel === "per-hour" ? hours : undefined,
      unitPrice: service.price,
      pickupSlot: { date: pickupDay.isoDate, slotId: pickupSlot.id },
      deliverySlot: { date: deliveryDay.isoDate, slotId: deliverySlot.id },
      addressId,
      photos,
      specialInstructions: specialInstructions.trim() || undefined,
      subscriptionId,
      paymentMethod,
    });

    if (paymentMethod === "wallet") {
      if (mock) {
        // M6 mock behavior: the mock `createBooking` doesn't touch the
        // wallet itself, so this client-side call was the only debit.
        const result = await pay(created.estimatedTotal, {
          title: `Paid — ${service.name} (Booking #${created.bookingNumber})`,
          refType: "laundryBooking",
          refId: created.bookingNumber,
        });
        if (!result.ok) {
          setFormError(
            "Your wallet balance changed before this booking could be charged — please choose another payment method.",
          );
          setPlacing(false);
          return;
        }
        if (created.walletCashback) {
          earnCashback(created.walletCashback, {
            title: `Cashback — Booking #${created.bookingNumber}`,
            refType: "laundryBooking",
            refId: created.bookingNumber,
          });
        }
      } else {
        // M8.4a real mode: `POST /laundry/bookings` already debited the
        // wallet + credited cashback atomically server-side (see
        // `lib/api/laundry.ts#createBooking`'s doc comment) — just
        // refresh the balance/ledger the header chip and Wallet screen
        // read from.
        refreshWallet();
      }
    }

    setBooking(created);
    setPlacing(false);
  }

  if (booking) {
    return (
      <>
        <section className={clsx("container", styles.confirmSection)}>
          <LaundryBookingConfirmation
            booking={booking}
            service={service}
            days={days}
            slots={slots}
            onBookAnother={bookAnother}
          />
        </section>
        <section className={clsx("container", styles.bandSection)}>
          <AppTrackingBand />
        </section>
      </>
    );
  }

  const qtyStepLabel =
    service?.pricingModel === "per-item"
      ? "Item count & photos"
      : service?.pricingModel === "per-hour"
        ? "Estimated hours"
        : "Estimated weight";

  const summaryLines: StickySummaryLine[] = [
    {
      label: `${service?.name ?? "Service"} (est. ${qty} ${service?.unitLabel ?? ""})`,
      value: formatCurrency(estimatedTotal),
    },
    {
      label: "Pickup",
      value: pickupDay && pickupSlot ? `${pickupDay.day}, ${pickupSlot.label}` : "—",
    },
    {
      label: "Delivery",
      value: deliveryDay && deliverySlot ? `${deliveryDay.day}, ${deliverySlot.label}` : "—",
    },
  ];
  if (subscriptionEnabled) {
    summaryLines.push({
      label: "Subscription",
      value: subscriptionPlans.find((p) => p.value === subscriptionPlan)?.label ?? "",
    });
  }
  summaryLines.push({
    label: "Estimated total",
    value: formatCurrency(estimatedTotal),
    emphasis: true,
  });

  return (
    <>
      <section className={styles.hero}>
        <div className={clsx("container", styles.heroInner)}>
          <span className={styles.eyebrow}>Laundry &amp; Cleaning · Book online</span>
          <h1 className={styles.title}>
            Fresh laundry,
            <br />
            picked up from your door.
          </h1>
          <p className={styles.subtitle}>
            Wash &amp; fold, dry-clean, steam-ironing and home deep-cleaning. Free pickup &amp;
            delivery, transparent per-kg pricing, and wallet-accepted checkout.
          </p>
        </div>
      </section>

      <section className={clsx("container", styles.servicesSection)}>
        <div className={styles.eyebrowLabel}>Choose a service</div>
        <div className={styles.serviceGrid}>
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              selected={s.id === serviceId}
              onSelect={() => selectService(s.id)}
            />
          ))}
        </div>
      </section>

      <section className={clsx("container", styles.layout)}>
        <div className={styles.main}>
          <div className={styles.block}>
            <div className={styles.eyebrowLabel}>Pickup slot</div>
            <SlotPicker
              variant="day"
              columns={4}
              options={days.map((d) => ({ id: d.id, primary: d.day, secondary: d.date }))}
              value={pickupDayId}
              onChange={setPickupDayId}
              className={styles.spacer}
            />
            <SlotPicker
              variant="slot"
              columns={3}
              options={slots.map((s) => ({ id: s.id, primary: s.label }))}
              value={pickupSlotId}
              onChange={setPickupSlotId}
            />
          </div>

          <div className={styles.block}>
            <div className={styles.eyebrowLabel}>Delivery slot</div>
            <SlotPicker
              variant="day"
              columns={4}
              options={days.map((d) => ({ id: d.id, primary: d.day, secondary: d.date }))}
              value={deliveryDayId}
              onChange={setDeliveryDayId}
              className={styles.spacer}
            />
            <SlotPicker
              variant="slot"
              columns={3}
              options={slots.map((s) => ({ id: s.id, primary: s.label }))}
              value={deliverySlotId}
              onChange={setDeliverySlotId}
            />
          </div>

          <div className={styles.block}>
            <div className={styles.eyebrowLabel}>{qtyStepLabel}</div>
            <div className={styles.qtyRow}>
              <QuantityStepper
                value={qty}
                min={1}
                max={service ? MAX_QTY[service.pricingModel] : 30}
                onChange={setQty}
                aria-label={qtyStepLabel}
              />
              <span className={styles.qtyUnit}>{service?.unitLabel}</span>
            </div>
            {service?.pricingModel === "per-item" && (
              <PhotoUpload
                photos={photos}
                onChange={setPhotos}
                purpose="laundry"
                label="Add photo"
                className={styles.photoUpload}
              />
            )}
          </div>

          <div className={styles.block}>
            <Textarea
              label="Special instructions"
              placeholder="Any handling notes for our team…"
              value={specialInstructions}
              onChange={(event) => setSpecialInstructions(event.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.block}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={subscriptionEnabled}
                onChange={(event) => setSubscriptionEnabled(event.target.checked)}
              />
              <span>
                <span className={styles.blockTitle}>Make this a recurring pickup</span>
                <span className={styles.blockHint}>
                  Automatic pickups on a schedule — pause or cancel any time.
                </span>
              </span>
            </label>
            {subscriptionEnabled && (
              <div className={styles.chipRow}>
                {subscriptionPlans.map((plan) => (
                  <Chip
                    key={plan.value}
                    label={plan.label}
                    selected={subscriptionPlan === plan.value}
                    onClick={() => setSubscriptionPlan(plan.value)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={styles.block}>
            <span className={styles.blockTitle}>Payment</span>
            <div className={styles.paymentOptions}>
              <button
                type="button"
                className={clsx(
                  styles.paymentTile,
                  paymentMethod === "wallet" && styles.paymentTileSelected,
                )}
                disabled={!walletSufficient}
                onClick={() => setPreferredPaymentMethod("wallet")}
                aria-pressed={paymentMethod === "wallet"}
              >
                <WalletIcon size={20} strokeWidth={1.6} />
                <span className={styles.paymentTileBody}>
                  <span className={styles.paymentTileTitle}>Wallet</span>
                  <span className={styles.paymentTileHint}>
                    {walletSufficient
                      ? `Balance ${formatCurrency(walletBalance)} · earn ${formatCurrency(cashback)} cashback`
                      : `Balance ${formatCurrency(walletBalance)} — insufficient for this estimate`}
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={clsx(
                  styles.paymentTile,
                  paymentMethod === "razorpay" && styles.paymentTileSelected,
                )}
                onClick={() => setPreferredPaymentMethod("razorpay")}
                aria-pressed={paymentMethod === "razorpay"}
              >
                <CreditCard size={20} strokeWidth={1.6} />
                <span className={styles.paymentTileBody}>
                  <span className={styles.paymentTileTitle}>Card / UPI (Razorpay)</span>
                  <span className={styles.paymentTileHint}>
                    Real payment integration lands in M8 — this is a stub.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={clsx(
                  styles.paymentTile,
                  paymentMethod === "cod" && styles.paymentTileSelected,
                )}
                onClick={() => setPreferredPaymentMethod("cod")}
                aria-pressed={paymentMethod === "cod"}
              >
                <Banknote size={20} strokeWidth={1.6} />
                <span className={styles.paymentTileBody}>
                  <span className={styles.paymentTileTitle}>Cash on delivery</span>
                  <span className={styles.paymentTileHint}>
                    Pay in cash when your laundry is delivered back.
                  </span>
                </span>
              </button>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.eyebrowLabel}>How it works</div>
            <div className={styles.stepsGrid}>
              {steps.map((step) => (
                <div key={step.n} className={styles.stepTile}>
                  <span className={styles.stepN}>{step.n}</span>
                  <div className={styles.stepLabel}>{step.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className={styles.aside}>
          <StickySummary
            title="Booking summary"
            stickyOnMobile
            lines={summaryLines}
            cashbackLabel={
              paymentMethod === "wallet"
                ? `Pay with wallet · earn ${formatCurrency(cashback)} cashback`
                : `Earn ${formatCurrency(cashback)} wallet cashback on this booking`
            }
            footnote="Final price weighed at pickup"
          >
            <Button variant="primary" onClick={handleConfirm} disabled={placing || !addressId}>
              {placing ? "Confirming…" : "Confirm pickup →"}
            </Button>
          </StickySummary>
          {formError && <p className={styles.formError}>{formError}</p>}
        </aside>
      </section>

      <section className={clsx("container", styles.bandSection)}>
        <AppTrackingBand />
      </section>
    </>
  );
}
