import styles from "./HowItWorks.module.css";

/**
 * Three steps, and every sentence is a rule the code actually enforces
 * (M53).
 *
 * This is the section that answers the objection an unfamiliar visitor
 * arrives with — *ordering food from a stranger's house, how does that
 * work?* — so it is deliberately not a generic "browse · order · enjoy"
 * strip. Each line names a real behaviour: the delivery-radius filter
 * and its fail-open default (M12/M36), that nothing is cooked in advance
 * and pre-order exists for what needs notice (M16), and the two windows
 * a buyer can act in (cancel until packed, return within seven days of
 * delivery — M15).
 *
 * If any of those rules change, this copy is wrong and has to change
 * with it — which is the point of writing it from the rules rather than
 * from a template.
 */
const STEPS = [
  {
    n: "01",
    title: "Find kitchens that reach you",
    body:
      "Share your area and the food half of the site narrows to kitchens that actually deliver to it. Skip the prompt and nothing is hidden — you just see everything.",
  },
  {
    n: "02",
    title: "Order, then they start cooking",
    body:
      "Nothing is sitting ready under a heat lamp. Your order reaches one person, who makes it. Anything needing a day's notice says so on the listing and takes a slot.",
  },
  {
    n: "03",
    title: "You have a way out",
    body:
      "Cancel any time before it is packed and the money comes back to your wallet. Something wrong after it lands? You have seven days from delivery to raise it.",
  },
];

export function HowItWorks() {
  return (
    <ol className={styles.steps}>
      {STEPS.map((step) => (
        <li className={styles.step} key={step.n}>
          <span className={styles.n} aria-hidden="true">
            {step.n}
          </span>
          <h3 className={styles.title}>{step.title}</h3>
          <p className={styles.body}>{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
