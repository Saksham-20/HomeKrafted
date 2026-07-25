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
import { createOrder, type CreateOrderLineInput } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { DeliveryDateOption } from "@/lib/data";
import type { Address, Order, OrderGift, OrderShipment, PaymentMethod, Wallet } from "@/lib/types";
import styles from "./CheckoutClient.module.css";

export interface CheckoutClientProps {
  initialAddresses: Address[];
  wallet: Wallet;
  deliveryDateOptions: DeliveryDateOption[];
}

/** Synthetic address id for a gift-to-recipient order — not a saved address book row (M7 owns real CRUD). */
const GIFT_ADDRESS_ID = "gift-recipient";

/**
 * Checkout (M3) — the full Marketplace checkout: multi-address split
 * with a per-address delivery date, gift-to-recipient (hide price), and
 * wallet/Razorpay payment. Gift-to-recipient ships the *entire* order to
 * one recipient rather than being combined with per-item multi-address
 * splitting — simpler mental model (you're sending one thing to one
 * person), and it's how gifting actually works; flag this decision for
 * Opus if a mixed "some items to me, one to a gift recipient" flow turns
 * out to be wanted later.
 */
export function CheckoutClient({ initialAddresses, wallet, deliveryDateOptions }: CheckoutClientProps) {
  const router = useRouter();
  const { items, ready, lineInfo, subtotal, assignAddress, clear } = useCart();
  // Live wallet balance (M6) — the `wallet` prop still supplies the static
  // `payWithWalletDefault` preference (server-fetched config), but every
  // balance-sufficiency check reads this instead so a top-up/payment made
  // in another tab/screen this session is reflected immediately.
  const { balance: walletBalance, pay, earnCashback } = useWallet();

  const [addressList, setAddressList] = useState<Address[]>(initialAddresses);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);

  const [isGift, setIsGift] = useState(false);
  const [recipient, setRecipient] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [hidePrice, setHidePrice] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftDateId, setGiftDateId] = useState(deliveryDateOptions[0]?.id ?? "");

  const [dateByAddress, setDateByAddress] = useState<Record<string, string>>({});
  // The shopper's *preference* — the actually-effective method (below) falls
  // back to Razorpay whenever the wallet can't cover the total, so a cart
  // that grows after this mounts (e.g. a hamper hand-off) can never leave a
  // disabled-but-still-"selected" wallet option silently under-billing.
  // Seeded from the server-fetched `wallet` prop (always populated at first
  // paint via SSR), not the live `walletBalance` from `useWallet()` — that
  // context hydrates from localStorage *after* mount (same guard
  // `CartContext` uses), so on a hard navigation/reload it would briefly
  // read 0 and wrongly default this preference to "razorpay" even when
  // `payWithWalletDefault` is on. This is only ever a one-time starting
  // guess anyway; `walletSufficient` below re-derives the *effective*
  // `paymentMethod` from the live balance on every render, so a stale
  // prop here can never let an actually-insufficient wallet get selected.
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod>(
    wallet.payWithWalletDefault && wallet.balance > 0 ? "wallet" : "razorpay",
  );
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  const defaultAddress = addressList.find((a) => a.isDefault) ?? addressList[0];

  // Default every not-yet-assigned cart line to the account's default
  // address — this is what makes the multi-address split start from a
  // sane place (everything ships to "Home" until reassigned).
  useEffect(() => {
    if (!ready || isGift || !defaultAddress) return;
    for (const item of items) {
      if (!item.addressId) assignAddress(item.id, defaultAddress.id);
    }
  }, [ready, isGift, items, defaultAddress, assignAddress]);

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

  function addAddress() {
    if (!newAddress.recipientName || !newAddress.line1 || !newAddress.city || !newAddress.pincode) {
      return;
    }
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
    setNewAddress(EMPTY_ADDRESS_FORM);
    setShowAddAddress(false);
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

    const lines: CreateOrderLineInput[] = items.map((item) => {
      const info = lineInfo(item);
      return {
        productId: item.productId,
        sku: item.sku,
        hamperId: item.hamperId,
        name: info.name,
        quantity: info.quantity,
        price: info.unitPrice,
        addressId: isGift ? GIFT_ADDRESS_ID : (item.addressId ?? defaultAddress?.id ?? ""),
        giftWrap: item.giftWrap,
      };
    });

    const shipments: OrderShipment[] = isGift
      ? [
          {
            addressId: GIFT_ADDRESS_ID,
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
          recipientAddressId: GIFT_ADDRESS_ID,
          hidePrice,
          message: giftMessage.trim() || undefined,
        }
      : undefined;

    const created = await createOrder({ lines, shipments, gift, paymentMethod, walletApplied });

    // M6: wire the real wallet-debit ledger write. `walletSufficient`
    // already gates the wallet option in the UI (so `paymentMethod` can
    // only be "wallet" when the live balance covers `total`) — `pay`'s
    // `{ ok: false }` path is a defensive fallback for the narrow race
    // where the balance changed between that check and this click (e.g. a
    // second tab). The mock `createOrder` above has no rollback, so this
    // is a known mock-layer gap; M8's server must make order-placement +
    // wallet-debit one atomic, idempotent transaction.
    if (paymentMethod === "wallet") {
      const result = pay(created.total, {
        title: `Paid — Order #${created.orderNumber}`,
        refType: "order",
        refId: created.orderNumber,
      });
      if (!result.ok) {
        setFormError(
          "Your wallet balance changed before this order could be charged — please choose Card / UPI instead.",
        );
        setPlacing(false);
        return;
      }
    }

    // Cashback is earned on every order regardless of payment method
    // (matches `createOrder`'s unconditional `cashbackEarned` and the
    // summary's "Earn ₹X wallet cashback on this order" copy shown even
    // when paying by Razorpay) — unlike Laundry, where M4 scoped cashback
    // to wallet-paid bookings only.
    if (created.cashbackEarned > 0) {
      earnCashback(created.cashbackEarned, {
        title: `Cashback — Order #${created.orderNumber}`,
        refType: "order",
        refId: created.orderNumber,
      });
    }

    setOrder(created);
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

  if (!ready) {
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
                    <Button variant="primary" size="sm" onClick={addAddress}>
                      Save address
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
                    Real payment integration lands in M8 — this is a stub.
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
