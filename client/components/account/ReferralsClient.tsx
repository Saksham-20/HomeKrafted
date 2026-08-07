"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Award, Copy, Share2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CapacityMeter } from "@/components/ui/CapacityMeter";
import { getLoyaltyAccount, getReferralCode, getReferrals } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { LoyaltyAccount, Referral } from "@/lib/types";
import type { HowItWorksStep, LoyaltyTierInfo } from "@/lib/data";
import styles from "./ReferralsClient.module.css";

export interface ReferralsClientProps {
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
 * Referrals + loyalty (M7b; M8.4a real) — referral code with copy/share,
 * the list of invites, and the loyalty tier/points ladder.
 * `code`/referrals/`loyaltyAccount` are owner-scoped real reads, fetched
 * here on mount (same reasoning as `OrdersListClient` — see
 * `lib/auth/session.ts`'s file header) instead of server-fetched props;
 * `tiers`/`howItWorks`/`rewardAmount` stay static server-fetched props.
 *
 * **This screen moves no money** (2026-08-07 audit). It used to carry an
 * "Apply referral credit (demo)" button that credited ₹250 to the
 * caller's own wallet on click — see the comment where it used to be.
 */
export function ReferralsClient({ tiers, howItWorks, rewardAmount }: ReferralsClientProps) {
  const [code, setCode] = useState("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getReferralCode(), getReferrals(), getLoyaltyAccount()]).then(
      ([referralCode, myReferrals, loyalty]) => {
        if (cancelled) return;
        setCode(referralCode);
        setReferrals(myReferrals);
        setLoyaltyAccount(loyalty);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!loyaltyAccount) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading your referrals…</p>
      </div>
    );
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
          they join and their first order is delivered.
        </p>
        {toast && (
          <p className={styles.toast} role="status">
            {toast}
          </p>
        )}
      </Card>

      {/*
        The "See it in action / Apply referral credit (demo)" card is gone.

        It was a button on a live consumer screen that credited ₹250 of
        real wallet money on click, gated on nothing but a `Referral` row
        existing — a shopper granting themselves a wallet credit. It was
        labelled a demo and moved real money, which is precisely the shape
        `CLAUDE.md` (M17) already forbids: demo affordances do not belong
        on production screens.

        The reward now lands the way the copy above has always described
        it — the friend joins and their first order is delivered — and the
        credit is applied against that, not by a button here. See
        `ReferralsService.applyCredit`.
      */}

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
