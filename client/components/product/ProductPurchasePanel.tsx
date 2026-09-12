"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Gift, Heart, PenLine, Send, ShieldCheck, Sparkles, Truck, AlertCircle, Plus } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { CASHBACK_RATE } from "@/lib/cart/pricing";
import { useCart } from "@/lib/cart/CartContext";
import { addToCartErrorMessage, SOLD_OUT_COPY } from "@/lib/cart/add-error";
import { purchasableSku } from "@/lib/cart/purchasable-sku";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { wishlistErrorMessage } from "@/lib/wishlist/wishlist-error";
import { lookupPincode } from "@/lib/api";
import { isPincodeShape } from "@/lib/pincode";
import {
  EMPTY_GIFT_INTENT,
  hasGiftIntent,
  writeGiftIntent,
  type GiftIntent,
} from "@/lib/gift/gift-intent";
import type { Product } from "@/lib/types";
import styles from "./ProductPurchasePanel.module.css";

export interface ProductPurchasePanelProps {
  product: Product;
  crossSells?: Product[];
}

/** The three gift asks, in the order the parcel gets them. */
/* Line icons, not emoji (2026-09-05 design review). An emoji renders in
   whatever colour glyph the visitor's OS ships — a pink bow on a pine
   surface, a red postbox beside grey type — and is the one element on the
   page not drawn in the brand's line weight. Same set as everywhere else. */
const GIFT_OPTIONS: {
  key: "messageCard" | "wrap" | "shipToRecipient";
  icon: typeof PenLine;
  label: string;
}[] = [
  { key: "messageCard", icon: PenLine, label: "Message card" },
  { key: "wrap", icon: Gift, label: "Gift wrap (+₹40)" },
  { key: "shipToRecipient", icon: Send, label: "Ship to recipient" },
];

/**
 * Product detail's purchase controls: weight-option chips, quantity
 * stepper, add-to-cart and wishlist toggle.
 * Add-to-cart wires into the real cart store (M3, `useCart().addItem`);
 * the wishlist heart wires into the real wishlist store (M7a,
 * `useWishlist()`). Weight selection state lives here so the cart wiring
 * has a single, obvious hook-in point (`selectedSku` + `quantity`).
 */
export function ProductPurchasePanel({ product, crossSells = [] }: ProductPurchasePanelProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const wishlisted = has(product.id);

  const [crossSellAdded, setCrossSellAdded] = useState<Record<string, boolean>>({});
  const [addingCrossSell, setAddingCrossSell] = useState<string | null>(null);

  async function handleAddCrossSell(item: Product) {
    const sku = purchasableSku(item);
    if (!sku) return;
    setAddingCrossSell(item.id);
    try {
      await addItem(item.id, sku, 1);
      setCrossSellAdded((prev) => ({ ...prev, [item.id]: true }));
      setTimeout(() => {
        setCrossSellAdded((prev) => ({ ...prev, [item.id]: false }));
      }, 2500);
    } catch {
      // Ignore
    } finally {
      setAddingCrossSell(null);
    }
  }

  const isMealPlan =
    product.categoryId === "meals" ||
    product.slug.includes("meal") ||
    product.slug.includes("tiffin") ||
    product.name.toLowerCase().includes("meal") ||
    product.name.toLowerCase().includes("tiffin");
  /**
   * The size the CARD would add, not the listing's stated default.
   *
   * `ProductGridCard` adds `purchasableSku(product)` — the default size
   * when it has stock, otherwise the first size that does. This panel
   * opened on `defaultWeightSku`, so a listing whose default size is at
   * `stock: 0` while a second size has stock showed a working "+" on the
   * grid and, when opened, a detail page pre-selected to the dead size:
   * "Sold out", a disabled Add, a disabled stepper. The card and the page
   * disagreed about whether the same listing could be bought. Sixteen
   * live listings sit at `stock: 0`, so this is a real state.
   *
   * `?? defaultWeightSku` covers every-size-sold-out, where there is
   * nothing purchasable and the panel still needs a selected size to show
   * a price against.
   */
  const [selectedSku, setSelectedSku] = useState(
    () => purchasableSku(product) ?? product.defaultWeightSku,
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  /**
   * The server's refusal, shown where "Added" would have gone. Before
   * 2026-09-03 nothing here could show one: `addItem` swallowed its own
   * rejection and this button said "Added ✓" over a cart that had not
   * changed — on every listing whose size had `stock: 0`.
   */
  const [addError, setAddError] = useState<string | null>(null);
  const [wishlistError, setWishlistError] = useState<string | null>(null);

  const [pincodeInput, setPincodeInput] = useState("");
  const [pincodeStatus, setPincodeStatus] = useState<{
    pincode: string;
    serviced: boolean;
    district?: string;
    message: string;
  } | null>(null);
  const [checkingPincode, setCheckingPincode] = useState(false);

  const verifyPincode = useCallback(
    async (pin: string) => {
      if (!isPincodeShape(pin)) return;
      setCheckingPincode(true);
      try {
        const result = await lookupPincode(pin);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem("hk_delivery_pincode", pin);
          } catch {}
        }
        if (product.shippingScope === "national") {
          setPincodeStatus({
            pincode: pin,
            serviced: true,
            district: result?.district,
            message: `✓ Delivering to ${pin}${result?.district ? ` (${result.district})` : ""} · 3–5 business days · Pan-India delivery`,
          });
        } else {
          if (result?.serviced) {
            setPincodeStatus({
              pincode: pin,
              serviced: true,
              district: result.district,
              message: `✓ Delivering to ${pin} (${result.district}) · 2–4 hours fresh delivery · ₹49 delivery (Free over ₹499)`,
            });
          } else {
            setPincodeStatus({
              pincode: pin,
              serviced: false,
              district: result?.district,
              message: `✕ Fresh delivery is not available to ${pin}. Kitchen delivers within 15 km in Chandigarh Tricity. Nationwide shipped items can be delivered.`,
            });
          }
        }
      } catch {
        setPincodeStatus({
          pincode: pin,
          serviced: false,
          message: `Could not verify serviceability for ${pin}. Try again in a moment.`,
        });
      } finally {
        setCheckingPincode(false);
      }
    },
    [product.shippingScope],
  );

  useEffect(() => {
    let cancelled = false;
    try {
      const stored = window.localStorage.getItem("hk_delivery_pincode");
      if (stored && isPincodeShape(stored)) {
        queueMicrotask(() => {
          if (!cancelled) {
            setPincodeInput(stored);
            void verifyPincode(stored);
          }
        });
      }
    } catch {
      // LocalStorage access fallback
    }
    return () => {
      cancelled = true;
    };
  }, [verifyPincode]);

  /**
   * The "Make it a gift" block (see `lib/gift/gift-intent.ts`). These
   * three were `<span>`s until now: they looked like controls, the copy
   * above them promised a message card and gift wrap "at checkout", and
   * pressing one did nothing. They are toggles now, and what they set is
   * carried into checkout on add-to-cart.
   */
  const [gift, setGift] = useState<GiftIntent>(EMPTY_GIFT_INTENT);
  const messageFieldId = useId();

  function toggleGift(key: "wrap" | "messageCard" | "shipToRecipient") {
    setGift((current) => {
      const next = { ...current, [key]: !current[key] };
      // Turning the card off drops the message with it, so a line typed
      // and then un-asked-for does not reappear at checkout.
      if (key === "messageCard" && !next.messageCard) next.message = "";
      return next;
    });
    setAdded(false);
  }

  // The mobile sticky bar (M37): on a phone the in-flow Add to cart
  // scrolls away under the description, and the one action the page
  // exists for stops being reachable. The bar shows only while the real
  // button is off-screen — an IntersectionObserver on the buy row, not a
  // scroll listener — and only below the 640 rail (the CSS hides it
  // above; the observer runs harmlessly). Appearance is a CSS
  // transition, so the global reduced-motion floor already covers it.
  const buyRowRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [buyRowVisible, setBuyRowVisible] = useState(true);

  useEffect(() => {
    const el = buyRowRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setBuyRowVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The site-wide cart bar (`components/cart/CartBar`) docks to the
  // bottom edge too. While this sticky bar is showing, it publishes its
  // height as `--hk-dock-h` on the root so the cart bar sits above it
  // instead of on top of it. Measured, not hardcoded — the bar's height
  // is a function of the button and the safe-area inset. A genuinely
  // dynamic value, so this is the one place an inline custom property is
  // the right tool; it is cleared on unmount so no other page inherits it.
  useEffect(() => {
    const root = document.documentElement;
    const h = !buyRowVisible ? (stickyRef.current?.offsetHeight ?? 0) : 0;
    if (h > 0) root.style.setProperty("--hk-dock-h", `${h}px`);
    else root.style.removeProperty("--hk-dock-h");
    return () => {
      root.style.removeProperty("--hk-dock-h");
    };
  }, [buyRowVisible]);

  const weight =
    product.weightOptions.find((w) => w.sku === selectedSku) ?? product.weightOptions[0];
  const stock = weight?.stock ?? 0;
  const soldOut = stock <= 0;

  async function handleAdd() {
    if (soldOut || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await addItem(product.id, selectedSku, quantity);
      // Written on add, not on every toggle: the hand-off is about *this
      // order*, and somebody who plays with the chips and leaves should not
      // find checkout pre-ticked next time they visit.
      writeGiftIntent(gift);
      setAdded(true);
    } catch (err) {
      setAddError(addToCartErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  function selectSize(sku: string, sizeStock: number) {
    setSelectedSku(sku);
    setAdded(false);
    setAddError(null);
    // A quantity chosen for a 20-stock size must not ride over to a
    // 2-stock one and be refused on press.
    setQuantity((q) => Math.max(1, Math.min(q, Math.max(1, sizeStock))));
  }
  /**
   * M46 — three prices, two shown. `salePrice` is what the maker's
   * storefront sale brings it to and is what the checkout actually
   * charges (`resolveCartLine`); `price` is what it is struck through
   * against. `mrp` — the per-product offer — is dropped while a
   * storefront sale runs, because two crossed-out numbers beside one real
   * one reads as a trick.
   */
  const payable = weight ? (weight.salePrice ?? weight.price) : 0;
  const struckPrice = weight?.salePrice !== undefined ? weight.price : weight?.mrp;
  const showStruck = Boolean(weight && struckPrice !== undefined && struckPrice > payable);
  const discountPct =
    product.discountPct ??
    (weight && weight.mrp > weight.price
      ? Math.round(((weight.mrp - weight.price) / weight.mrp) * 100)
      : 0);

  /**
   * **The cashback shown here used to be a promise nothing kept.** It was
   * `weight.price × product.cashbackPct`, a per-listing percentage the
   * HomeKrafter typed into the listing form — and the checkout has always
   * credited a flat platform rate on the whole subtotal
   * (`server/src/common/pricing/pricing.util.ts#CASHBACK_RATE`, mirrored
   * in `lib/cart/pricing.ts`). A listing set to 20% therefore advertised
   * four times the cashback the buyer received, on the screen where they
   * decide to buy.
   *
   * `cashbackPct` still exists on the column and still round-trips
   * through the seller form's payload, so no data changes. It just stops
   * being quoted as money. A HomeKrafter who wants to give buyers
   * something has a real lever now — their own storefront sale (M46).
   */
  const cashback = Math.round(payable * CASHBACK_RATE);

  return (
    <div className={styles.panel}>
      {weight && (
        <div className={styles.priceRow}>
          <span className={styles.price}>{formatCurrency(payable)}</span>
          {showStruck && struckPrice !== undefined && (
            <>
              <span className={styles.mrp}>{formatCurrency(struckPrice)}</span>
              <span className={styles.discount}>{discountPct}% off</span>
            </>
          )}
        </div>
      )}

      <div className={styles.weightLabel}>
        {product.kind === "craft" ? "Size / Option" : "Weight / Size"}
      </div>
      <div className={styles.weightRow}>
        {product.weightOptions.map((option) => (
          <Chip
            key={option.sku}
            // A sold-out size stays pickable so the price can still be
            // read; the label says why the button is greyed.
            label={option.stock > 0 ? option.label : `${option.label} · sold out`}
            selected={option.sku === selectedSku}
            onClick={() => selectSize(option.sku, option.stock)}
          />
        ))}
      </div>

      <div className={styles.cashback}>
        Earn {formatCurrency(cashback)} wallet cashback on this order
      </div>

      <div className={styles.buyRow} ref={buyRowRef}>
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          max={soldOut ? 1 : stock}
          disabled={soldOut}
          aria-label="Quantity"
        />
        <Button
          variant="primary"
          className={styles.addToCart}
          onClick={handleAdd}
          disabled={soldOut || adding}
        >
          {soldOut ? "Sold out" : added ? "Added ✓" : adding ? "Adding…" : "Add to cart"}
        </Button>
        <button
          type="button"
          className={clsx(styles.wishlist, wishlisted && styles.wishlisted)}
          onClick={() => {
            setWishlistError(null);
            // Awaited through a catch: a refused heart used to do nothing
            // and say nothing, which reads as a broken control.
            void toggle(product.id).catch((err: unknown) =>
              setWishlistError(wishlistErrorMessage(err)),
            );
          }}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
        >
          <Heart size={20} strokeWidth={1.6} fill={wishlisted ? "currentColor" : "none"} />
        </button>
      </div>
      {added && !addError && (
        <p className={styles.toast} role="status">
          Added to cart —{" "}
          <button type="button" className={styles.toastLink} onClick={() => router.push("/cart")}>
            view cart
          </button>
        </p>
      )}
      {(addError || wishlistError) && (
        <p className={styles.toastError} role="alert">
          {addError ?? wishlistError}
        </p>
      )}
      {soldOut && !addError && (
        <p className={styles.soldOutNote} role="status">
          {SOLD_OUT_COPY}
        </p>
      )}

      <div className={styles.decisionBlock}>
        <div className={styles.decisionItem}>
          <Truck size={18} className={clsx(styles.decisionIcon, styles.decisionIconPine)} aria-hidden="true" />
          <div className={styles.decisionContent} style={{ width: "100%" }}>
            <span className={styles.decisionTitle}>
              {pincodeStatus
                ? pincodeStatus.serviced
                  ? `Delivering to ${pincodeStatus.pincode}${pincodeStatus.district ? ` (${pincodeStatus.district})` : ""}`
                  : `Service unavailable to ${pincodeStatus.pincode}`
                : product.shippingScope === "national"
                  ? "Pan-India delivery in 3–5 business days"
                  : "Tricity delivery in 2–4 hours"}
            </span>
            <span className={styles.decisionSubtitle}>
              {product.prepTimeMins
                ? `Prepared fresh to order (${product.prepTimeMins} mins notice)`
                : "Fresh batch prepared daily · Free delivery over ₹499"}
            </span>

            <div className={styles.pincodeWidget}>
              <div className={styles.pincodePrompt}>Check delivery to your pincode:</div>
              <form
                className={styles.pincodeForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  void verifyPincode(pincodeInput);
                }}
              >
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 160022"
                  value={pincodeInput}
                  onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, ""))}
                  className={styles.pincodeInput}
                  aria-label="Delivery pincode"
                />
                <button
                  type="submit"
                  disabled={!isPincodeShape(pincodeInput) || checkingPincode}
                  className={styles.pincodeButton}
                >
                  {checkingPincode ? "Checking…" : "Check"}
                </button>
              </form>
              {pincodeStatus && (
                <div
                  className={clsx(
                    styles.pincodeFeedback,
                    pincodeStatus.serviced ? styles.pincodeSuccess : styles.pincodeWarning,
                  )}
                  role="status"
                >
                  {pincodeStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.decisionItem}>
          <ShieldCheck size={18} className={styles.decisionIcon} aria-hidden="true" />
          <div className={styles.decisionContent}>
            <span className={styles.decisionTitle}>
              {product.kind === "craft"
                ? "100% handmade by verified artisan"
                : "FSSAI registered home kitchen"}
            </span>
            <span className={styles.decisionSubtitle}>
              {product.kind === "craft"
                ? "Authentic handcrafted item made in small batches with premium materials"
                : "Prepared in a hygienic home kitchen with natural ingredients and no commercial preservatives"}
            </span>
          </div>
        </div>

        {product.kind !== "craft" && (product.ingredients || product.shelfLife || product.storageInstructions || product.servingGuidance || (product.dietary && product.dietary.length > 0)) && (
          <div className={styles.decisionItem}>
            <Sparkles size={18} className={styles.decisionIcon} aria-hidden="true" />
            <div className={styles.decisionContent}>
              {product.ingredients && (
                <span className={styles.decisionSubtitle}>
                  <strong>Ingredients:</strong> {product.ingredients}
                </span>
              )}
              {product.servingGuidance && (
                <span className={styles.decisionSubtitle}>
                  <strong>Serving:</strong> {product.servingGuidance}
                </span>
              )}
              {product.shelfLife && (
                <span className={styles.decisionSubtitle}>
                  <strong>Shelf life:</strong> {product.shelfLife}
                  {product.storageInstructions ? ` · ${product.storageInstructions}` : ""}
                </span>
              )}
              {((product.dietary && product.dietary.length > 0) || (product.allergens && product.allergens.length > 0)) && (
                <div className={styles.allergenRail}>
                  {product.dietary?.map((tag) => {
                    const isWarning = tag.includes("nuts") || tag.includes("egg");
                    return (
                      <span
                        key={tag}
                        className={clsx(
                          styles.allergenChip,
                          isWarning ? styles.allergenChipWarning : styles.allergenChipSafe,
                        )}
                      >
                        {isWarning && <AlertCircle size={11} />}
                        {tag.replace("-", " ")}
                      </span>
                    );
                  })}
                  {product.allergens?.map((tag) => (
                    <span key={tag} className={clsx(styles.allergenChip, styles.allergenChipWarning)}>
                      <AlertCircle size={11} /> Contains {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {product.kind === "craft" && (product.material || product.careInstructions || product.dimensions) && (
          <div className={styles.decisionItem}>
            <Sparkles size={18} className={styles.decisionIcon} aria-hidden="true" />
            <div className={styles.decisionContent}>
              {product.material && (
                <span className={styles.decisionSubtitle}>
                  <strong>Material:</strong> {product.material}
                </span>
              )}
              {product.dimensions && (
                <span className={styles.decisionSubtitle}>
                  <strong>Dimensions:</strong> {product.dimensions}
                </span>
              )}
              {product.careInstructions && (
                <span className={styles.decisionSubtitle}>
                  <strong>Care:</strong> {product.careInstructions}
                </span>
              )}
            </div>
          </div>
        )}
        {isMealPlan && (
          <div className={styles.mealPlanPolicy}>
            <div className={styles.mealPlanTitle}>
              <Sparkles size={16} aria-hidden="true" />
              Flexible Meal Subscription Policy
            </div>
            <ul className={styles.mealPlanList}>
              <li><strong>Pause or skip anytime:</strong> Inform by 8:00 PM the previous evening to skip next day&apos;s meal.</li>
              <li><strong>Dietary customization:</strong> Pure Jain, diabetic-friendly, or low-oil adjustments available on request.</li>
              <li><strong>Fresh daily delivery:</strong> Cooked fresh every morning and evening in sanitized home kitchens.</li>
            </ul>
          </div>
        )}
      </div>

      {/* No "add to a gift hamper" (M18): a hamper is a listing its
          HomeKrafter assembles and prices, not a basket a buyer fills, so
          there is nothing on this page to add anything to. */}

      <div className={styles.giftBlock}>
        <div className={styles.giftLabel}>Make it a gift</div>
        <p className={styles.giftCopy}>
          Pick what you want and it carries through to checkout — a handwritten card, gift
          wrap, or sending it straight to someone else&rsquo;s address.
        </p>
        <div className={styles.giftChips}>
          {GIFT_OPTIONS.map((option) => {
            const on = gift[option.key];
            return (
              <button
                key={option.key}
                type="button"
                className={clsx(styles.giftChip, on && styles.giftChipOn)}
                onClick={() => toggleGift(option.key)}
                aria-pressed={on}
              >
                {on ? (
                  <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                ) : (
                  <option.icon size={14} strokeWidth={1.8} aria-hidden="true" />
                )}
                {option.label}
              </button>
            );
          })}
        </div>

        {/* The card is the one option with something to say. Asking for
            the words here rather than only at checkout is the point of
            the button: it is written while looking at the thing being
            gifted. Optional — an empty card is a blank card, not an
            error. */}
        {gift.messageCard && (
          <div className={styles.giftMessage}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className={styles.giftMessageLabel} htmlFor={messageFieldId}>
                What should the card say?
              </label>
              <span className={styles.giftMessageMeta}>
                {(gift.message || "").length}/200
              </span>
            </div>
            <textarea
              id={messageFieldId}
              className={styles.giftMessageInput}
              rows={2}
              maxLength={200}
              value={gift.message}
              onChange={(event) => setGift((c) => ({ ...c, message: event.target.value }))}
              placeholder="Happy Diwali, Amma — from all of us."
            />
            {gift.message && (
              <div className={styles.giftPreview}>
                <span className={styles.giftPreviewLabel}>Handwritten Card Preview</span>
                <p className={styles.giftPreviewText}>&ldquo;{gift.message}&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {hasGiftIntent(gift) && (
          <p className={styles.giftNote} role="status">
            {added
              ? "Saved — checkout will have this ready."
              : "Add to cart and checkout will have this ready."}
          </p>
        )}
      </div>

      {crossSells.length > 0 && (
        <div className={styles.crossSellSection}>
          <div className={styles.crossSellTitle}>
            <Sparkles size={16} aria-hidden="true" />
            Pairs well from this kitchen
          </div>
          <div className={styles.crossSellSubtitle}>
            Same kitchen &amp; delivery radius · Ships together with zero extra delivery fee
          </div>
          <div className={styles.crossSellGrid}>
            {crossSells.map((item) => {
              const sku = purchasableSku(item);
              const opt = item.weightOptions?.find((w) => w.sku === sku) ?? item.weightOptions?.[0];
              const isAdded = Boolean(crossSellAdded[item.id]);
              const isAdding = addingCrossSell === item.id;
              const img = item.images?.[0]?.src || "/images/placeholder.jpg";
              return (
                <div key={item.id} className={styles.crossSellCard}>
                  <div className={styles.crossSellThumbWrap}>
                    <Image
                      src={img}
                      alt={item.name}
                      width={130}
                      height={130}
                      className={styles.crossSellThumb}
                    />
                  </div>
                  <Link href={`/product/${item.slug}`} className={styles.crossSellName} title={item.name}>
                    {item.name}
                  </Link>
                  <div className={styles.crossSellPrice}>{formatCurrency(opt?.price ?? 199)}</div>
                  <button
                    type="button"
                    className={clsx(styles.crossSellAddBtn, isAdded && styles.crossSellAddBtnSuccess)}
                    disabled={isAdding || !sku}
                    onClick={() => handleAddCrossSell(item)}
                    aria-label={`Add ${item.name} to cart`}
                  >
                    {isAdded ? (
                      <>
                        <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <Plus size={12} strokeWidth={2.4} aria-hidden="true" />
                        <span>{isAdding ? "…" : "Add"}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Phone-only (≤640 rail, CSS-gated); `aria-hidden` while the real
          controls are on screen so nothing is announced twice. */}
      <div
        ref={stickyRef}
        className={clsx(styles.stickyBar, !buyRowVisible && styles.stickyBarVisible)}
        aria-hidden={buyRowVisible}
      >
        <div className={styles.stickyInfo}>
          <span className={styles.stickyName}>{product.name}</span>
          {weight && <span className={styles.stickyPrice}>{formatCurrency(payable)}</span>}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleAdd}
          disabled={soldOut || adding}
          tabIndex={buyRowVisible ? -1 : 0}
        >
          {soldOut ? "Sold out" : added ? "Added ✓" : "Add to cart"}
        </Button>
      </div>
    </div>
  );
}
