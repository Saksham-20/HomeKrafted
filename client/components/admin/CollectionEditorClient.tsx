"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getCollectionsAdmin, getOccasionsAdmin, getProducts, upsertCollection } from "@/lib/api";
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
    await upsertCollection({
      id: collectionId,
      title: title.trim(),
      description: description.trim() || undefined,
      occasionId: occasionId || undefined,
      productIds,
    });
    setSaving(false);
    router.push("/admin/collections");
  }

  if (!ready || loading) {
    return <div className={styles.loading}>Loading…</div>;
  }

  if (notFound) {
    return (
      <div>
        <Link href="/admin/collections" className={styles.back}>
          <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          Back to collections
        </Link>
        <Card className={styles.notFound}>Collection not found.</Card>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/collections" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to collections
      </Link>
      <AdminPageHeader title={isEdit ? "Edit collection" : "New collection"} subtitle={isEdit ? title : "Curate an occasion edit for /collections/[occasion]."} />

      <Card className={styles.card}>
        <div className={styles.grid}>
          <label className={styles.fieldWide}>
            <span className={styles.label}>Title</span>
            <input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Diwali Gifting Edit" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Occasion</span>
            <select className={styles.select} value={occasionId} onChange={(event) => setOccasionId(event.target.value)}>
              <option value="">No occasion</option>
              {occasions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
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
          <select className={styles.select} value={addProductId} onChange={(event) => setAddProductId(event.target.value)}>
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
