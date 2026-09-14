import Link from "next/link";
import { Plus, Minus } from "lucide-react";
import styles from "./FaqSection.module.css";

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Rewritten 2026-09-14. Every answer here has to be a rule this product
 * actually enforces — a FAQ is where somebody checks what they are owed,
 * so an answer that overstates is the one that gets quoted back at us.
 *
 * What was here claimed: a "thorough home verification process covering
 * clean prep areas, personal hygiene standards" (no such inspection
 * exists — an admin ticks `fssaiVerified`/`identityVerified` on a form,
 * nobody visits a kitchen); a blanket "HomeKrafted Guarantee" of a prompt
 * "full replacement or refund" (the opposite of the M15 rule, where a
 * return moves no money and a person decides, precisely so the most
 * abusable path is not the most frictionless — the loss lands on a home
 * cook); pickles and snacks going out by "tracked express courier" (the
 * courier carries gifts and never food, M57, and it is switched off); and
 * seller onboarding taking "under 5 minutes" before you "start receiving
 * orders" (a person works the M22 queue, and SellCta is already forbidden
 * from promising an approval time).
 */
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How does ordering from a home kitchen work?",
    answer:
      "Your order goes straight to the kitchen that listed the dish, and most food is cooked after you order rather than taken off a shelf. That is why some listings ask for notice: anything needing more than half an hour shows a Pre-order badge with the time the cook asked for. The same person who cooks it arranges the delivery.",
  },
  {
    question: "Are the home kitchens checked?",
    answer:
      "Partly, and every kitchen's page shows you exactly how far that went. We check who the person is, and where a kitchen has given us an FSSAI licence number we check that too — both appear on their page as met or unmet, so an unverified kitchen looks different from a verified one rather than the same. Every listing is also reviewed by us before it can be bought. What we do not do is inspect anybody's kitchen in person, so we do not claim to.",
  },
  {
    question: "How does delivery work for food versus gifts?",
    answer:
      "Cooked food is delivered locally by the kitchen itself, which is why what you can see depends on where you are — share a location and we will show which kitchens reach you, and which ones do not. Handcrafted gifts, and packaged food like pickles and snacks that keep, can be posted further afield; each listing says which it is.",
  },
  {
    question: "Can I pre-order, or order in bulk for a party?",
    answer:
      "Yes. A listing carries the notice its maker asked for, and you choose a delivery day and window at checkout from the days that kitchen actually works — closed days are shown struck through rather than quietly dropped. For larger orders, the Bulk & Party Orders page puts you in touch directly.",
  },
  {
    question: "Can I cancel, and what if something is wrong?",
    answer:
      "You can cancel any time before the kitchen marks your order packed, and that refunds automatically. After delivery you have seven days to raise a return, which a person here reviews — it is not automatic, because a refund on a home cook's order comes out of somebody's own week, and we would rather look at it than let the fastest route be the one that costs them most. If something arrives damaged, wrong or spoiled, raise it and we will sort it out.",
  },
  {
    question: "How do I sell on HomeKrafted?",
    answer:
      "Start on the Sell on HomeKrafted page: tell us what you make, where you cook or work from, and how to reach you. Someone here reads every application, so it is not instant — we will come back to you either way. Once you are approved you set your own prices and decide what is available each day.",
  },
];

export function FaqSection() {
  return (
    <section className={styles.faqSection} aria-labelledby="faq-heading">
      <div className={styles.faqHead}>
        <span className={styles.eyebrow}>Got Questions?</span>
        <h2 id="faq-heading" className={styles.title}>
          Frequently Asked Questions
        </h2>
        <p className={styles.subtitle}>
          Everything you need to know about ordering authentic homemade food and handcrafted gifts.
        </p>
      </div>

      <div className={styles.faqList}>
        {FAQ_ITEMS.map((item, index) => (
          <details key={index} className={styles.faqItem} open={index === 0}>
            <summary className={styles.faqSummary}>
              <span>{item.question}</span>
              <span className={styles.iconIndicator} aria-hidden="true">
                <Plus className={styles.plusIcon} />
                <Minus className={styles.minusIcon} />
              </span>
            </summary>
            <p className={styles.faqAnswer}>{item.answer}</p>
          </details>
        ))}
      </div>

      <p className={styles.moreHelp}>
        Still have questions? Reach out to our team at{" "}
        <Link href="/contact" className={styles.helpLink}>
          our help desk
        </Link>
        .
      </p>
    </section>
  );
}

