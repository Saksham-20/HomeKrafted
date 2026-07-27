"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "./AdminPageHeader";
import { CollectionsTabs } from "./CollectionsTabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { getCollectionsAdmin, getOccasionsAdmin } from "@/lib/api";
import type { Collection, Occasion } from "@/lib/types";
import styles from "./CollectionsClient.module.css";

/** `/admin/collections` (M11b) — every occasion `Collection` (what `/collections/[occasion]` renders), create/edit links. */
export function CollectionsClient() {
  const router = useRouter();
  const { ready, role } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [list, occs] = await Promise.all([getCollectionsAdmin(), getOccasionsAdmin()]);
      if (cancelled) return;
      setCollections(list);
      setOccasions(occs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  if (!ready || loading) {
    return <div className={styles.loading}>Loading collections…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="Collections"
        subtitle={`${collections.length} occasion collection${collections.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/admin/collections/new")}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            New collection
          </Button>
        }
      />
      <CollectionsTabs active="collections" />

      {collections.length === 0 ? (
        <Card className={styles.empty}>No collections yet — create one to feature on `/collections/[occasion]`.</Card>
      ) : (
        <div className={styles.list}>
          {collections.map((c) => {
            const occasion = occasions.find((o) => o.id === c.occasionId);
            return (
              <Link key={c.id} href={`/admin/collections/${c.id}`} className={styles.linkWrap}>
                <Card hoverable padding="sm" className={styles.row}>
                  <div className={styles.body}>
                    <span className={styles.title}>{c.title}</span>
                    <span className={styles.meta}>
                      {occasion ? occasion.name : "No occasion"} · {c.productIds.length} product
                      {c.productIds.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
