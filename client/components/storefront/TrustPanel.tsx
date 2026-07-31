import clsx from "clsx";
import { Check, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { VendorAchievement, VendorStats, TrustSummary } from "@/lib/types";
import styles from "./TrustPanel.module.css";

export interface TrustPanelProps {
  trust: TrustSummary;
  achievements: VendorAchievement[];
  stats: VendorStats;
  vendorName: string;
  className?: string;
}

const TIER_LABEL: Record<TrustSummary["tier"], string> = {
  new: "New to Homekrafted",
  building: "Building a track record",
  established: "Established kitchen",
  trusted: "Trusted kitchen",
};

/**
 * "What we know about this kitchen" (M16).
 *
 * The score is deliberately **not** rendered as a bare number. A buyer
 * cannot act on "75/100", and a number with no working shown is exactly
 * the kind of platform-invented metric that stops meaning anything. What
 * renders is the tier as a sentence plus every signal behind it, earned
 * and unearned — the same list the HomeKrafter sees in their own portal,
 * so there is one story, not a public one and a private one.
 *
 * Unearned signals show their real detail line ("0 orders delivered",
 * "Not enough orders to say yet") rather than a blank. A new kitchen
 * being new is information, not a failure, and hiding it would leave the
 * buyer to assume the worse of the two.
 */
export function TrustPanel({ trust, achievements, stats, vendorName, className }: TrustPanelProps) {
  const earnedCount = trust.signals.filter((s) => s.earned).length;

  return (
    <Card className={clsx(styles.card, className)} padding="lg">
      <div className={styles.head}>
        <h2 className={styles.title}>What we know about {vendorName}</h2>
        <span className={clsx(styles.tier, styles[trust.tier])}>{TIER_LABEL[trust.tier]}</span>
      </div>
      <p className={styles.lede}>
        {earnedCount} of {trust.signals.length} checks met. Everything below is counted from real
        orders and reviews, or checked by Homekrafted — nothing here is self-declared.
      </p>

      <ul className={styles.signals}>
        {trust.signals.map((signal) => (
          <li
            key={signal.key}
            className={clsx(styles.signal, signal.earned ? styles.earned : styles.unearned)}
          >
            <span className={styles.mark} aria-hidden="true">
              {signal.earned ? <Check size={13} strokeWidth={3} /> : <Minus size={13} strokeWidth={3} />}
            </span>
            <span className={styles.signalText}>
              <span className={styles.signalLabel}>
                {signal.label}
                {/* The tick/dash is `aria-hidden`, so met/not-met has to reach a screen reader some other way. */}
                <span className={styles.srOnly}>{signal.earned ? " — met" : " — not met"}</span>
              </span>
              <span className={styles.signalDetail}>{signal.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {achievements.length > 0 && (
        <div className={styles.achievements}>
          {achievements.map((achievement) => (
            <span key={achievement.key} className={styles.achievement} title={achievement.detail}>
              {achievement.label}
            </span>
          ))}
        </div>
      )}

      {/* Only shown once something has actually shipped — "0 orders, 0%
          cancelled" reads as a judgement on a kitchen that has simply not
          started yet, and the signals list above already says so. */}
      {stats.ordersDelivered > 0 && (
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Orders delivered</dt>
            <dd>{stats.ordersDelivered}</dd>
          </div>
          {stats.cancellationRate !== null && (
            <div className={styles.stat}>
              <dt>Cancelled</dt>
              <dd>{Math.round(stats.cancellationRate * 100)}%</dd>
            </div>
          )}
          <div className={styles.stat}>
            <dt>On Homekrafted</dt>
            <dd>
              {stats.monthsActive < 12
                ? `${stats.monthsActive} mo`
                : `${Math.floor(stats.monthsActive / 12)} yr`}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
