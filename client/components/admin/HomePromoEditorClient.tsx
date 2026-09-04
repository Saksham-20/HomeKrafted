"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, Input, TextArea } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { AdminPageHeader } from "./AdminPageHeader";
import { CollectionsTabs } from "./CollectionsTabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getHomePromoBands, updateHomePromoBand } from "@/lib/api";
import type { HomePromoBandContent } from "@/lib/data";
import { isDirty } from "@/lib/portal/dirty";
import styles from "./HomePromoEditorClient.module.css";

/**
 * `/admin/collections/promo` (M11b) — edits the home page's two promo
 * bands (`lib/data/site.ts#homePromoBands`) via `updateHomePromoBand`
 * (`lib/api/admin.ts`) — real CMS wiring into the same data Home reads,
 * not a form that goes nowhere. Home (`app/page.tsx`) is a Server
 * Component though, so a save here (client-side) lands on Home's next
 * *server*-side fetch — not necessarily visible in this same browser tab
 * without one.
 *
 * Each band saves on its own — they are two endpoints — so each section
 * carries its own Save, enabled only once that band has changed.
 */
export function HomePromoEditorClient() {
  const { ready, role } = useAuth();
  const [bands, setBands] = useState<HomePromoBandContent[]>([]);
  const [initial, setInitial] = useState<Record<string, HomePromoBandContent>>({});
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
      setInitial(Object.fromEntries(list.map((b) => [b.id, b])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  function patchBand(id: string, patch: Partial<HomePromoBandContent>) {
    setSaved(undefined);
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
      setInitial((current) => ({ ...current, [band.id]: band }));
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
    return (
      <div>
        <AdminPageHeader title="Home page bands" />
        <CollectionsTabs active="promo" />
        <LoadingRows rows={3} />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Home page bands"
        subtitle="The two promo bands on the home page. A save is live on the next visit to the home page."
      />
      <CollectionsTabs active="promo" />
      {error && <Notice tone="danger">{error}</Notice>}

      <div className={styles.list}>
        {bands.map((band) => {
          const dirty = isDirty(initial[band.id], band);
          return (
            <FormSection
              key={band.id}
              id={`band-${band.id}`}
              title={band.id === "hamper" ? "Hamper band" : "Wallet band"}
              description={`Rendered in the ${band.variant} style.`}
              status={dirty ? { label: "Unsaved changes", tone: "todo" } : undefined}
              footer={
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleSave(band)}
                    disabled={saving === band.id || !dirty}
                  >
                    {saving === band.id ? "Saving…" : "Save band"}
                  </Button>
                  {saved === band.id && !dirty && (
                    <span className={styles.savedNote} role="status">
                      Saved — live on the home page.
                    </span>
                  )}
                </div>
              }
            >
              <FieldGrid columns={2}>
                <Field label="Eyebrow" hint="The small line above the title.">
                  <Input
                    value={band.eyebrow}
                    maxLength={40}
                    onChange={(event) => patchBand(band.id, { eyebrow: event.target.value })}
                  />
                </Field>
                <Field label="Button label">
                  <Input
                    value={band.ctaLabel}
                    maxLength={40}
                    onChange={(event) => patchBand(band.id, { ctaLabel: event.target.value })}
                  />
                </Field>
                <Field label="Title" span="full" hint="Use a line break for a two-line title.">
                  <TextArea
                    value={band.title}
                    rows={2}
                    maxLength={120}
                    onChange={(event) => patchBand(band.id, { title: event.target.value })}
                  />
                </Field>
                <Field label="Description" span="full">
                  <TextArea
                    value={band.description}
                    rows={3}
                    autoGrow
                    maxLength={300}
                    onChange={(event) => patchBand(band.id, { description: event.target.value })}
                  />
                </Field>
                <Field label="Button link" hint="A path on this site, like /wallet.">
                  <Input
                    value={band.ctaHref}
                    onChange={(event) => patchBand(band.id, { ctaHref: event.target.value })}
                  />
                </Field>
              </FieldGrid>
            </FormSection>
          );
        })}
      </div>
    </div>
  );
}
