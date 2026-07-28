"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { StepPills, type StepPillsStep } from "@/components/ui/StepPills";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { HamperFillTile } from "./HamperFillTile";
import { HamperBasket } from "./HamperBasket";
import { useCart } from "@/lib/cart/CartContext";
import { computeCashback } from "@/lib/cart/pricing";
import { formatCurrency } from "@/lib/format";
import type { GiftWrapStyle, HamperBox, Product, RibbonColor } from "@/lib/types";
import styles from "./HamperBuilderClient.module.css";

export interface HamperBuilderClientProps {
  boxes: HamperBox[];
  products: Product[];
}

const STEP_PILLS: StepPillsStep[] = [
  { n: 1, label: "Box" },
  { n: 2, label: "Fill" },
  { n: 3, label: "Message" },
  { n: 4, label: "Checkout" },
];

const WRAP_OPTIONS: { value: GiftWrapStyle; label: string }[] = [
  { value: "kraft", label: "Kraft" },
  { value: "floral", label: "Floral" },
  { value: "festive", label: "Festive" },
  { value: "minimal", label: "Minimal" },
];

const RIBBON_OPTIONS: { value: RibbonColor; label: string }[] = [
  { value: "gold", label: "Gold ribbon" },
  { value: "terracotta", label: "Terracotta ribbon" },
  { value: "pine", label: "Pine ribbon" },
  { value: "ivory", label: "Ivory ribbon" },
];

const STEP_COPY = [
  {
    eyebrow: "Customisable · Step 1 of 4",
    title: "Choose your box",
    subtitle: "Petite, Signature or Grand — pick the size that fits your gift.",
  },
  {
    eyebrow: "Customisable · Step 2 of 4",
    title: "Fill it up",
    subtitle: "Add favourites from across the catalog, up to your box's capacity.",
  },
  {
    eyebrow: "Customisable · Step 3 of 4",
    title: "Add a message",
    subtitle: "A gift note, wrap style, ribbon colour and a name card — all optional.",
  },
];

/**
 * Hamper builder wizard (M3) — ported from the prototype's combined
 * Box+Fill screen (`handoff/prototype/Homekrafted.dc.html`, `isHamper`
 * block), split into three real steps (Box → Fill → Message) instead of
 * one static combined view, since `StepPills` already implies a genuine
 * wizard. "4 Checkout" is never rendered here — the Message step's CTA
 * finalizes the hamper into the cart (`useCart().addHamperItem`) and
 * hands off to the shared `/checkout` route as a hamper line, per the
 * M3 brief ("hand into checkout as a hamper line").
 */
export function HamperBuilderClient({ boxes, products }: HamperBuilderClientProps) {
  const router = useRouter();
  const { addHamperItem } = useCart();

  const [step, setStep] = useState(0);
  const [boxId, setBoxId] = useState(boxes[1]?.id ?? boxes[0]?.id ?? "");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [giftNote, setGiftNote] = useState("");
  const [wrap, setWrap] = useState<GiftWrapStyle>("kraft");
  const [ribbon, setRibbon] = useState<RibbonColor>("gold");
  const [nameCard, setNameCard] = useState("");

  const box = boxes.find((b) => b.id === boxId) ?? boxes[0];

  const lineItems = useMemo(
    () =>
      itemIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p))
        .map((product) => {
          const weight =
            product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
            product.weightOptions[0];
          return { productId: product.id, name: product.name, price: weight?.price ?? 0 };
        }),
    [itemIds, products],
  );

  const total =
    (box?.price ?? 0) + lineItems.reduce((sum, item) => sum + item.price, 0);
  const cashback = computeCashback(total);

  function selectBox(nextBoxId: string) {
    setBoxId(nextBoxId);
    const nextBox = boxes.find((b) => b.id === nextBoxId);
    if (nextBox) setItemIds((current) => current.slice(0, nextBox.maxItems));
  }

  function addProduct(productId: string) {
    if (!box || itemIds.length >= box.maxItems) return;
    setItemIds((current) => [...current, productId]);
  }

  function removeProduct(productId: string) {
    setItemIds((current) => current.filter((id) => id !== productId));
  }

  async function finishAndCheckout() {
    if (!box) return;
    // M8.4a: real mode's `addHamperItem` doesn't resolve to a real id
    // until the server creates the `Hamper` row — await it (a no-op await
    // in mock mode, which already returns a plain `ID`) so the navigation
    // below never races the cart write.
    await addHamperItem({
      boxId: box.id,
      items: itemIds.map((productId) => ({ productId, quantity: 1 })),
      giftNote: giftNote.trim() || undefined,
      wrap,
      ribbon,
      nameCard: nameCard.trim() || undefined,
      hidePrice: false,
    });
    router.push("/checkout");
  }

  const copy = STEP_COPY[step];

  return (
    <>
      <div className={clsx("container", styles.intro)}>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h1 className={styles.title}>Build your hamper</h1>
        <p className={styles.subtitle}>{copy.subtitle}</p>
      </div>

      <div className={clsx("container", styles.pillsRow)}>
        <StepPills steps={STEP_PILLS} activeIndex={step} />
      </div>

      <section className={clsx("container", styles.layout)}>
        <div className={styles.main}>
          {step === 0 && (
            <div className={styles.boxGrid}>
              {boxes.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={clsx(styles.boxTile, b.id === boxId && styles.boxTileSelected)}
                  onClick={() => selectBox(b.id)}
                  aria-pressed={b.id === boxId}
                >
                  <span className={styles.boxName}>{b.name}</span>
                  <span className={styles.boxItems}>{b.itemsLabel}</span>
                  <span className={styles.boxPrice}>{formatCurrency(b.price)}</span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className={styles.fillGrid}>
              {products.map((product) => (
                <HamperFillTile
                  key={product.id}
                  product={product}
                  added={itemIds.includes(product.id)}
                  disabled={!box || itemIds.length >= box.maxItems}
                  onAdd={() => addProduct(product.id)}
                  onRemove={() => removeProduct(product.id)}
                />
              ))}
            </div>
          )}

          {step === 2 && (
            <div className={styles.messageForm}>
              <Textarea
                label="Gift note"
                placeholder="Write a short note for the recipient…"
                value={giftNote}
                onChange={(event) => setGiftNote(event.target.value)}
                rows={4}
              />

              <div className={styles.field}>
                <div className={styles.fieldLabel}>Wrap style</div>
                <div className={styles.chipRow}>
                  {WRAP_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={wrap === option.value}
                      onClick={() => setWrap(option.value)}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>Ribbon</div>
                <div className={styles.chipRow}>
                  {RIBBON_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={ribbon === option.value}
                      onClick={() => setRibbon(option.value)}
                    />
                  ))}
                </div>
              </div>

              <Textarea
                label="Name card"
                hint={'Printed on a small card tucked into the hamper, e.g. "With love, Ananya"'}
                placeholder="With love, …"
                value={nameCard}
                onChange={(event) => setNameCard(event.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>

        <aside className={styles.aside}>
          <HamperBasket
            boxName={box?.name ?? ""}
            boxPrice={box?.price ?? 0}
            maxItems={box?.maxItems ?? 0}
            lineItems={lineItems}
            onRemove={removeProduct}
            cashback={cashback}
            ctaLabel={
              step === 0
                ? "Continue to fill →"
                : step === 1
                  ? "Add message card →"
                  : "Review & checkout →"
            }
            ctaDisabled={step === 1 && lineItems.length === 0}
            onCta={() => {
              if (step < 2) setStep((current) => current + 1);
              else finishAndCheckout();
            }}
          />
        </aside>
      </section>
    </>
  );
}
