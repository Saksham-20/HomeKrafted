"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { AdminPageHeader } from "./AdminPageHeader";
import { CollectionsTabs } from "./CollectionsTabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getHomePromoBands, updateHomePromoBand } from "@/lib/api";
import type { HomePromoBandContent } from "@/lib/data";
import styles from "./HomePromoEditorClient.module.css";

/**
 * `/admin/collections/promo` (M11b) — edits the home page's two promo
 * bands (`lib/data/site.ts#homePromoBands`) via `updateHomePromoBand`
 * (`lib/api/admin.ts`) — real CMS wiring into the same data Home reads,
 * not a form that goes nowhere. Home (`app/page.tsx`) is a Server
 * Component though, so a save here (client-side) lands on Home's next
 * *server*-side fetch — in this mock, that's a real backend request in
 * M8, not necessarily visible in this same browser tab without one. See
 * `lib/api/admin.ts`'s "Catalog & review moderation" section header for
 * the full explanation of that boundary.
 */
export function HomePromoEditorClient() {
  const { ready, role } = useAuth();
  const [bands, setBands] = useState<HomePromoBandContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const list = await getHomePromoBands();
      if (cancelled) return;
      setBands(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  function patchBand(id: string, patch: Partial<HomePromoBandContent>) {
    setBands((current) => current.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function handleSave(band: HomePromoBandContent) {
    setSaving(band.id);
    setSaved(undefined);
    setError(null);
    try {
      await updateHomePromoBand(band.id, {
        eyebrow: band.eyebrow,
        title: band.title,
        description: band.description,
        ctaLabel: band.ctaLabel,
        ctaHref: band.ctaHref,
      });
      setSaved(band.id);
    } catch (err) {
      // Worse than silent: `setSaved(band.id)` ran unconditionally, so a
      // failed save still showed "Saved." — this is home-page copy, and an
      // admin would have walked away believing it had changed.
      setError(apiErrorMessage(err, "Couldn't save this band. Try again."));
    } finally {
      setSaving(undefined);
    }
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading promo content…</div>;
  }

  return (
    <div>
      <AdminPageHeader title="Collections" subtitle="Home page promo band copy." />
      <CollectionsTabs active="promo" />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.list}>
        {bands.map((band) => (
          <Card key={band.id} className={styles.card}>
            <span className={styles.cardTitle}>{band.id === "hamper" ? "Hamper band" : "Wallet band"} ({band.variant})</span>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Eyebrow</span>
                <input
                  className={styles.input}
                  value={band.eyebrow}
                  onChange={(event) => patchBand(band.id, { eyebrow: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>CTA label</span>
                <input
                  className={styles.input}
                  value={band.ctaLabel}
                  onChange={(event) => patchBand(band.id, { ctaLabel: event.target.value })}
                />
              </label>
              <label className={styles.fieldWide}>
                <span className={styles.label}>Title (use a line break for a 2-line title)</span>
                <input
                  className={styles.input}
                  value={band.title}
                  onChange={(event) => patchBand(band.id, { title: event.target.value })}
                />
              </label>
              <div className={styles.fieldWide}>
                <Textarea
                  label="Description"
                  value={band.description}
                  onChange={(event) => patchBand(band.id, { description: event.target.value })}
                />
              </div>
              <label className={styles.field}>
                <span className={styles.label}>CTA link</span>
                <input
                  className={styles.input}
                  value={band.ctaHref}
                  onChange={(event) => patchBand(band.id, { ctaHref: event.target.value })}
                />
              </label>
            </div>
            <div className={styles.actions}>
              <Button variant="primary" size="sm" onClick={() => handleSave(band)} disabled={saving === band.id}>
                {saving === band.id ? "Saving…" : "Save"}
              </Button>
              {saved === band.id && <span className={styles.savedNote}>Saved — live on the home page.</span>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
