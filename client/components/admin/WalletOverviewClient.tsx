"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Pager } from "@/components/portal/Pager";
import { StatCard } from "./StatCard";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getWalletOverview, type AdminWalletOverview } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import styles from "./WalletOverviewClient.module.css";

/**
 * `/admin/wallet` (M11b) — platform-wide wallet oversight: total
 * liability across every wallet, plus a per-user balance table
 * linking through to `/admin/wallet/[userId]` for that account's full
 * ledger + the refund/adjustment actions.
 */
export function WalletOverviewClient() {
  const { ready, role } = useAuth();
  const [overview, setOverview] = useState<AdminWalletOverview | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const snap = await getWalletOverview(page);
      if (cancelled) return;
      setOverview(snap);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, page]);

  if (!ready || !overview) {
    return (
      <div>
        <AdminPageHeader title="Wallet" subtitle="Platform-wide wallet liability and per-user balances." />
        <LoadingRows rows={6} />
      </div>
    );
  }

  // There is one wallet per user, so this list grows with the whole
  // customer base. The totals above are platform-wide regardless of which
  // page is showing — they are aggregates, not a sum of these rows.
  const lastPage = overview.pageSize > 0 ? Math.max(1, Math.ceil(overview.total / overview.pageSize)) : 1;

  return (
    <div>
      <AdminPageHeader
        title="Wallet"
        subtitle="Platform-wide wallet liability and per-user balances. Open an account to refund or adjust it."
      />

      <div className={styles.statGrid}>
        <StatCard label="Total liability" value={formatCurrency(overview.totalLiability)} hint={`${overview.walletCount} wallets`} />
        <StatCard label="Lifetime saved (all users)" value={formatCurrency(overview.totalLifetimeSaved)} />
        <StatCard label="Wallets" value={String(overview.walletCount)} />
      </div>

      <h2 className={styles.sectionTitle}>Balances</h2>
      {overview.balances.length === 0 ? (
        <EmptyState title="No wallets yet." body="A wallet is created the first time an account earns cashback or tops up." />
      ) : (
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
      )}

      <Pager page={page} lastPage={lastPage} onChange={setPage} disabled={loading} />
    </div>
  );
}
