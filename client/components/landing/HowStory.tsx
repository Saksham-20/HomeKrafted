"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import styles from "./HowStory.module.css";

/**
 * Owner-approved copy (D2): "a clean home kitchen" and "backed by our
 * guarantee" are gone — nothing inspects a kitchen, and a return is
 * decided by a person rather than guaranteed (M15).
 */
const STEPS = [
  {
    word: "Browse.",
    title: "Browse real kitchens",
    body: "Every listing is a person, not a warehouse. See who's cooking, read their family recipes and story, and explore fresh seasonal menus.",
  },
  {
    word: "Order.",
    title: "Order, then they start",
    body: "Nothing sits in a fridge or under commercial heat lamps. Your order is the reason preparation begins in their home kitchen.",
  },
  {
    word: "Unwrap.",
    title: "Freshly packed & delivered",
    body: "Packed with care at home and delivered to your doorstep. If something arrives damaged or isn't right, raise it from your order and a person here sorts it out.",
  },
];

/**
 * How ordering from a stranger's kitchen works, told as you scroll: the
 * left column holds still and swaps its one big word as each step passes
 * the middle of the screen. On a phone the steps simply stack, each with
 * its own word — nothing pins, nothing swaps.
 */
export function HowStory() {
  const [active, setActive] = useState(0);
  const steps = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = steps.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const step of steps.current) if (step) observer.observe(step);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.band} aria-labelledby="lp-how-title">
      <div className={clsx("container", styles.inner)}>
        <div className={styles.pin}>
          <h2 id="lp-how-title" className={styles.label}>
            How this works
          </h2>
          <p className={styles.words} aria-hidden="true">
            {STEPS.map((step, index) => (
              <span key={step.word} className={clsx(styles.word, index === active && styles.wordOn)}>
                {step.word}
              </span>
            ))}
          </p>
          <span className={styles.progress} aria-hidden="true">
            {STEPS.map((step, index) => (
              <span
                key={step.word}
                className={clsx(styles.tick, index <= active && styles.tickOn)}
              />
            ))}
          </span>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              ref={(node) => {
                steps.current[index] = node;
              }}
              className={clsx(styles.step, index === active && styles.stepOn)}
            >
              <span className={styles.stepWord} aria-hidden="true">
                {step.word}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
