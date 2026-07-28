"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Wallet as WalletIcon, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StickySummary, type StickySummaryLine } from "@/components/ui/StickySummary";
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
  getWallet,
  type CreateOrderLineInput,
} from "@/lib/api";
import { isMockMode } from "@/lib/api/http";
import { openRazorpayCheckout } from "@/lib/payments/razorpay";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatCurrency } from "@/lib/format";
import type { DeliveryDateOption } from "@/lib/data";
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

  const [isGift, setIsGift] = useState(false);
  const [recipient, setRecipient] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [hidePrice, setHidePrice] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftDateId, setGiftDateId] = useState(deliveryDateOptions[0]?.id ?? "");

  const [dateByAddress, setDateByAddress] = useState<Record<string, string>>({});
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod>("razorpay");
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAddresses(), getWallet()]).then(([addresses, w]) => {
      if (cancelled) return;
      setAddressList(addresses);
      if (w.payWithWalletDefault && w.balance > 0) setPreferredPaymentMethod("wallet");
      setAccountReady(true);
    });
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
  // Derived, not stored — see `preferredPaymentMethod` above.
  const paymentMethod: PaymentMethod = walletSufficient ? preferredPaymentMethod : "razorpay";
  const walletApplied = paymentMethod === "wallet" ? total : 0;

  async function addAddress() {
    if (!newAddress.recipientName || !newAddress.line1 || !newAddress.city || !newAddress.pincode) {
      return;
    }
    setSavingAddress(true);
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
    setFormError(null);

    if (items.length === 0) return;

    if (isGift) {
      const { recipientName, phone, line1, city, state, pincode } = recipient;
      if (!recipientName || !phone || !line1 || !city || !state || !pincode) {
        setFormError("Fill in the recipient's full address before placing the order.");
        return;
      }
    }

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
        giftWrap: item.giftWrap,
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

    const gift: OrderGift | undefined = isGift
      ? {
          isGift: true,
          recipientName: recipient.recipientName,
          recipientAddressId: giftAddressId ?? MOCK_GIFT_ADDRESS_ID,
          hidePrice,
          message: giftMessage.trim() || undefined,
        }
      : undefined;

    const created = await createOrder({
      lines,
      defaultAddressId: defaultAddress?.id,
      shipments,
      gift,
      paymentMethod,
      walletApplied,
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
        setPlacing(false);
        return;
      }
    } else if (paymentMethod === "razorpay" && !mock) {
      try {
        const rzpOrder = await createRazorpayOrder({ purpose: "order", orderId: created.id });
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
          <p className={styles.emptyTitle}>Your cart is empty</p>
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

                <Textarea
                  label="Gift message"
                  placeholder="Add a short note for the recipient…"
                  value={giftMessage}
                  onChange={(event) => setGiftMessage(event.target.value)}
                  rows={3}
                />

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
                onClick={() => setPreferredPaymentMethod("razorpay")}
                aria-pressed={paymentMethod === "razorpay"}
              >
                <CreditCard size={20} strokeWidth={1.6} />
                <span className={styles.paymentTileBody}>
                  <span className={styles.paymentTileTitle}>Card / UPI (Razorpay)</span>
                  <span className={styles.paymentTileHint}>
                    {mock
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
              paymentMethod === "wallet"
                ? `Paying with wallet · earn ${formatCurrency(cashback)} cashback`
                : `Earn ${formatCurrency(cashback)} wallet cashback on this order`
            }
            footnote={
              shipping > 0
                ? `Free shipping on orders over ${formatCurrency(FREE_SHIPPING_THRESHOLD)}`
                : undefined
            }
          >
            <Button variant="primary" onClick={handlePlaceOrder} disabled={placing}>
              {placing ? "Placing order…" : "Place order"}
            </Button>
          </StickySummary>
          {formError && <p className={styles.formError}>{formError}</p>}
        </aside>
      </div>
    </section>
  );
}
