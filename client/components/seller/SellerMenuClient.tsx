"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SellerPageHeader } from "./SellerPageHeader";
import { SnackMenuRow } from "./SnackMenuRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { deleteSellerMenuItem, getSellerMenu } from "@/lib/api";
import type { Snack } from "@/lib/types";
import styles from "./SellerMenuClient.module.css";

/** `/seller/menu` (M10b, snack type) — this seller's `Snack`s as a list, edit/delete. Create lives at `/seller/menu/new`, edit at `/seller/menu/[id]` (both share `SnackMenuForm`). Mirrors `ListingsClient`'s shape for the maker Listings screen. */
export function SellerMenuClient() {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      const menu = await getSellerMenu(seller.id);
      if (cancelled) return;
      setSnacks(menu);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  async function handleDelete(snackId: string) {
    if (!seller) return;
    const snack = snacks.find((s) => s.id === snackId);
    if (!snack) return;
    if (!window.confirm(`Delete "${snack.name}"? This can't be undone.`)) return;
    await deleteSellerMenuItem(seller.id, snackId);
    setSnacks((current) => current.filter((s) => s.id !== snackId));
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading your menu…</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title="Menu"
        subtitle={`${snacks.length} snack${snacks.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/seller/menu/new")}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Add snack
          </Button>
        }
      />

      {snacks.length === 0 ? (
        <Card className={styles.empty}>No snacks yet — add your first one to start selling.</Card>
      ) : (
        <div className={styles.list}>
          {snacks.map((snack) => (
            <SnackMenuRow key={snack.id} snack={snack} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
