import Link from "next/link";
import { Plus, Minus } from "lucide-react";
import styles from "./FaqSection.module.css";

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How does ordering from a home kitchen work?",
    answer:
      "When you place an order, it is sent directly to verified home cooks. Unlike commercial restaurants, meals are cooked in small, hygienic batches using authentic family recipes and quality ingredients, then delivered fresh to your doorstep.",
  },
  {
    question: "Are the home kitchens vetted for hygiene and safety?",
    answer:
      "Yes, absolutely. Every home kitchen on HomeKrafted undergoes our thorough home verification process covering clean prep areas, personal hygiene standards, quality ingredient sourcing, and safe food-grade packaging.",
  },
  {
    question: "What is the difference between fresh delivery and express courier shipping?",
    answer:
      "Freshly cooked homemade meals and delicate baked goods are prepared fresh and delivered promptly. Handcrafted gifts, dry snacks, pickles, and artisanal decor are securely packaged and dispatched via tracked express courier.",
  },
  {
    question: "Can I place pre-orders or bulk orders for parties and festivals?",
    answer:
      "Yes! Our home chefs and artisans accept pre-orders and custom catering for birthdays, festive celebrations, and family gatherings. You can select your needed delivery slot during checkout or contact our team for bulk arrangements.",
  },
  {
    question: "What is your cancellation and refund policy?",
    answer:
      "Every order is backed by the HomeKrafted Guarantee. If your order arrives damaged, incorrect, or spoiled, our support team will promptly resolve it with a full replacement or refund.",
  },
  {
    question: "How can I become a HomeKrafter seller?",
    answer:
      "Passionate cooks and independent crafters can join by visiting our 'Sell on HomeKrafted' page. Onboarding takes under 5 minutes: set up your kitchen or studio profile, list your items with your desired payout, and start receiving orders.",
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

