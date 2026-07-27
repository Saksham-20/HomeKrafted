"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatCard } from "./StatCard";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getWalletOverview, type AdminWalletOverview } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import styles from "./WalletOverviewClient.module.css";

/**
 * `/admin/wallet` (M11b) — platform-wide wallet oversight: total
 * liability across every seeded wallet, plus a per-user balance table
 * linking through to `/admin/wallet/[userId]` for that account's full
 * ledger + the refund/adjustment actions.
 */
export function WalletOverviewClient() {
  const { ready, role } = useAuth();
  const [overview, setOverview] = useState<AdminWalletOverview | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const snap = await getWalletOverview();
      if (cancelled) return;
      setOverview(snap);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  if (!ready || loading || !overview) {
    return <div className={styles.loading}>Loading wallet overview…</div>;
  }

  return (
    <div>
      <AdminPageHeader title="Wallet" subtitle="Platform-wide wallet liability and per-user balances." />

      <div className={styles.statGrid}>
        <StatCard label="Total liability" value={formatCurrency(overview.totalLiability)} hint={`${overview.walletCount} wallets`} />
        <StatCard label="Lifetime saved (all users)" value={formatCurrency(overview.totalLifetimeSaved)} />
        <StatCard label="Wallets" value={String(overview.walletCount)} />
      </div>

      <h2 className={styles.sectionTitle}>Balances</h2>
      <div className={styles.list}>
        {overview.balances.map((b) => (
          <Link key={b.userId} href={`/admin/wallet/${b.userId}`} className={styles.linkWrap}>
            <Card hoverable padding="sm" className={styles.row}>
              <div className={styles.body}>
                <span className={styles.name}>{b.userName}</span>
                <span className={styles.meta}>
                  {b.transactionCount} transaction{b.transactionCount === 1 ? "" : "s"} · {formatCurrency(b.lifetimeSaved)} lifetime saved
                </span>
              </div>
              <span className={styles.balance}>{formatCurrency(b.balance)}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
