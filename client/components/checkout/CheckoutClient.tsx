"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Wallet as WalletIcon, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StickySummary, type StickySummaryLine } from "@/components/ui/StickySummary";
import { DeliveryLocationConfirm } from "./DeliveryLocationConfirm";
import { SlotPicker } from "@/components/ui/SlotPicker";
import { Textarea } from "@/components/ui/Textarea";
import { AddressForm, EMPTY_ADDRESS_FORM, type AddressFormValues } from "./AddressForm";
import { OrderConfirmation } from "./OrderConfirmation";
import { useCart } from "@/lib/cart/CartContext";
import { useWallet } from "@/lib/wallet/WalletContext";
import { computeCashback, computeShipping, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/pricing";
import {
  createAddress,
  createOrder,
  createRazorpayOrder,
  getAddresses,
  getOrder,
  apiErrorMessage,
  getPaymentsConfig,
  getWallet,
  type CreateOrderLineInput,
} from "@/lib/api";
import { isMockMode } from "@/lib/api/http";
import { openRazorpayCheckout } from "@/lib/payments/razorpay";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatCurrency } from "@/lib/format";
import { CHECKOUT_LOADING, kitchenLoading } from "@/lib/kitchen-copy";
import type { DeliveryDateOption } from "@/lib/data";
import {
  clearGiftIntent,
  hasGiftIntent,
  readGiftIntent,
} from "@/lib/gift/gift-intent";
import type { Address, Order, OrderGift, OrderShipment, PaymentMethod } from "@/lib/types";
import styles from "./CheckoutClient.module.css";

export interface CheckoutClientProps {
  deliveryDateOptions: DeliveryDateOption[];
}

/** Mock mode only — synthetic address id for a gift-to-recipient order. Real mode saves the recipient as a real `Address` first (see `handlePlaceOrder`) since `docs/API.md` requires `gift.recipientAddressId` to be one of the caller's own saved addresses. */
const MOCK_GIFT_ADDRESS_ID = "gift-recipient";
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "rzp_test_placeholder";

/**
 * Checkout (M3; real as of M8.4a) — the full Marketplace checkout: multi-
 * address split with a per-address delivery date, gift-to-recipient (hide
 * price), and wallet/Razorpay/COD payment. Gift-to-recipient ships the
 * *entire* order to one recipient rather than being combined with
 * per-item multi-address splitting — simpler mental model, and it's how
 * gifting actually works; flag this decision for Opus if a mixed "some
 * items to me, one to a gift recipient" flow turns out to be wanted
 * later.
 *
 * M8.4a: `initialAddresses`/`wallet` used to be server-fetched props
 * (`app/checkout/page.tsx`) — both are owner-scoped real reads now, so
 * this component fetches them itself on mount instead (same reasoning as
 * `LaundryBookingClient`).
 */
export function CheckoutClient({ deliveryDateOptions }: CheckoutClientProps) {
  const mock = isMockMode();
  const router = useRouter();
  const { user } = useAuth();
  const { items, ready, lineInfo, subtotal, assignAddress, clear } = useCart();
  // Live wallet balance (M6) — every balance-sufficiency check reads this
  // instead of a static prop, so a top-up/payment made in another tab/
  // screen this session is reflected immediately.
  const { balance: walletBalance, pay, earnCashback } = useWallet();

  const [addressList, setAddressList] = useState<Address[]>([]);
  const [accountReady, setAccountReady] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [isGift, setIsGift] = useState(false);
  const [recipient, setRecipient] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [hidePrice, setHidePrice] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftDateId, setGiftDateId] = useState(deliveryDateOptions[0]?.id ?? "");
  /**
   * The two asks the product page's gift block can make that this screen
   * had no control for (see `lib/gift/gift-intent.ts`).
   *
   * `giftWrap` is the one that was missing outright: `CartItem.giftWrap`
   * and `OrderItem.giftWrap` are real columns, both order screens already
   * print "· gift wrapped", and **nothing anywhere ever set them** — the
   * product page advertised wrap "at checkout" and checkout never asked.
   *
   * `wantsCard` only decides whether the message box is on screen. A
   * handwritten card belongs on an order the buyer keeps and hands over
   * as much as on one posted to somebody else, which is why the box is no
   * longer nested inside "ship to someone else".
   */
  const [giftWrap, setGiftWrap] = useState(false);
  const [wantsCard, setWantsCard] = useState(false);

  const [dateByAddress, setDateByAddress] = useState<Record<string, string>>({});
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod>("razorpay");
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  /** Flipped synchronously on submit — see `handlePlaceOrder`. */
  const submittingRef = useRef(false);
  /**
   * One key for this checkout attempt, so a retry returns the order the
   * first attempt created rather than creating a second one. Stable for
   * the life of the mounted screen: a failed attempt (insufficient
   * balance, a dismissed payment) legitimately retries under the same key,
   * and the server does not consume a key whose work threw. A genuinely
   * new purchase means a new mount, and therefore a new key.
   */
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  // `undefined` until the server answers, so no tile is offered on a guess.
  const [cardPayments, setCardPayments] = useState<boolean | undefined>(undefined);

  /**
   * Pick up what the buyer asked for on the product page and then forget
   * it, so a gift bought on Tuesday does not pre-tick this screen on
   * Thursday's order for oneself. Runs once, before anything is typed
   * here — it never overwrites a choice made on this screen.
   */
  useEffect(() => {
    // Deferred a tick, the same technique `LocationContext` and
    // `WalletContext` use to hydrate from browser storage: a synchronous
    // setState in an effect body is `react-hooks/set-state-in-effect`.
    // It cannot be read during render either — this is a Client Component
    // but it still server-renders, and `sessionStorage` does not exist
    // there (React #418, the M12 lesson).
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const intent = readGiftIntent();
      if (!hasGiftIntent(intent)) return;
      setIsGift(intent.shipToRecipient);
      setGiftWrap(intent.wrap);
      setWantsCard(intent.messageCard);
      if (intent.message) setGiftMessage(intent.message);
      clearGiftIntent();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAddresses(), getWallet(), getPaymentsConfig()]).then(
      ([addresses, w, payments]) => {
        if (cancelled) return;
        setAddressList(addresses);
        if (w.payWithWalletDefault && w.balance > 0) setPreferredPaymentMethod("wallet");
        setCardPayments(payments.cardPaymentsEnabled);
        setAccountReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultAddress = addressList.find((a) => a.isDefault) ?? addressList[0];

  // Default every not-yet-assigned cart line to the account's default
  // address — this is what makes the multi-address split start from a
  // sane place (everything ships to "Home" until reassigned).
  useEffect(() => {
    if (!ready || !accountReady || isGift || !defaultAddress) return;
    for (const item of items) {
      if (!item.addressId) assignAddress(item.id, defaultAddress.id);
    }
  }, [ready, accountReady, isGift, items, defaultAddress, assignAddress]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.addressId ?? defaultAddress?.id ?? "";
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items, defaultAddress]);

  const shipping = computeShipping(subtotal);
  const cashback = computeCashback(subtotal);
  const total = subtotal + shipping;
  const walletSufficient = walletBalance >= total;
  // `false` only once the server has actually said so — `undefined` (still
  // loading) must not read as "cards are off" and flip the tiles mid-render.
  const cardPaymentsOff = cardPayments === false;
  // Derived, not stored — see `preferredPaymentMethod` above.
  //
  // Falling back to Razorpay when the wallet cannot cover the order is only
  // correct while Razorpay can collect. With no keys configured it created
  // a real `Order` and then hung on a Checkout widget that never calls back
  // (see `getPaymentsConfig`), stranding the order at `pending_payment`. So
  // when cards are off, wallet is the only method and an order that the
  // balance cannot cover is refused *before* it is created.
  const paymentMethod: PaymentMethod = cardPaymentsOff
    ? "wallet"
    : walletSufficient
      ? preferredPaymentMethod
      : "razorpay";
  const cannotPay = cardPaymentsOff && !walletSufficient;
  const walletApplied = paymentMethod === "wallet" ? total : 0;

  async function addAddress() {
    if (!newAddress.recipientName || !newAddress.line1 || !newAddress.city || !newAddress.pincode) {
      return;
    }
    setSavingAddress(true);
    setAddressError(null);
    try {
      if (mock) {
        const address: Address = {
          id: `addr-${Date.now()}`,
          userId: "user-demo",
          label: "New address",
          recipientName: newAddress.recipientName,
          phone: newAddress.phone,
          line1: newAddress.line1,
          line2: newAddress.line2 || undefined,
          city: newAddress.city,
          state: newAddress.state,
          pincode: newAddress.pincode,
          country: "India",
          isDefault: false,
        };
        setAddressList((current) => [...current, address]);
      } else {
        const address = await createAddress({
          label: "New address",
          recipientName: newAddress.recipientName,
          phone: newAddress.phone,
          line1: newAddress.line1,
          line2: newAddress.line2 || undefined,
          city: newAddress.city,
          state: newAddress.state,
          pincode: newAddress.pincode,
        });
        setAddressList((current) => [...current, address]);
      }
      setNewAddress(EMPTY_ADDRESS_FORM);
      setShowAddAddress(false);
    } catch (err) {
      // The server refuses a malformed phone or pincode (`CreateAddressDto`).
      // Without this the address simply never appeared in the list, with no
      // reason given, on the screen where the buyer is trying to pay.
      setAddressError(apiErrorMessage(err, "Couldn't save this address. Check the details."));
    } finally {
      setSavingAddress(false);
    }
  }

  /** Real mode only: the gift recipient needs a real, owned `Address` row before `POST /orders` — see `OrderGift.recipientAddressId`'s doc comment. */
  async function resolveGiftAddressId(): Promise<string> {
    if (mock) return MOCK_GIFT_ADDRESS_ID;
    const saved = await createAddress({
      label: `Gift — ${recipient.recipientName}`,
      recipientName: recipient.recipientName,
      phone: recipient.phone,
      line1: recipient.line1,
      line2: recipient.line2 || undefined,
      city: recipient.city,
      state: recipient.state,
      pincode: recipient.pincode,
    });
    return saved.id;
  }

  async function handlePlaceOrder() {
    // A ref, not `placing`. `setPlacing(true)` is a state update: the
    // button is not actually disabled until React re-renders, so several
    // clicks landing in one task all pass the check. The audit clicked
    // three times in a single task and got three orders and three wallet
    // debits — ₹894 taken for one ₹298 purchase. A ref flips now.
    //
    // This is the fast guard, not the real one. The server-side
    // `Idempotency-Key` below is what holds when the retry comes from a
    // different render, a second tab or a reconnecting client.
    if (submittingRef.current) return;

    setFormError(null);

    if (items.length === 0) return;

    if (isGift) {
      const { recipientName, phone, line1, city, state, pincode } = recipient;
      if (!recipientName || !phone || !line1 || !city || !state || !pincode) {
        setFormError("Fill in the recipient's full address before placing the order.");
        return;
      }
    }

    submittingRef.current = true;
    setPlacing(true);

    const giftAddressId = isGift ? await resolveGiftAddressId() : undefined;

    const lines: CreateOrderLineInput[] = items.map((item) => {
      const info = lineInfo(item);
      return {
        productId: item.productId,
        sku: item.sku,
        hamperId: item.hamperId,
        name: info.name,
        quantity: info.quantity,
        price: info.unitPrice,
        addressId: isGift ? (giftAddressId ?? MOCK_GIFT_ADDRESS_ID) : (item.addressId ?? defaultAddress?.id ?? ""),
        // Order-level here rather than per line: the checkbox wraps the
        // whole parcel, and a per-line control would be a cart feature
        // (there is no endpoint that writes `CartItem.giftWrap`). An
        // already-set line stays set.
        giftWrap: item.giftWrap || giftWrap,
      };
    });

    const shipments: OrderShipment[] = isGift
      ? [
          {
            addressId: giftAddressId ?? MOCK_GIFT_ADDRESS_ID,
            deliveryDate: deliveryDateOptions.find((d) => d.id === giftDateId)?.isoDate,
          },
        ]
      : Array.from(groups.keys()).map((addressId) => ({
          addressId,
          deliveryDate: deliveryDateOptions.find(
            (d) => d.id === (dateByAddress[addressId] ?? deliveryDateOptions[0]?.id),
          )?.isoDate,
        }));

    /**
     * Sent whenever there is something to record, which since the gift
     * block became real controls includes "a card, on an order I am
     * keeping". `recipientAddressId` is what makes the parcel go
     * somewhere else and is the only field the server treats as the
     * shipping switch — absent, this is a gift note on an ordinary
     * order.
     */
    const trimmedMessage = giftMessage.trim();
    const gift: OrderGift | undefined = isGift
      ? {
          isGift: true,
          recipientName: recipient.recipientName,
          recipientAddressId: giftAddressId ?? MOCK_GIFT_ADDRESS_ID,
          hidePrice,
          message: trimmedMessage || undefined,
        }
      : trimmedMessage
        ? { isGift: true, hidePrice: false, message: trimmedMessage }
        : undefined;

    const created = await createOrder({
      lines,
      defaultAddressId: defaultAddress?.id,
      shipments,
      gift,
      paymentMethod,
      walletApplied,
      idempotencyKey: idempotencyKeyRef.current,
    });

    if (paymentMethod === "wallet") {
      const result = await pay(created.total, {
        title: `Paid — Order #${created.orderNumber}`,
        refType: "order",
        refId: created.id,
      });
      if (!result.ok) {
        setFormError(
          result.message ??
            "Your wallet balance changed before this order could be charged — please choose Card / UPI instead.",
        );
        submittingRef.current = false;
        setPlacing(false);
        return;
      }
    } else if (paymentMethod === "razorpay" && !mock) {
      try {
        const rzpOrder = await createRazorpayOrder({ purpose: "order", orderId: created.id });
        // Mock order id = no usable Razorpay keys. Opening the SDK with one
        // hangs forever (see `getPaymentsConfig`), so fail into the catch
        // below, which at least tells the buyer their order is saved and
        // unpaid. `cardPaymentsOff` should have prevented reaching here.
        if (rzpOrder.mock) throw new Error("PAYMENTS_UNAVAILABLE");
        await new Promise<void>((resolve, reject) => {
          openRazorpayCheckout({
            keyId: rzpOrder.keyId || RAZORPAY_KEY_ID,
            amountPaise: rzpOrder.amountPaise,
            currency: rzpOrder.currency,
            name: "Homekrafted",
            description: `Order #${created.orderNumber}`,
            orderId: rzpOrder.razorpayOrderId,
            prefill: { name: user?.name, email: user?.email, contact: user?.phone },
            onSuccess: () => resolve(),
            onDismiss: () => reject(new Error("Payment cancelled")),
          }).catch(reject);
        });
      } catch {
        setFormError("Payment wasn't completed — your order is saved and awaiting payment.");
        submittingRef.current = false;
        setPlacing(false);
        return;
      }
    }

    // Re-read the order once — a wallet pay/Razorpay webhook may have
    // already flipped `pending-payment -> placed` and credited cashback
    // server-side by now; fall back to the just-created snapshot if the
    // refetch fails for any reason (still a perfectly valid confirmation).
    const finalOrder = mock ? created : ((await getOrder(created.id).catch(() => undefined)) ?? created);

    if (finalOrder.cashbackEarned > 0) {
      earnCashback(finalOrder.cashbackEarned, {
        title: `Cashback — Order #${finalOrder.orderNumber}`,
        refType: "order",
        refId: finalOrder.id,
      });
    }

    setOrder(finalOrder);
    clear();
    submittingRef.current = false;
    setPlacing(false);
  }

  if (order) {
    return (
      <section className={clsx("container", styles.page)}>
        <OrderConfirmation order={order} onContinueShopping={() => router.push("/shop")} />
      </section>
    );
  }

  if (!ready || !accountReady) {
    return (
      <section className={clsx("container", styles.page)}>
        <p className={styles.loading}>Loading checkout…</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className={clsx("container", styles.page)}>
        <div className={styles.empty}>
          {/*
            An `h1`, not the `p` this was: it is the only heading on the
            page in this state, so the document had no `h1` at all — a
            screen-reader user landing here after a mid-payment refresh got
            an untitled page at the moment they most needed to know where
            they were. The styling is unchanged; `.emptyTitle` already sets
            the family, size and weight, and the global reset zeroes the
            heading margin. Found by the M29 mobile sweep, which reported
            `h1x0` on `/checkout` for a signed-in buyer with an empty cart —
            the signed-out variant has its own `h1` and hid this.
          */}
          <h1 className={styles.emptyTitle}>Your cart is empty</h1>
          {/*
            You do not arrive at an empty checkout by browsing — you get
            here with items or not at all. The realistic way to see this
            screen is a refresh during "Placing order…": measured on
            2026-08-08, the order lands, the cart is cleared, and the page
            you come back to says only that your cart is empty. Nothing on
            it says whether ₹489 moved. The cart being cleared is what
            stops a second order; this is what stops the buyer having to
            guess. Not a toast — the state it explains outlives one.
          */}
          <p className={styles.emptyHint}>
            Placed an order just now? A refresh mid-payment can land you here —{" "}
            <Link href="/account/orders">check your orders</Link> before trying again.
          </p>
          <Button variant="primary" onClick={() => router.push("/shop")}>
            Continue shopping
          </Button>
        </div>
      </section>
    );
  }

  const summaryLines: StickySummaryLine[] = [];
  if (isGift) {
    summaryLines.push({
      label: `To ${recipient.recipientName || "recipient"}`,
      value: formatCurrency(subtotal),
    });
  } else {
    for (const [addressId, groupItems] of groups) {
      const address = addressList.find((a) => a.id === addressId);
      const groupSubtotal = groupItems.reduce((sum, item) => sum + lineInfo(item).lineTotal, 0);
      summaryLines.push({
        label: `To ${address?.label ?? "address"}`,
        value: formatCurrency(groupSubtotal),
      });
    }
  }
  summaryLines.push(
    { label: "Subtotal", value: formatCurrency(subtotal) },
    { label: "Shipping", value: shipping === 0 ? "Free" : formatCurrency(shipping) },
    { label: "Total", value: formatCurrency(total), emphasis: true },
  );

  return (
    <section className={clsx("container", styles.page)}>
      <h1 className={styles.title}>Checkout</h1>

      <div className={styles.layout}>
        <div className={styles.main}>
          {/* ---- Gift-to-recipient ---- */}
          <div className={styles.section}>
            <label className={styles.giftToggleRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isGift}
                onChange={(event) => setIsGift(event.target.checked)}
              />
              <span>
                <span className={styles.sectionTitle}>🎁 This is a gift — ship to someone else</span>
                <span className={styles.sectionHint}>
                  Sends the whole order straight to a recipient&rsquo;s address instead of yours.
                </span>
              </span>
            </label>

            {/* Gift wrap and the message card sit **outside** the
                ship-to-someone-else branch, because both apply just as
                well to a parcel the buyer collects and hands over — and
                because the product page offers all three side by side.
                Wrap in particular had no control anywhere until now. */}
            <div className={styles.giftExtras}>
              <label className={styles.hideToggleRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={giftWrap}
                  onChange={(event) => setGiftWrap(event.target.checked)}
                />
                🎀 Gift wrap this order
              </label>

              <label className={styles.hideToggleRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={wantsCard || isGift}
                  disabled={isGift}
                  onChange={(event) => setWantsCard(event.target.checked)}
                />
                ✎ Include a handwritten message card
              </label>

              {(wantsCard || isGift) && (
                <Textarea
                  label="Message card"
                  placeholder="Add a short note — the maker writes it out by hand."
                  value={giftMessage}
                  onChange={(event) => setGiftMessage(event.target.value)}
                  rows={3}
                />
              )}
            </div>

            {isGift && (
              <div className={styles.giftBody}>
                <AddressForm values={recipient} onChange={setRecipient} idPrefix="recipient" />

                <label className={styles.hideToggleRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={hidePrice}
                    onChange={(event) => setHidePrice(event.target.checked)}
                  />
                  Hide prices on the recipient&rsquo;s copy
                </label>

                <div className={styles.dateBlock}>
                  <div className={styles.fieldLabel}>Delivery date</div>
                  <SlotPicker
                    variant="day"
                    columns={4}
                    options={deliveryDateOptions.map((d) => ({
                      id: d.id,
                      primary: d.day,
                      secondary: d.date,
                    }))}
                    value={giftDateId}
                    onChange={setGiftDateId}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ---- Multi-address split ---- */}
          {!isGift && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Shipping address</span>
              <div className={styles.addressGroups}>
                {Array.from(groups.entries()).map(([addressId, groupItems]) => {
                  const address = addressList.find((a) => a.id === addressId);
                  return (
                    <div key={addressId} className={styles.addressCard}>
                      <div className={styles.addressHead}>
                        <span className={styles.addressLabel}>{address?.label ?? "Address"}</span>
                        <span className={styles.addressLine}>
                          {address?.recipientName} · {address?.line1}, {address?.city}
                        </span>
                      </div>

                      <ul className={styles.groupItems}>
                        {groupItems.map((item) => (
                          <li key={item.id} className={styles.groupItemRow}>
                            <span>{lineInfo(item).name}</span>
                            <select
                              className={styles.reassignSelect}
                              value={addressId}
                              onChange={(event) => assignAddress(item.id, event.target.value)}
                              aria-label={`Ship ${lineInfo(item).name} to`}
                            >
                              {addressList.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>

                      <div className={styles.dateBlock}>
                        <div className={styles.fieldLabel}>Delivery date</div>
                        <SlotPicker
                          variant="day"
                          columns={4}
                          options={deliveryDateOptions.map((d) => ({
                            id: d.id,
                            primary: d.day,
                            secondary: d.date,
                          }))}
                          value={dateByAddress[addressId] ?? deliveryDateOptions[0]?.id}
                          onChange={(id) =>
                            setDateByAddress((current) => ({ ...current, [addressId]: id }))
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {showAddAddress ? (
                <div className={styles.addAddressForm}>
                  <AddressForm values={newAddress} onChange={setNewAddress} idPrefix="new-addr" />
                  {addressError && (
                    <p className={styles.formError} role="alert">
                      {addressError}
                    </p>
                  )}
                  <div className={styles.addAddressActions}>
                    <Button variant="primary" size="sm" onClick={addAddress} disabled={savingAddress}>
                      {savingAddress ? "Saving…" : "Save address"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setShowAddAddress(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost-gold"
                  className={styles.addAddressBtn}
                  onClick={() => setShowAddAddress(true)}
                >
                  + Add a new address
                </Button>
              )}
            </div>
          )}

          {/* ---- Payment ---- */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Payment</span>
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
                      : `Balance ${formatCurrency(walletBalance)} — insufficient for this order`}
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={clsx(
                  styles.paymentTile,
                  paymentMethod === "razorpay" && styles.paymentTileSelected,
                )}
                disabled={cardPaymentsOff}
                onClick={() => setPreferredPaymentMethod("razorpay")}
                aria-pressed={paymentMethod === "razorpay"}
              >
                <CreditCard size={20} strokeWidth={1.6} />
                <span className={styles.paymentTileBody}>
                  <span className={styles.paymentTileTitle}>Card / UPI (Razorpay)</span>
                  <span className={styles.paymentTileHint}>
                    {cardPaymentsOff
                      ? "Not available yet — we're still setting up online payments."
                      : mock
                        ? "Real payment integration lands in M8 — this is a stub."
                        : "Razorpay test checkout — needs a real test key to fully complete."}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>

        <aside className={styles.aside}>
          <StickySummary
            title="Order summary"
            stickyOnMobile
            lines={summaryLines}
            cashbackLabel={
              // Not "paying with wallet" when the wallet cannot cover it —
              // `paymentMethod` is forced to `wallet` while cards are off, so
              // reading it alone would promise a payment that can't happen.
              cannotPay
                ? `Earn ${formatCurrency(cashback)} wallet cashback on this order`
                : paymentMethod === "wallet"
                  ? `Paying with wallet · earn ${formatCurrency(cashback)} cashback`
                  : `Earn ${formatCurrency(cashback)} wallet cashback on this order`
            }
            footnote={
              shipping > 0
                ? `Free shipping on orders over ${formatCurrency(FREE_SHIPPING_THRESHOLD)}`
                : undefined
            }
          >
            {/* Second location ask, right before money moves — see the
                component for why this confirms rather than blocks. */}
            <DeliveryLocationConfirm />
            <Button
              variant="primary"
              onClick={handlePlaceOrder}
              disabled={placing || cannotPay || !accountReady}
            >
              {placing ? "Placing order…" : "Place order"}
            </Button>
            {/*
              The button label stays literal — "Placing order…" is what is
              happening and a button is not the place for atmosphere. The
              line beneath it is (M28): this wait is the one moment the
              buyer is handing money to a stranger's kitchen, and saying
              where the order is actually going does more than a spinner.
            */}
            {placing && (
              <p className={styles.placingNote} role="status" aria-live="polite">
                {kitchenLoading("checkout", CHECKOUT_LOADING)}
              </p>
            )}
          </StickySummary>
          {cannotPay && (
            <p className={styles.formError} role="alert">
              Your wallet balance is {formatCurrency(walletBalance)} and this order comes to{" "}
              {formatCurrency(total)}. Card and UPI payments aren&apos;t available yet, so this
              order can&apos;t be paid for right now.
            </p>
          )}
          {formError && <p className={styles.formError}>{formError}</p>}
        </aside>
      </div>
    </section>
  );
}
