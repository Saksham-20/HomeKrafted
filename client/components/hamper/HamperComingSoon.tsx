import Link from "next/link";
import { Gift, MessageSquareHeart, PackageOpen, Ribbon } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import type { HamperBox } from "@/lib/types";
import styles from "./HamperComingSoon.module.css";

export interface HamperComingSoonProps {
  boxes: HamperBox[];
}

const STEPS = [
  {
    icon: PackageOpen,
    title: "Pick your box",
    copy: "Petite, Signature or Grand — priced by how much fits inside.",
  },
  {
    icon: Gift,
    title: "Fill it up",
    copy: "Any mix of pickles, bakes, chocolates and teas from the shop.",
  },
  {
    icon: MessageSquareHeart,
    title: "Add a message card",
    copy: "Handwritten by us, in your words, tucked in with the goods.",
  },
  {
    icon: Ribbon,
    title: "We pack it beautifully",
    copy: "Kraft or festive wrap, ribbon, and shipped straight to them.",
  },
] as const;

/**
 * `/hamper` while `FEATURES.hamperBuilder` is off (see `lib/features.ts`) —
 * the builder is finished but held, so this page sells what's coming
 * instead of 404ing or silently redirecting a nav link that still exists.
 *
 * The box tiers are the real seeded `HamperBox` rows, not invented copy,
 * so the pricing shown here can't drift from the wizard it precedes.
 */
export function HamperComingSoon({ boxes }: HamperComingSoonProps) {
  return (
    <div className="container">
      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>Coming soon</span>
          <h1 className={styles.heading}>
            Build your own
            <br />
            <em className={styles.emphasis}>gift hamper</em>
          </h1>
          <p className={styles.lede}>
            Choose a box, fill it with whatever you like from our home kitchens, add a handwritten
            card and gift wrap. We&rsquo;re putting the finishing touches on it — until then, our
            ready-made hampers are packed and shipping.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/shop" className={styles.ctaPrimary}>
              Shop ready-made hampers
            </Link>
            <Link href="/corporate" className={styles.ctaOutline}>
              Bulk &amp; corporate gifting →
            </Link>
          </div>
        </div>
        <div className={styles.imageWrap}>
          <ImageSlot
            ratio="1/1"
            label="Festive homemade gift hamper"
            src="/images/products/festive-assorted-hamper.jpg"
            size="1200×1200"
          />
          <span className={styles.imageBadge}>In the works</span>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it will work</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={1.6} />
                </span>
                <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.stepTitle}>{step.title}</span>
                <span className={styles.stepCopy}>{step.copy}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The boxes</h2>
        <div className={styles.boxGrid}>
          {boxes.map((box) => (
            <div key={box.id} className={styles.box}>
              <span className={styles.boxName}>{box.name}</span>
              <span className={styles.boxItems}>{box.itemsLabel}</span>
              <span className={styles.boxPrice}>{formatCurrency(box.price)}</span>
              <span className={styles.boxNote}>box only · contents extra</span>
            </div>
          ))}
        </div>
        <p className={styles.footNote}>
          Prices are the box itself — you only pay for what you put in it on top. Launching with the
          festive season.
        </p>
      </section>
    </div>
  );
}
