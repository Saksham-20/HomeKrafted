"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Wallet as WalletIcon, Building2, CreditCard, Gift, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { DietDot } from "@/components/ui/DietDot";
import { DeliveryLocationConfirm } from "./DeliveryLocationConfirm";
import { SlotPicker } from "@/components/ui/SlotPicker";
import { Textarea } from "@/components/ui/Textarea";
import { AddressForm, EMPTY_ADDRESS_FORM, type AddressFormValues } from "./AddressForm";
import { OrderConfirmation } from "./OrderConfirmation";
import { CartLineRow } from "@/components/cart/CartLineRow";
import { useCart } from "@/lib/cart/CartContext";
import { checkoutModeOf } from "@/lib/cart/checkout-mode";
import { dietOf } from "@/lib/diet";
import { cartUpdateErrorMessage } from "@/lib/cart/add-error";
import { useWallet } from "@/lib/wallet/WalletContext";
import { computeShipping, freeDeliveryHint } from "@/lib/cart/pricing";
import { usePublicSettings } from "@/components/settings/usePublicSettings";
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
import { deliveryDateOptions as buildDeliveryDates, type DeliveryDateOption } from "@/lib/schedule";
import {
  clearGiftIntent,
  hasGiftIntent,
  readGiftIntent,
} from "@/lib/gift/gift-intent";
import type { Address, Order, OrderGift, OrderShipment, PaymentMethod } from "@/lib/types";
import { useFoodOrdersOpen } from "@/components/food/useFoodOrdersOpen";
import { FoodComingSoonBanner } from "@/components/food/FoodComingSoonBanner";
import { FOOD_BUTTON_LABEL } from "@/lib/food-launch";
import {
  addressMissingMessage,
  firstMissingAddressFieldId,
  missingAddressFields,
  recipientMissingMessage,
} from "@/lib/checkout/address-required";
import { focusFirstError } from "@/components/portal/focus-first-error";
import { withoutCampusAddress } from "@/lib/checkout/campus-delivery";
import styles from "./CheckoutClient.module.css";

/** Mock mode only — synthetic address id for a gift-to-recipient order. Real mode saves the recipient as a real `Address` first (see `handlePlaceOrder`) since `docs/API.md` requires `gift.recipientAddressId` to be one of the caller's own saved addresses. */
const MOCK_GIFT_ADDRESS_ID = "gift-recipient";

/**
 * Replaces the delivery-date picker for a craft/gift shipment (2026-09-16).
 * Shadowfax isn't wired for any maker yet, so there's no real date to offer:
 * a craft order is made after it's placed, and a real date only exists once
 * it's packed and handed to a courier (or, for the ISB pop-up, delivered by
 * hand). One message for every craft order rather than ISB-specific
 * wording — the "we don't have Shadowfax info yet" reason is the same for
 * all of them today. `deliveryDate` still goes to the server as the
 * rolling-window default (`firstDateId`) — it's simply never shown or
 * chosen here, and nothing downstream reads it as a promise yet.
 */
const CRAFT_PENDING_MESSAGE =
  "This is made to order — please allow 2–3 days while it's prepared. We'll show a delivery date here once it's packed and on its way.";
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
export function CheckoutClient() {
  /**
   * Computed after mount, never on the server and never at module scope.
   *
   * The list rolls from tomorrow, and it used to be a module-scope
   * `const` read by the Server Component above — so a box up for three
   * days handed every buyer a picker whose first option was two days
   * gone. It is also the buyer's "today" that matters here, not the
   * VPS's: production runs `Etc/UTC`, five and a half hours behind
   * everyone using it, so a server-computed list rolls over at half past
   * five in the morning IST. Held behind the same `accountReady` gate
   * the address book already waits on, so nothing renders an empty
   * picker (the M12 React #418 shape: build it in an effect behind a
   * stable placeholder).
   */
  const [deliveryDateOptions, setDeliveryDateOptions] = useState<DeliveryDateOption[]>([]);
  const mock = isMockMode();
  const router = useRouter();
  const foodOrdersOpen = useFoodOrdersOpen();
  /** The delivery rule from `/admin/settings`; `undefined` until read, and Place order waits for it. */
  const publicSettings = usePublicSettings();
  const { user } = useAuth();
  const { items, ready, lineInfo, subtotal, gstTotal, assignAddress, clear, updateQty, removeItem } = useCart();
  /**
   * A shipment's date picker is craft-only when every line in it is —
   * `checkoutModeOf` already guarantees gift-mode carries no food line, so
   * this is really "no legacy line with `kind` unset", which keeps the
   * picker showing for the handful of pre-M20 rows that predate the field
   * rather than guessing they're craft.
   */
  const isAllCraft = (list: typeof items) =>
    list.length > 0 && list.every((item) => lineInfo(item).kind === "craft");
  // Live wallet balance (M6) — every balance-sufficiency check reads this
  // instead of a static prop, so a top-up/payment made in another tab/
  // screen this session is reflected immediately.
  const {
    balance: walletBalance,
    ready: walletReady,
    loadFailed: walletFailed,
    pay,
  } = useWallet();
  /**
   * We actually know the balance. A failed read leaves the store at its
   * zero-value state, and quoting that as "Balance ₹0 — insufficient for
   * this order" states a figure that is not this person's balance, on the
   * one screen where a wrong number costs them an order (2026-09-06).
   */
  const walletKnown = walletReady && !walletFailed;

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  /**
   * What the buyer may pick. The campus address is written by the server
   * when they choose "Deliver to ISB" and lives on their account so every
   * order, label and receipt keeps rendering a real destination — but
   * picking it here would place a *standard* order to campus, with a
   * delivery fee and a courier booked for a parcel we were going to walk
   * over. `lib/checkout/campus-delivery.ts` has the reasoning.
   */
  const addressList = useMemo(() => withoutCampusAddress(savedAddresses), [savedAddresses]);
  const [accountReady, setAccountReady] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  /**
   * Where the order goes (2026-09-17). Three destinations now, not two:
   * the buyer's own address, somebody else's as a gift, or hand-delivery
   * onto the ISB campus.
   *
   * `isGift` stays derived rather than becoming a third piece of state —
   * it is read in a dozen places (gift wrap, the message card, the
   * recipient fields, the delivery-date panel) and every one of them
   * still means exactly "is this going to somebody else".
   */
  const [shipTo, setShipTo] = useState<"me" | "gift" | "isb">("me");
  const isGift = shipTo === "gift";
  const isCampus = shipTo === "isb";
  const [campusPhone, setCampusPhone] = useState("");
  const [recipient, setRecipient] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [hidePrice, setHidePrice] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  /** Empty until the dates exist; `firstDateId` below is what every read falls back to. */
  const [giftDateId, setGiftDateId] = useState("");
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
      // The product page's "Make it a gift" intent only ever asks for the
      // gift destination, never the campus one — so it selects `gift` and
      // leaves a campus choice alone if one has somehow been made first.
      if (intent.shipToRecipient || intent.wrap || intent.messageCard) {
        setShipTo((current) => (current === "isb" ? current : "gift"));
      }
      setGiftWrap(Boolean(intent.wrap));
      setWantsCard(Boolean(intent.messageCard));
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
        setDeliveryDateOptions(buildDeliveryDates());
        setSavedAddresses(addresses);
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
      // Fire-and-forget until 2026-09-06: a refused assignment left the
      // line with no address and nothing said so, and the buyer met the
      // failure at Place order instead of here.
      if (!item.addressId) {
        void assignAddress(item.id, defaultAddress.id).catch((err: unknown) =>
          setCartError(cartUpdateErrorMessage(err)),
        );
      }
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

  /** What an unset picker means. Every read of a chosen date falls back through it. */
  const firstDateId = deliveryDateOptions[0]?.id ?? "";

  // Until the rule is read the fee is unknown, and "Free" would be a guess
  // at the one number the buyer is about to pay — so it shows "…" and
  // Place order waits (below). The server charges from the same settings.
  // A campus order is free whatever the platform charges, so the fee is
  // known before the settings are — there is no rule left to read
  // (`server/src/common/delivery/isb-campus.ts`).
  const shippingKnown = isCampus || publicSettings !== undefined;
  const shipping = isCampus ? 0 : publicSettings ? computeShipping(subtotal, publicSettings) : 0;
  const freeOver = freeDeliveryHint(publicSettings, shipping);
  const total = subtotal + shipping;
  // Unknown counts as not sufficient — the safe direction, since the
  // server is the authority and would refuse anyway. What changes is what
  // the screen *says*: "we could not read it", never a made-up ₹0.
  const walletSufficient = walletKnown && walletBalance >= total;
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
    // A bare `return` here meant pressing Save with one empty box did
    // nothing at all — no message, no mark, the button not disabled — on
    // the screen where somebody is trying to pay. Name the boxes and put
    // the cursor in the first one (2026-09-17).
    const missing = missingAddressFields(newAddress);
    if (missing.length > 0) {
      setAddressError(addressMissingMessage(missing));
      focusFirstError(firstMissingAddressFieldId(newAddress, "new-addr"));
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
        setSavedAddresses((current) => [...current, address]);
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
        setSavedAddresses((current) => [...current, address]);
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
      // Same treatment as "Save address" above: name the empty boxes and
      // jump to the first, rather than "fill in the full address" over a
      // form the buyer believes they have already filled in.
      const missingRecipient = missingAddressFields(recipient);
      if (missingRecipient.length > 0) {
        setFormError(recipientMissingMessage(missingRecipient));
        focusFirstError(firstMissingAddressFieldId(recipient, "recipient"));
        return;
      }
    }

    submittingRef.current = true;
    setPlacing(true);

    let giftAddressId: string | undefined;
    try {
      giftAddressId = isGift ? await resolveGiftAddressId() : undefined;
    } catch (err) {
      setFormError(apiErrorMessage(err, "Couldn't save the recipient's address. Check the details."));
      submittingRef.current = false;
      setPlacing(false);
      return;
    }

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
        giftWrap: isGift ? (item.giftWrap || giftWrap) : false,
      };
    });

    const shipments: OrderShipment[] = isGift
      ? [
          {
            addressId: giftAddressId ?? MOCK_GIFT_ADDRESS_ID,
            deliveryDate: deliveryDateOptions.find((d) => d.id === (giftDateId || firstDateId))
              ?.isoDate,
          },
        ]
      : Array.from(groups.keys()).map((addressId) => ({
          addressId,
          deliveryDate: deliveryDateOptions.find(
            (d) => d.id === (dateByAddress[addressId] ?? firstDateId),
          )?.isoDate,
        }));

    const trimmedMessage = giftMessage.trim();
    const gift: OrderGift | undefined = isGift
      ? {
          isGift: true,
          recipientName: recipient.recipientName,
          recipientAddressId: giftAddressId ?? MOCK_GIFT_ADDRESS_ID,
          hidePrice,
          message: wantsCard && trimmedMessage ? trimmedMessage : undefined,
        }
      : undefined;

    // Until 2026-09-15 nothing caught this: a refused order (food while it
    // is coming soon, a listing gone out of stock since it was added) left
    // the button on "Placing order…" for good, with no sentence and the
    // submit guard still set.
    let created: Order;
    try {
      created = await createOrder({
        lines,
        defaultAddressId: defaultAddress?.id,
        shipments,
        gift,
        paymentMethod,
        walletApplied,
        idempotencyKey: idempotencyKeyRef.current,
        deliveryMode: isCampus ? "isb-campus" : undefined,
        // No `campusDrop`: the buyer is not asked where on campus any more
        // (2026-09-17). An operator names the spot once the parcel is
        // packed and the buyer is emailed it.
        campusPhone: isCampus ? campusPhone.trim() || undefined : undefined,
      });
    } catch (err) {
      setFormError(apiErrorMessage(err, "We couldn't place this order. Nothing was charged — please try again."));
      submittingRef.current = false;
      setPlacing(false);
      return;
    }

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
            onDismiss: (failureReason) => reject(new Error(failureReason ?? "Payment cancelled")),
            onError: reject,
          }).catch(reject);
        });
      } catch (err) {
        const reason = err instanceof Error && err.message !== "Payment cancelled" ? ` ${err.message}` : "";
        setFormError(`Payment wasn't completed — your order is saved and awaiting payment.${reason}`);
        submittingRef.current = false;
        setPlacing(false);
        return;
      }
    }

    // Re-read the order once — a wallet pay/Razorpay webhook may have
    // already flipped `pending-payment -> placed` server-side by now; fall
    // back to the just-created snapshot if the refetch fails for any reason
    // (still a perfectly valid confirmation). There is no cashback to hand
    // to the wallet store here any more (order cashback was removed
    // 2026-09-19) — `pay` already refetched the balance after a wallet debit.
    const finalOrder = mock ? created : ((await getOrder(created.id).catch(() => undefined)) ?? created);

    setOrder(finalOrder);
    // The order exists and is paid; a failed cart clear must not take the
    // confirmation down with it. Same narrowing as the `getOrder` catch
    // above — and `GET /cart` is the source of truth, so a cart that did
    // not clear here corrects itself on the next load.
    await clear().catch(() => undefined);
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

  /*
    Everything below is presentation. The two layouts share every value,
    handler and guard above; they differ in order, density and emphasis.
    `checkoutModeOf` decides (lib/cart/checkout-mode.ts): any food line
    gets the food layout, because the kitchen delivering it sets the terms.
  */
  const lineInfos = items.map((item) => ({ item, info: lineInfo(item) }));

  /*
    The basket, editable here (owner, 2026-09-16: "combine cart and
    checkout page").

    `/cart` and `/checkout` were two pages showing the same lines, and the
    cart's only job was a button to the other one — a step that asked for
    a page load and gave nothing back. Flipkart runs one continuous flow
    for this reason; Amazon keeps a cart page because it is also a
    save-for-later shelf, which this cart is not.

    A refused quantity change must not move the number on screen: the
    mutations are awaited and the server's own sentence is shown, the
    same rule the cart page already followed.
  */
  const itemsSection = (
    <div className={styles.lines}>
      {lineInfos.map(({ item, info }) => (
        <CartLineRow
          key={item.id}
          info={info}
          onQtyChange={(quantity) => {
            setCartError(null);
            void updateQty(item.id, quantity).catch((err: unknown) =>
              setCartError(cartUpdateErrorMessage(err)),
            );
          }}
          onRemove={() => {
            setCartError(null);
            void removeItem(item.id).catch((err: unknown) =>
              setCartError(cartUpdateErrorMessage(err)),
            );
          }}
        />
      ))}
      {cartError ? (
        <p className={styles.lineError} role="alert">
          {cartError}
        </p>
      ) : null}
    </div>
  );
  const mode = checkoutModeOf(lineInfos.map(({ info }) => info));
  const maker = lineInfos.map(({ info }) => info.maker).find(Boolean);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const selectedAddressId = items[0]?.addressId ?? defaultAddress?.id ?? "";
  const dateOptions = deliveryDateOptions.map((d) => ({ id: d.id, primary: d.day, secondary: d.date }));
  /** A food basket while food is coming soon can't be placed; the server refuses it too. */
  const foodClosed = mode === "food" && foodOrdersOpen === false;
  const placeDisabled = placing || cannotPay || !accountReady || foodClosed || !shippingKnown;
  const placeLabel = placing ? "Placing order…" : `Place order · ${formatCurrency(total)}`;

  /** Food layout: one address for the whole basket — a kitchen makes one trip. */
  function deliverEverythingTo(addressId: string) {
    setCartError(null);
    for (const item of items) {
      if (item.addressId === addressId) continue;
      void assignAddress(item.id, addressId).catch((err: unknown) => setCartError(cartUpdateErrorMessage(err)));
    }
  }

  function chooseDestination(next: "me" | "gift" | "isb") {
    setShipTo(next);
    if (next !== "gift") {
      setGiftWrap(false);
      setWantsCard(false);
      setGiftMessage("");
    }
  }

  /** The checkbox in "Make it a gift" still speaks in booleans. */
  function toggleGift(next: boolean) {
    chooseDestination(next ? "gift" : "me");
  }

  const mockBanner = mock && (
    <div className={styles.mockBanner} role="status">
      <ShieldAlert size={16} aria-hidden="true" />
      <span>
        <strong>Demo checkout</strong> — No real payment will be taken. This environment operates with
        synthetic test accounts only.
      </span>
    </div>
  );

  const itemList = (
    <ul className={styles.itemList}>
      {lineInfos.map(({ item, info }) => {
        const diet = mode === "food" && info.dietary ? dietOf({ dietary: info.dietary }) : undefined;
        return (
          <li key={item.id} className={styles.itemRow}>
            <ImageSlot
              ratio="1/1"
              label={info.imageLabel}
              src={info.imageSrc}
              alt=""
              sizes="64px"
              compact
              className={styles.itemThumb}
            />
            <div className={styles.itemBody}>
              <span className={styles.itemName}>
                {diet && <DietDot diet={diet} className={styles.itemDiet} />}
                {info.name}
              </span>
              <span className={styles.itemMeta}>
                {info.weightLabel ? `${info.weightLabel} · ` : ""}Qty {info.quantity} ×{" "}
                {formatCurrency(info.unitPrice)}
              </span>
            </div>
            <span className={styles.itemPrice}>{formatCurrency(info.lineTotal)}</span>
          </li>
        );
      })}
    </ul>
  );

  const paymentChoices = (
    <div className={styles.paymentOptions} role="group" aria-label="Payment method">
      <button
        type="button"
        className={clsx(styles.paymentTile, paymentMethod === "razorpay" && styles.paymentTileSelected)}
        disabled={cardPaymentsOff}
        onClick={() => setPreferredPaymentMethod("razorpay")}
        aria-pressed={paymentMethod === "razorpay"}
      >
        <CreditCard size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className={styles.paymentTileBody}>
          <span className={styles.paymentTileTitle}>UPI, cards &amp; netbanking</span>
          <span className={styles.paymentTileHint}>
            {cardPaymentsOff
              ? "Not available yet — we're still setting up online payments."
              : mock
                ? "Demo checkout — no real payment will be taken."
                : "Paid securely through Razorpay."}
          </span>
        </span>
      </button>

      <button
        type="button"
        className={clsx(styles.paymentTile, paymentMethod === "wallet" && styles.paymentTileSelected)}
        disabled={!walletSufficient}
        onClick={() => setPreferredPaymentMethod("wallet")}
        aria-pressed={paymentMethod === "wallet"}
      >
        <WalletIcon size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className={styles.paymentTileBody}>
          <span className={styles.paymentTileTitle}>Homekrafted wallet</span>
          <span className={styles.paymentTileHint}>
            {!walletKnown
              ? "We couldn't read your balance just now"
              : walletSufficient
                ? `Balance ${formatCurrency(walletBalance)}`
                : `Balance ${formatCurrency(walletBalance)} — not enough for this order`}
          </span>
        </span>
      </button>
    </div>
  );

  const addressPicker = (
    <>
      {cartError && (
        <p className={styles.formError} role="alert">
          {cartError}
        </p>
      )}
      {addressList.length > 0 && (
        <div className={styles.addressChoices} role="radiogroup" aria-label="Delivery address">
          {addressList.map((address) => (
            <label
              key={address.id}
              className={clsx(styles.addressChoice, selectedAddressId === address.id && styles.addressChoiceSelected)}
            >
              <input
                type="radio"
                name="deliver-to"
                className={styles.radio}
                checked={selectedAddressId === address.id}
                onChange={() => deliverEverythingTo(address.id)}
              />
              <span className={styles.addressChoiceBody}>
                <span className={styles.addressLabel}>{address.label}</span>
                <span className={styles.addressLine}>
                  {address.recipientName} · {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}, {address.city} {address.pincode}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

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
        <button type="button" className={styles.linkButton} onClick={() => setShowAddAddress(true)}>
          + Add a new address
        </button>
      )}
    </>
  );

  /**
   * The ISB panel. Two fields, because the campus address itself is not
   * the buyer's to type — the server writes it
   * (`server/src/common/delivery/isb-campus.ts`) and the only thing we
   * cannot know is which building to walk to.
   *
   * It states the two facts that make the option worth choosing, and
   * neither is a guess: the fee really is zero server-side, and the
   * handover really does start when the maker marks it packed. It does
   * **not** promise a time — nothing here knows one (M51).
   */
  const campusFields = (
    <div className={styles.campusBody}>
      <p className={styles.campusNote}>
        <Building2 size={15} strokeWidth={1.9} aria-hidden="true" />
        <span>
          <strong>We bring it onto campus ourselves.</strong> No delivery charge, and no courier
          in between. We’ll message you the exact pickup spot once the maker has packed it — the
          spot depends on who is carrying it that day, so we tell you then rather than guessing
          now.
        </span>
      </p>
      <label className={styles.campusField}>
        <span className={styles.campusLabel}>Phone for the handover (optional)</span>
        <input
          id="campus-phone"
          className={styles.campusInput}
          value={campusPhone}
          onChange={(event) => setCampusPhone(event.target.value)}
          maxLength={20}
          placeholder={user?.phone ?? "We'll use the number on your account"}
        />
      </label>
    </div>
  );

  const recipientFields = (
    <div className={styles.giftBody}>
      <AddressForm values={recipient} onChange={setRecipient} idPrefix="recipient" />
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={hidePrice}
          onChange={(event) => setHidePrice(event.target.checked)}
        />
        Hide prices on the recipient&rsquo;s copy
      </label>
    </div>
  );

  const giftExtras = (
    <div className={styles.giftExtras}>
      {/* No price on this line: nothing charges for wrapping (2026-09-15). */}
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={giftWrap}
          onChange={(event) => setGiftWrap(event.target.checked)}
        />
        Gift wrap this order
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={wantsCard}
          onChange={(event) => setWantsCard(event.target.checked)}
        />
        Include a handwritten message card
      </label>
      {wantsCard && (
        <Textarea
          label={`Message card (${giftMessage.length}/200)`}
          placeholder="Add a short note — the maker writes it out by hand (max 200 characters)."
          value={giftMessage}
          maxLength={200}
          onChange={(event) => setGiftMessage(event.target.value.slice(0, 200))}
          rows={3}
        />
      )}
    </div>
  );

  const errors = (
    <>
      {cannotPay && (
        <p className={styles.formError} role="alert">
          {walletKnown ? (
            <>
              Your wallet balance is {formatCurrency(walletBalance)} and this order comes to{" "}
              {formatCurrency(total)}. Card and UPI payments aren&apos;t available yet, so this order
              can&apos;t be paid for right now.
            </>
          ) : (
            <>
              We couldn&apos;t read your wallet balance just now, and card and UPI payments aren&apos;t
              available yet — so we can&apos;t take this order. That&apos;s on us, not your connection.
              Nothing in your cart is lost; open your wallet and come back.
            </>
          )}
        </p>
      )}
      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}
    </>
  );

  const placingNote = placing && (
    <p className={styles.placingNote} role="status" aria-live="polite">
      {kitchenLoading("checkout", CHECKOUT_LOADING)}
    </p>
  );

  const terms = (
    <p className={styles.terms}>
      By placing your order you agree to our <Link href="/terms">terms</Link> and{" "}
      <Link href="/refunds">refund policy</Link>. You can cancel until the order is packed.
    </p>
  );

  const payBar = (
    <div className={clsx(styles.payBar, mode === "gift" && styles.payBarMobileOnly)}>
      <div className={styles.payBarInner}>
        <span className={styles.payBarTotal}>
          <span className={styles.payBarAmount}>{formatCurrency(total)}</span>
          <span className={styles.payBarHint}>
            {mode === "food" ? <a href="#bill">View bill</a> : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </span>
        </span>
        <Button variant="primary" onClick={handlePlaceOrder} disabled={placeDisabled} className={styles.payBarButton}>
          {placing ? "Placing order…" : foodClosed ? FOOD_BUTTON_LABEL : "Place order"}
        </Button>
      </div>
    </div>
  );

  // ------------------------------------------------------------------ food
  if (mode === "food") {
    const dateAddressId = selectedAddressId;
    return (
      <section className={clsx("container", styles.page, styles.food)}>
        <div className={styles.foodColumn}>
          {/* No "back to basket": the basket is the section below. */}
          <h1 className={styles.title}>Checkout</h1>
          {mockBanner}
          {foodClosed && <FoodComingSoonBanner />}

          <div className={styles.card}>
            <span className={styles.eyebrow}>Your order from</span>
            <div className={styles.kitchenHead}>
              <span className={styles.kitchenName}>
                {maker?.slug ? <Link href={`/storefront/${maker.slug}`}>{maker.name}</Link> : (maker?.name ?? "Your kitchen")}
              </span>
              {maker?.location && <span className={styles.kitchenArea}>{maker.location}</span>}
            </div>
            {/* Editable here — "Edit basket" used to send somebody to
                `/cart` and back, which is the round trip this page exists
                to remove. */}
            {itemsSection}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Deliver to</h2>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isGift}
                onChange={(event) => toggleGift(event.target.checked)}
              />
              Sending this to someone else?
            </label>
            {isGift ? (
              <>
                {recipientFields}
                {giftExtras}
              </>
            ) : (
              addressPicker
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>When should it arrive?</h2>
            <p className={styles.cardHint}>Cooked for the day you pick.</p>
            <SlotPicker
              variant="day"
              columns={4}
              options={dateOptions}
              value={isGift ? giftDateId || firstDateId : (dateByAddress[dateAddressId] ?? firstDateId)}
              onChange={(id) =>
                isGift
                  ? setGiftDateId(id)
                  : setDateByAddress((current) => ({ ...current, [dateAddressId]: id }))
              }
            />
          </div>

          <div className={styles.card} id="bill">
            <h2 className={styles.cardTitle}>Bill details</h2>
            <dl className={styles.bill}>
              <div className={styles.billRow}>
                <dt>Item total</dt>
                <dd>{formatCurrency(subtotal)}</dd>
              </div>
              <div className={styles.billRow}>
                <dt>
                  Delivery fee
                  {freeOver !== undefined && (
                    <span className={styles.billHint}>Free on orders over {formatCurrency(freeOver)}</span>
                  )}
                </dt>
                <dd>{!shippingKnown ? "…" : shipping === 0 ? "Free" : formatCurrency(shipping)}</dd>
              </div>
              {gstTotal > 0 && (
                <div className={styles.billRow}>
                  <dt>GST (platform fee)</dt>
                  <dd>{formatCurrency(gstTotal)}</dd>
                </div>
              )}
              <div className={clsx(styles.billRow, styles.billTotal)}>
                <dt>To pay</dt>
                <dd>{formatCurrency(total)}</dd>
              </div>
            </dl>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Pay with</h2>
            {paymentChoices}
          </div>

          <DeliveryLocationConfirm hasSelectedAddress={addressList.length > 0 || isGift} />
          {errors}
          {placingNote}
          {terms}
        </div>
        {payBar}
      </section>
    );
  }

  // ------------------------------------------------------------------ gift
  const groupEntries = Array.from(groups.entries());
  const summaryBox = (
    <div className={styles.summaryBox}>
      <Button variant="primary" onClick={handlePlaceOrder} disabled={placeDisabled} className={styles.summaryButton}>
        {placeLabel}
      </Button>
      {placingNote}
      {terms}
      <h2 className={styles.summaryTitle}>Order summary</h2>
      <dl className={styles.bill}>
        <div className={styles.billRow}>
          <dt>
            Items ({itemCount})
          </dt>
          <dd>{formatCurrency(subtotal)}</dd>
        </div>
        <div className={styles.billRow}>
          <dt>Delivery</dt>
          <dd>{!shippingKnown ? "…" : shipping === 0 ? "Free" : formatCurrency(shipping)}</dd>
        </div>
        {gstTotal > 0 && (
          <div className={styles.billRow}>
            <dt>GST (platform fee)</dt>
            <dd>{formatCurrency(gstTotal)}</dd>
          </div>
        )}
        <div className={clsx(styles.billRow, styles.billTotal)}>
          <dt>Order total</dt>
          <dd className={styles.orderTotal}>{formatCurrency(total)}</dd>
        </div>
      </dl>
      {freeOver !== undefined && (
        <p className={styles.summaryFootnote}>Free delivery on orders over {formatCurrency(freeOver)}</p>
      )}
      <DeliveryLocationConfirm hasSelectedAddress={addressList.length > 0 || isGift} />
      {errors}
    </div>
  );

  return (
    <section className={clsx("container", styles.page, styles.gift)}>
      <h1 className={styles.title}>Checkout</h1>
      <p className={styles.subtitle}>
        {itemCount} item{itemCount === 1 ? "" : "s"}
        {maker ? ` from ${maker.name}` : ""}
      </p>
      {mockBanner}

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.step} aria-labelledby="step-items">
            <h2 id="step-items" className={styles.stepTitle}>
              <span className={styles.stepNumber}>1</span> Your items
            </h2>
            <div className={styles.stepBody}>{itemsSection}</div>
          </section>

          <section className={styles.step} aria-labelledby="step-address">
            <h2 id="step-address" className={styles.stepTitle}>
              <span className={styles.stepNumber}>2</span> Delivery address
            </h2>
            <div className={styles.stepBody}>
              <div className={styles.segmented} role="radiogroup" aria-label="Who is it for?">
                <label className={clsx(styles.segment, !isGift && styles.segmentSelected)}>
                  <input
                    type="radio"
                    name="ship-to"
                    className="hk-sr-only"
                    checked={!isGift}
                    onChange={() => toggleGift(false)}
                  />
                  Deliver to me
                </label>
                <label className={clsx(styles.segment, isGift && styles.segmentSelected)}>
                  <input
                    type="radio"
                    name="ship-to"
                    className="hk-sr-only"
                    checked={isGift}
                    onChange={() => chooseDestination("gift")}
                  />
                  <Gift size={14} aria-hidden="true" />
                  Send as a gift
                </label>
                {/* Hand-delivery onto the ISB campus (2026-09-17, owner).
                    A third destination rather than a tick-box on the
                    buyer's own address, because it is not an address the
                    buyer types — the server writes it — and the delivery
                    it buys is a different one. */}
                <label className={clsx(styles.segment, isCampus && styles.segmentSelected)}>
                  <input
                    type="radio"
                    name="ship-to"
                    className="hk-sr-only"
                    checked={isCampus}
                    onChange={() => chooseDestination("isb")}
                  />
                  <Building2 size={14} aria-hidden="true" />
                  Deliver to ISB
                </label>
              </div>
              {isCampus ? campusFields : isGift ? recipientFields : addressPicker}
            </div>
          </section>

          <section className={styles.step} aria-labelledby="step-gift">
            <h2 id="step-gift" className={styles.stepTitle}>
              <span className={styles.stepNumber}>3</span> Gift options
            </h2>
            <div className={styles.stepBody}>{giftExtras}</div>
          </section>

          <section className={styles.step} aria-labelledby="step-payment">
            <h2 id="step-payment" className={styles.stepTitle}>
              <span className={styles.stepNumber}>4</span> Payment method
            </h2>
            <div className={styles.stepBody}>{paymentChoices}</div>
          </section>

          <section className={styles.step} aria-labelledby="step-review">
            <h2 id="step-review" className={styles.stepTitle}>
              {/* The items are editable in step 1 now; what is left here
                  is the part that is genuinely per-shipment — which date
                  each address gets, and which address each item goes to
                  when there is more than one. */}
              <span className={styles.stepNumber}>5</span> Delivery date
            </h2>
            <div className={styles.stepBody}>
              {isGift ? (
                <div className={styles.shipment}>
                  <span className={styles.shipmentHead}>
                    Delivering to {recipient.recipientName || "your recipient"}
                  </span>
                  {isAllCraft(items) ? (
                    <p className={styles.craftNotice}>{CRAFT_PENDING_MESSAGE}</p>
                  ) : (
                    <SlotPicker
                      variant="day"
                      columns={4}
                      options={dateOptions}
                      value={giftDateId || firstDateId}
                      onChange={setGiftDateId}
                    />
                  )}
                  {itemList}
                </div>
              ) : groupEntries.length === 0 ? (
                /*
                  Every line is grouped by the address it ships to, so with
                  no address saved yet there is nothing to group and this
                  step rendered as a numbered heading over 65px of nothing
                  (measured in the browser, 2026-09-16). An empty numbered
                  step reads as a screen that failed to load; say what
                  fills it instead.
                */
                <p className={styles.stepEmpty}>
                  Add a delivery address in step 2 and the dates we can deliver on appear here.
                </p>
              ) : (
                groupEntries.map(([addressId, groupItems]) => {
                  const address = addressList.find((a) => a.id === addressId);
                  return (
                    <div key={addressId} className={styles.shipment}>
                      <span className={styles.shipmentHead}>
                        Delivering to {address?.label ?? "your address"}
                        {address ? ` · ${address.city}` : ""}
                      </span>
                      {isAllCraft(groupItems) ? (
                        <p className={styles.craftNotice}>{CRAFT_PENDING_MESSAGE}</p>
                      ) : (
                        <SlotPicker
                          variant="day"
                          columns={4}
                          options={dateOptions}
                          value={dateByAddress[addressId] ?? firstDateId}
                          onChange={(id) => setDateByAddress((current) => ({ ...current, [addressId]: id }))}
                        />
                      )}
                      <ul className={styles.itemList}>
                        {groupItems.map((item) => {
                          const info = lineInfo(item);
                          return (
                            <li key={item.id} className={styles.itemRow}>
                              <ImageSlot
                                ratio="1/1"
                                label={info.imageLabel}
                                src={info.imageSrc}
                                alt=""
                                sizes="64px"
                                compact
                                className={styles.itemThumb}
                              />
                              <div className={styles.itemBody}>
                                <span className={styles.itemName}>{info.name}</span>
                                <span className={styles.itemMeta}>
                                  {info.weightLabel ? `${info.weightLabel} · ` : ""}Qty {info.quantity} ×{" "}
                                  {formatCurrency(info.unitPrice)}
                                </span>
                                {addressList.length > 1 && (
                                  <select
                                    className={styles.reassignSelect}
                                    value={addressId}
                                    onChange={(event) => {
                                      setCartError(null);
                                      void assignAddress(item.id, event.target.value).catch((err: unknown) =>
                                        setCartError(cartUpdateErrorMessage(err)),
                                      );
                                    }}
                                    aria-label={`Ship ${info.name} to`}
                                  >
                                    {addressList.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        Ship to {a.label}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <span className={styles.itemPrice}>{formatCurrency(info.lineTotal)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <aside className={styles.aside}>{summaryBox}</aside>
      </div>
      {payBar}
    </section>
  );
}
