"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/format";
import { createOccasion, getCollectionsAdmin, getOccasionsAdmin, getProducts, upsertCollection } from "@/lib/api";
import type { Occasion, Product } from "@/lib/types";
import styles from "./CollectionEditorClient.module.css";

export interface CollectionEditorClientProps {
  /** Present in edit mode (`/admin/collections/[id]`); absent for create (`/admin/collections/new`). */
  collectionId?: string;
}

/**
 * Shared create/edit screen for an occasion `Collection` — title,
 * description, occasion, and product membership. Membership order is
 * meaningful (it's the display order `/collections/[occasion]` renders),
 * so the row list has move-up/move-down controls rather than a plain
 * multi-select — that's the "reorder products" lever the M11b brief asks
 * for at the collection level.
 */
export function CollectionEditorClient({ collectionId }: CollectionEditorClientProps) {
  const router = useRouter();
  const { ready, role } = useAuth();
  const isEdit = Boolean(collectionId);

  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occasionId, setOccasionId] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [addProductId, setAddProductId] = useState("");
  // M16 (H8) — a collection is a browsable gift guide at `/guides/[slug]`
  // now, so it needs its own art and its own place in the running order.
  const [imageSrc, setImageSrc] = useState("");
  const [featured, setFeatured] = useState(false);
  /** Name of an occasion created from this screen, so the hint can say what it inherited. */
  const [newOccasion, setNewOccasion] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [occs, products, collections] = await Promise.all([
        getOccasionsAdmin(),
        getProducts(),
        collectionId ? getCollectionsAdmin() : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setOccasions(occs);
      setAllProducts(products);
      if (collectionId) {
        const existing = collections.find((c) => c.id === collectionId);
        if (existing) {
          setTitle(existing.title);
          setDescription(existing.description ?? "");
          setOccasionId(existing.occasionId ?? "");
          setProductIds(existing.productIds);
          setImageSrc(existing.imageSrc ?? "");
          setFeatured(Boolean(existing.featured));
          setSortOrder(String(existing.sortOrder ?? 0));
        } else {
          setNotFound(true);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, collectionId]);

  const occasionOptions: ComboboxOption[] = useMemo(
    () =>
      occasions.map((o) => ({
        value: o.id,
        label: o.name,
        hint: o.celebratedOn ? formatDate(o.celebratedOn) : "any time of year",
      })),
    [occasions],
  );

  const productById = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  const availableToAdd = useMemo(
    () => allProducts.filter((p) => !productIds.includes(p.id)),
    [allProducts, productIds],
  );

  function moveProduct(index: number, direction: -1 | 1) {
    const next = [...productIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setProductIds(next);
  }

  function removeProduct(id: string) {
    setProductIds((current) => current.filter((p) => p !== id));
  }

  function addProduct() {
    if (!addProductId || productIds.includes(addProductId)) return;
    setProductIds((current) => [...current, addProductId]);
    setAddProductId("");
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Give the collection a title.");
      return;
    }
    setError(undefined);
    setSaving(true);
    // The await was bare. `upsertCollection` rejects on any server refusal,
    // and an unhandled rejection here skipped `setSaving(false)` as well as
    // the navigation — so the button sat on "Saving…" for ever with nothing
    // said, which reads as a hung app rather than a rejected save. Same
    // shape as the M36 audit's finding about bare awaits on `lib/api`.
    try {
      await upsertCollection({
        id: collectionId,
        title: title.trim(),
        description: description.trim() || undefined,
        occasionId: occasionId || undefined,
        productIds,
        imageSrc: imageSrc.trim() || undefined,
        featured,
        sortOrder: Number.isNaN(Number(sortOrder)) ? 0 : Number(sortOrder),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save that. Try again.");
      return;
    } finally {
      setSaving(false);
    }
    router.push("/admin/collections");
  }

  if (!ready || loading) {
    return <RouteSkeleton variant="page" />;
  }

  if (notFound) {
    return (
      <NotFoundCard
        title="We couldn’t find that collection"
        body="No gift guide or occasion collection matches this id. It may have been deleted since this link was made."
        backHref="/admin/collections"
        backLabel="Back to collections"
      />
    );
  }

  return (
    <div>
      <Link href="/admin/collections" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to collections
      </Link>
      <AdminPageHeader title={isEdit ? "Edit collection" : "New collection"} subtitle={isEdit ? title : "A gift guide at /guides/[slug] — and the curated ordering behind its occasion page, if you attach one."} />

      <Card className={styles.card}>
        <div className={styles.grid}>
          <label className={styles.fieldWide}>
            <span className={styles.label}>Title</span>
            <input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Diwali Gifting Edit" />
          </label>
          <div className={styles.field}>
            {/*
              A searchable picker rather than a `<select>` (M43). The list
              is short today and gets one entry longer every festival
              somebody adds; a native select has nothing to type into, and
              on a phone it is an opaque wheel.

              `onCreate` is passed **here and not on the HomeKrafter's
              listing form** — occasions are a shared vocabulary, and one
              anybody can add to stops being one. The prop is the
              affordance; the gate is that the route lives under
              `/api/v1/admin`.
            */}
            <Combobox
              label="Occasion"
              placeholder="Search occasions…"
              value={occasionId ? [occasionId] : []}
              onChange={(next) => setOccasionId(next[0] ?? "")}
              options={occasionOptions}
              emptyMessage="No occasion by that name yet."
              createNoun="occasion"
              hint={
                newOccasion
                  ? `Added “${newOccasion}” with no date — it shows under “any time of year” until you set one on the Occasions tab.`
                  : "Optional. Leave empty for a standalone gift guide."
              }
              onCreate={async (name) => {
                const created = await createOccasion({ name });
                setOccasions((current) =>
                  [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
                );
                setNewOccasion(created.name);
                return { value: created.id, label: created.name };
              }}
            />
            {occasionId && (
              <button type="button" className={styles.clearOccasion} onClick={() => setOccasionId("")}>
                Clear occasion
              </button>
            )}
          </div>
          <label className={styles.field}>
            <span className={styles.label}>Running order</span>
            <input
              className={styles.input}
              inputMode="numeric"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
            <span className={styles.hint}>Lower shows first on the occasion hub. Ties break on title.</span>
          </label>
          <div className={styles.fieldWide}>
            {/*
              This was a text input labelled "Cover image path", with
              `/images/products/…` as its placeholder — a field that asked
              an operator to know where files live on a server and to type
              the path correctly, with no way to see whether they had. It
              was the last one of its kind in the product; every other
              image in the app has gone through `ImageUpload` since M14.
            */}
            <ImageUpload
              value={imageSrc}
              onChange={setImageSrc}
              purpose="collection"
              label="Cover image"
              hint="Shown on the occasion hub and at the top of the guide."
            />
          </div>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
            <span>Feature this guide on the occasion hub</span>
          </label>
          <div className={styles.fieldWide}>
            <Textarea
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A hand-picked edit of homemade favourites for…"
            />
          </div>
        </div>
      </Card>

      <Card className={styles.card}>
        <span className={styles.cardTitle}>Products ({productIds.length})</span>
        {productIds.length === 0 ? (
          <p className={styles.hint}>No products yet — add some below.</p>
        ) : (
          <div className={styles.productList}>
            {productIds.map((id, index) => {
              const product = productById.get(id);
              return (
                <div key={id} className={styles.productRow}>
                  <span className={styles.productName}>{product?.name ?? id}</span>
                  <div className={styles.productActions}>
                    <button
                      type="button"
                      className={styles.moveButton}
                      onClick={() => moveProduct(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${product?.name ?? id} up`}
                    >
                      <ChevronUp size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={styles.moveButton}
                      onClick={() => moveProduct(index, 1)}
                      disabled={index === productIds.length - 1}
                      aria-label={`Move ${product?.name ?? id} down`}
                    >
                      <ChevronDown size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => removeProduct(id)}
                      aria-label={`Remove ${product?.name ?? id}`}
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className={styles.addRow}>
          <select
            className={styles.select}
            aria-label="Select a product to add to this collection"
            value={addProductId}
            onChange={(event) => setAddProductId(event.target.value)}
          >
            <option value="">Select a product to add…</option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={addProduct} disabled={!addProductId}>
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            Add
          </Button>
        </div>
      </Card>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create collection"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/admin/collections")} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
