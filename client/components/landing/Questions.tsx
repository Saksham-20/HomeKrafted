import Link from "next/link";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/landing/faq";
import styles from "./Questions.module.css";

/**
 * The six questions, answers unchanged (they were rewritten to the rules in
 * M51 and stay the platform's words). The list takes the wide column on the
 * left; the heading holds still on the right — the reverse of every other
 * two-column section on the page.
 */
export function Questions() {
  return (
    <section className={clsx("lp-rise", styles.section)} aria-labelledby="lp-faq-title">
      <div className={clsx("container", styles.inner)}>
        <div className={styles.aside}>
          <span className={styles.mark} aria-hidden="true">
            ?
          </span>
          <h2 id="lp-faq-title" className={styles.title}>
            Questions, answered
          </h2>
          <p className={styles.help}>
            Something not here? <Link href="/contact">Ask the help desk</Link>.
          </p>
        </div>
        <div className={styles.list}>
          {FAQ_ITEMS.map((item, index) => (
            <details key={item.question} className={styles.item} open={index === 0}>
              <summary className={styles.summary}>
                <span>{item.question}</span>
                <Plus className={styles.icon} aria-hidden="true" />
              </summary>
              <p className={styles.answer}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
