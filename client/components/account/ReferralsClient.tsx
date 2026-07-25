"use client";

import { useState } from "react";
import clsx from "clsx";
import { Award, Copy, Gift, Share2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CapacityMeter } from "@/components/ui/CapacityMeter";
import { applyReferralCredit } from "@/lib/api";
import { useWallet } from "@/lib/wallet/WalletContext";
import { formatCurrency, formatDate } from "@/lib/format";
import type { LoyaltyAccount, Referral } from "@/lib/types";
import type { HowItWorksStep, LoyaltyTierInfo } from "@/lib/data";
import styles from "./ReferralsClient.module.css";

export interface ReferralsClientProps {
  code: string;
  initialReferrals: Referral[];
  loyaltyAccount: LoyaltyAccount;
  tiers: LoyaltyTierInfo[];
  howItWorks: HowItWorksStep[];
  rewardAmount: number;
}

const STATUS_LABEL: Record<Referral["status"], string> = {
  pending: "Invited",
  joined: "Joined",
  rewarded: "Rewarded",
};

/**
 * Referrals + loyalty (M7b) — referral code with copy/share, a demo
 * "apply referral credit" button that wires `applyReferralCredit()`
 * (`lib/api/referrals.ts`, advances a `Referral` to `rewarded`) into
 * `useWallet().earnReferralCredit()` (real wallet ledger write), and the
 * loyalty tier/points ladder. No prototype screen to port from — built
 * fresh inside the established `Card`/`Button`/`CapacityMeter` system,
 * same as every other M7 screen.
 */
export function ReferralsClient({
  code,
  initialReferrals,
  loyaltyAccount,
  tiers,
  howItWorks,
  rewardAmount,
}: ReferralsClientProps) {
  const { earnReferralCredit } = useWallet();
  const [referrals, setReferrals] = useState<Referral[]>(initialReferrals);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shareUrl = `https://homekrafted.in/join?ref=${code}`;
  const shareText = `Join me on Homekrafted — use my code ${code} and we both get ${formatCurrency(rewardAmount)} to our wallet.`;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(code);
      showToast("Code copied to clipboard");
    } catch {
      showToast(code);
    }
  }

  async function handleShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Homekrafted", text: shareText, url: shareUrl });
        return;
      } catch {
        // user cancelled the share sheet — fall through to clipboard fallback
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      showToast("Share link copied to clipboard");
    } catch {
      showToast(shareUrl);
    }
  }

  const hasCreditable = referrals.some((r) => r.status !== "rewarded");

  async function handleApplyCredit() {
    if (!hasCreditable || busy) return;
    setBusy(true);
    try {
      const result = await applyReferralCredit();
      if (!result) {
        showToast("No pending invites to reward right now");
        return;
      }
      setReferrals((current) =>
        current.map((r) => (r.id === result.referral.id ? result.referral : r)),
      );
      earnReferralCredit(result.rewardAmount, {
        title: `Referral credit — ${result.referral.refereeName ?? "a friend"}`,
        refType: "referral",
        refId: result.referral.id,
      });
      showToast(`${formatCurrency(result.rewardAmount)} credited to your wallet — thanks for the invite!`);
    } finally {
      setBusy(false);
    }
  }

  const tierIndex = tiers.findIndex((t) => t.tier === loyaltyAccount.tier);
  const currentTier = tiers[tierIndex];
  const nextTier = tiers[tierIndex + 1];
  const tierProgressMax = nextTier ? nextTier.threshold - (currentTier?.threshold ?? 0) : 0;
  const tierProgressCurrent = nextTier ? loyaltyAccount.lifetimePoints - (currentTier?.threshold ?? 0) : 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Referrals &amp; loyalty</h1>
        <p className={styles.subtitle}>
          Invite friends, earn wallet credit, and climb loyalty tiers for better cashback.
        </p>
      </div>

      <Card className={styles.codeCard}>
        <span className={styles.sectionLabel}>Your referral code</span>
        <div className={styles.codeRow}>
          <span className={styles.code}>{code}</span>
          <div className={styles.codeActions}>
            <Button variant="secondary" size="sm" onClick={handleCopyCode}>
              <Copy size={15} strokeWidth={1.8} /> Copy
            </Button>
            <Button variant="ghost-gold" size="sm" onClick={handleShare}>
              <Share2 size={15} strokeWidth={1.8} /> Share
            </Button>
          </div>
        </div>
        <p className={styles.codeHint}>
          Invite a friend — you both get <b>{formatCurrency(rewardAmount)}</b> to your wallet once
          they join and place their first order.
        </p>
      </Card>

      <Card className={styles.demoCard}>
        <div className={styles.demoHeader}>
          <Gift size={20} strokeWidth={1.6} className={styles.demoIcon} aria-hidden="true" />
          <div>
            <div className={styles.demoTitle}>See it in action</div>
            <div className={styles.demoHint}>
              Simulates a friend accepting your invite and placing their first order.
            </div>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={handleApplyCredit}
          disabled={!hasCreditable || busy}
          className={styles.demoButton}
        >
          {hasCreditable ? "Apply referral credit (demo)" : "All invites rewarded"}
        </Button>
        {toast && (
          <p className={styles.toast} role="status">
            {toast}
          </p>
        )}
      </Card>

      <Card className={styles.listCard}>
        <span className={styles.sectionLabel}>Your invites</span>
        <div className={styles.list}>
          {referrals.map((referral) => (
            <div key={referral.id} className={styles.row}>
              <div className={styles.rowBody}>
                <span className={styles.rowName}>{referral.refereeName ?? "Invite link"}</span>
                <span className={styles.rowDate}>{formatDate(referral.createdAt)}</span>
              </div>
              <div className={styles.rowMeta}>
                {referral.status === "rewarded" && referral.rewardAmount && (
                  <span className={styles.rowReward}>+{formatCurrency(referral.rewardAmount)}</span>
                )}
                <span className={clsx(styles.statusChip, styles[`status_${referral.status}`])}>
                  {STATUS_LABEL[referral.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className={styles.loyaltyCard}>
        <span className={styles.sectionLabel}>Loyalty</span>
        <div className={styles.tierHeader}>
          <span className={clsx(styles.tierBadge, styles[`tier_${loyaltyAccount.tier}`])}>
            <Award size={15} strokeWidth={1.8} /> {currentTier?.label ?? loyaltyAccount.tier}
          </span>
          <div className={styles.pointsBody}>
            <span className={styles.pointsAvailable}>{loyaltyAccount.points.toLocaleString("en-IN")} pts available</span>
            <span className={styles.pointsLifetime}>
              {loyaltyAccount.lifetimePoints.toLocaleString("en-IN")} lifetime points
            </span>
          </div>
        </div>

        {nextTier ? (
          <CapacityMeter
            current={tierProgressCurrent}
            max={tierProgressMax}
            label={`${(nextTier.threshold - loyaltyAccount.lifetimePoints).toLocaleString("en-IN")} pts to ${nextTier.label}`}
            className={styles.tierMeter}
          />
        ) : (
          <p className={styles.topTierNote}>You&rsquo;ve reached the top tier — enjoy every perk.</p>
        )}

        <div className={styles.tierLadder}>
          {tiers.map((tier) => (
            <div
              key={tier.tier}
              className={clsx(
                styles.tierStep,
                tier.tier === loyaltyAccount.tier && styles.tierStepCurrent,
              )}
            >
              <span className={styles.tierStepLabel}>{tier.label}</span>
              <span className={styles.tierStepPerk}>{tier.perk}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className={styles.howCard}>
        <span className={styles.sectionLabel}>How it works</span>
        <ol className={styles.howList}>
          {howItWorks.map((step, index) => (
            <li key={step.title} className={styles.howStep}>
              <span className={styles.howIndex}>{index + 1}</span>
              <div>
                <div className={styles.howTitle}>{step.title}</div>
                <div className={styles.howDescription}>{step.description}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
