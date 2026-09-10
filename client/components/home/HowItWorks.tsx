import { ChefHat, Flame, ShieldCheck } from "lucide-react";
import styles from "./HowItWorks.module.css";

const STEPS = [
  {
    n: "01",
    icon: ChefHat,
    title: "Browse real kitchens",
    body:
      "Every listing is a person, not a warehouse. See who's cooking, read their family recipes and story, and explore fresh seasonal menus.",
  },
  {
    n: "02",
    icon: Flame,
    title: "Order, then they start",
    body:
      "Nothing sits in a fridge or under commercial heat lamps. Your order is the reason fresh preparation begins in a clean home kitchen.",
  },
  {
    n: "03",
    icon: ShieldCheck,
    title: "Freshly packed & delivered",
    body:
      "Packed with care at home and delivered to your doorstep. If something arrives damaged or isn't right, we resolve it promptly — backed by our guarantee.",
  },
];

export function HowItWorks() {
  return (
    <div className={styles.timelineWrapper}>
      <ol className={styles.timeline}>
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li className={styles.timelineStep} key={step.n}>
              <div className={styles.nodeWrap} aria-hidden="true">
                <span className={styles.nodeCircle}>{step.n}</span>
              </div>
              <div className={styles.stepContent}>
                <div className={styles.stepHeader}>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <span className={styles.stepIconBadge} aria-hidden="true">
                    <Icon size={16} />
                  </span>
                </div>
                <p className={styles.stepBody}>{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
