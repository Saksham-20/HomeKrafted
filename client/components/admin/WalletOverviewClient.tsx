"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
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

  if (!ready || (loading && !overview)) {
    return <div className={styles.loading}>Loading wallet overview…</div>;
  }
  if (!overview) {
    return <div className={styles.loading}>Loading wallet overview…</div>;
  }

  // There is one wallet per user, so this list grows with the whole
  // customer base. The totals above are platform-wide regardless of which
  // page is showing — they are aggregates, not a sum of these rows.
  const lastPage = overview.pageSize > 0 ? Math.max(1, Math.ceil(overview.total / overview.pageSize)) : 1;

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

      {lastPage > 1 && (
        <div className={styles.pager}>
          <Button
            variant="secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className={styles.pagerLabel} aria-live="polite">
            Page {page} of {lastPage}
          </span>
          <Button
            variant="secondary"
            disabled={page >= lastPage || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
