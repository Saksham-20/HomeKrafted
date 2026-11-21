"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { ChefHat, ClipboardCheck, Home, Package, Store, Truck, type LucideIcon } from "lucide-react";
import { useFoodOrdersOpen } from "@/components/food/useFoodOrdersOpen";
import styles from "./Promises.module.css";

interface Rule {
  icon: LucideIcon;
  label: string;
  note: string;
}

/**
 * Six things the product enforces, as stamps in a passport: pick one and
 * the card beside it says how. Every stamp is a rule the code backs.
 *
 * Owner-approved copy (D1/D1b): "reviewed for hygiene" became "checked by
 * a person" — a person reviews every listing (M22); nobody inspects a
 * kitchen. The food-delivery stamp follows the live `foodOrdersOpen`
 * switch, and "don't know yet" reads as open, the same as everywhere else.
 *
 * The note renders in one live region, so it can never run off a phone,
 * and the first stamp is open at rest — the card is never empty.
 */
export function Promises() {
  const foodOpen = useFoodOrdersOpen();
  const [chosen, setChosen] = useState(0);
  const noteId = useId();

  const promises: Rule[] = [
    {
      icon: Home,
      label: "Made in a real home",
      note: "Everyone selling here applied to us as a home cook or home maker, and someone here read that application before they could list anything.",
    },
    {
      icon: Store,
      label: "Their own storefront",
      note: "Their own page, their own reviews, their own prices and their own payouts. One storefront is one person.",
    },
    {
      icon: ClipboardCheck,
      label: "Checked by a person",
      note: "A new listing waits in a queue until one of us approves it — and goes back in the queue if its name, photo or description changes.",
    },
    {
      icon: ChefHat,
      label: "Cooked after you order",
      note: "Anything that needs more than half an hour's notice says so, with a Pre-order badge and the time the cook asked for.",
    },
    foodOpen === false
      ? {
          icon: Truck,
          label: "Meals opening soon",
          note: "You can browse every kitchen today. Food orders open soon; gifts ship now.",
        }
      : {
          icon: Truck,
          label: "Brought by the kitchen",
          note: "Cooked food is delivered locally by the kitchen that made it, which is why what you see depends on where you are.",
        },
    {
      icon: Package,
      label: "Packed and posted by hand",
      note: "Handcrafted gifts are posted across India, and every listing says how far it travels.",
    },
  ];

  const current = promises[chosen];

  return (
    <section className={clsx("lp-rise", styles.section)} aria-labelledby="lp-promises-title">
      <div className={clsx("container", styles.grid)}>
        <div className={styles.lead}>
          <h2 id="lp-promises-title" className={styles.title}>
            Before you buy, <span className={styles.turn}>look closer.</span>
          </h2>
          <div id={noteId} className={styles.note} aria-live="polite">
            <p key={chosen} className={styles.noteText}>
              <span className={styles.noteLead}>{current.label}</span>
              {current.note}
            </p>
          </div>
        </div>
        <ul className={styles.stamps}>
          {promises.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <button
                  type="button"
                  className={clsx(styles.stamp, chosen === index && styles.stampOn)}
                  aria-pressed={chosen === index}
                  aria-controls={noteId}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setChosen(index);
                  }}
                  onFocus={() => setChosen(index)}
                  onClick={() => setChosen(index)}
                >
                  <span className={styles.ring}>
                    <Icon className={styles.icon} aria-hidden="true" />
                  </span>
                  <span className={styles.label}>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
