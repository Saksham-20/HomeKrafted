"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SellerPageHeader } from "./SellerPageHeader";
import { SnackMenuRow } from "./SnackMenuRow";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, deleteSellerMenuItem, getSellerMenu } from "@/lib/api";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import type { Snack } from "@/lib/types";
import styles from "./SellerMenuClient.module.css";
import { Notice } from "@/components/portal/Notice";

/** `/seller/menu` (M10b, snack type) — this seller's `Snack`s as a list, edit/delete. Create lives at `/seller/menu/new`, edit at `/seller/menu/[id]` (both share `SnackMenuForm`). Mirrors `ListingsClient`'s shape for the maker Listings screen. */
export function SellerMenuClient() {
  const router = useRouter();
  const { seller, sellerDataReady } = useAuth();
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Fires as soon as we know a HomeKrafter is signed in: this screen's
  // read is JWT-scoped and ignores the `seller` record (`lib/api`), so
  // waiting for `GET /seller/me` was a round trip in front of a request
  // that never used its answer.
  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        const menu = await getSellerMenu(seller?.id ?? "");
        if (cancelled) return;
        setSnacks(menu);
      } catch (error) {
        if (cancelled) return;
        if (isForbidden(error)) {
          setUnavailable(true);
          return;
        }
        // A failed read is not an empty screen. Rethrowing here reached no
        // boundary (an effect's rejection is not a render error), so a
        // rate-limited fetch rendered the empty state over real data — the
        // M37 dashboard rule, applied to every list (2026-09-04).
        setLoadError(apiErrorMessage(error, "Couldn't load your snacks menu. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, seller, reloadToken]);

  /**
   * Two presses, both in our own type: the row's bin icon asks, and the
   * notice under the title does it. A `window.confirm` could not say that
   * the item comes off the shop straight away, and a bare `await` here
   * lost the server's refusal (2026-09-04).
   */
  async function handleDelete(snackId: string) {
    if (confirmDeleteId !== snackId) {
      setDeleteError(null);
      setConfirmDeleteId(snackId);
      return;
    }
    if (!seller) return;
    setDeleting(true);
    setDeleteError(null);
    try {
    await deleteSellerMenuItem(seller.id, snackId);
    setSnacks((current) => current.filter((s) => s.id !== snackId));
      setConfirmDeleteId(null);
    } catch (error) {
      setDeleteError(apiErrorMessage(error, "Couldn't delete that. Try again."));
    } finally {
      setDeleting(false);
    }
  }

  if (!sellerDataReady || loading) {
    return (
      <div>
        <SellerPageHeader title="Snacks menu" />
        <LoadingRows rows={4} showLabel label={kitchenLoading("seller/menu", MAKER_LOADING)} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <SellerPageHeader title="Snacks menu" />
        <Notice
          tone="danger"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                setReloadToken((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
  }

  if (unavailable) {
    return <ModuleUnavailable module="Menu" />;
  }

  const deleteTarget = confirmDeleteId ? snacks.find((item) => item.id === confirmDeleteId) : undefined;

  return (
    <div>
      <SellerPageHeader
        title="Snacks menu"
        subtitle={`${snacks.length} snack${snacks.length === 1 ? "" : "s"} · ordered over WhatsApp, not the cart`}
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/seller/menu/new")}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
      {deleteTarget && (
        <Notice
          tone="warning"
          title={`Delete “${deleteTarget.name}”?`}
          actions={
            <>
              <Button size="sm" onClick={() => handleDelete(deleteTarget.id)} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>
                Keep it
              </Button>
            </>
          }
        >
          It comes off the shop straight away and cannot be undone.
          {deleteError && <p role="alert">{deleteError}</p>}
        </Notice>
      )}
            Add a snack
          </Button>
        }
      />

      {snacks.length === 0 ? (
        <EmptyState
          title="No snacks on the menu yet."
          body="Snacks are ordered over WhatsApp — a buyer picks from this menu and the order lands in your chat. Add the first one; it takes a name, a price and a photo."
          action={{ href: "/seller/menu/new", label: "Add your first snack" }}
        />
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
