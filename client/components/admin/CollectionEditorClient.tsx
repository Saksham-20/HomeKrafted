"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, Input, Select, Switch, TextArea } from "@/components/portal/Field";
import { FormPage } from "@/components/portal/FormPage";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SaveBar } from "@/components/portal/SaveBar";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/format";
import { createOccasion, getCollectionsAdmin, getOccasionsAdmin, getProducts, upsertCollection } from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import type { Occasion, Product } from "@/lib/types";
import styles from "./CollectionEditorClient.module.css";

export interface CollectionEditorClientProps {
  /** Present in edit mode (`/admin/collections/[id]`); absent for create (`/admin/collections/new`). */
  collectionId?: string;
}

interface GuideValues {
  title: string;
  description: string;
  occasionId: string;
  productIds: string[];
  imageSrc: string;
  featured: boolean;
  sortOrder: string;
}

const EMPTY_GUIDE: GuideValues = {
  title: "",
  description: "",
  occasionId: "",
  productIds: [],
  imageSrc: "",
  featured: false,
  sortOrder: "0",
};

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
  const [values, setValues] = useState<GuideValues>(EMPTY_GUIDE);
  const [initial, setInitial] = useState<GuideValues | undefined>(undefined);
  const [addProductId, setAddProductId] = useState("");
  /** Name of an occasion created from this screen, so the hint can say what it inherited. */
  const [newOccasion, setNewOccasion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);

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
          const loaded: GuideValues = {
            title: existing.title,
            description: existing.description ?? "",
            occasionId: existing.occasionId ?? "",
            productIds: existing.productIds,
            imageSrc: existing.imageSrc ?? "",
            featured: Boolean(existing.featured),
            sortOrder: String(existing.sortOrder ?? 0),
          };
          setValues(loaded);
          setInitial(loaded);
        } else {
          setNotFound(true);
        }
      } else {
        setInitial(EMPTY_GUIDE);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, collectionId]);

  function patch(next: Partial<GuideValues>) {
    setValues((current) => ({ ...current, ...next }));
  }

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
    () => allProducts.filter((p) => !values.productIds.includes(p.id)),
    [allProducts, values.productIds],
  );

  function moveProduct(index: number, direction: -1 | 1) {
    const next = [...values.productIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ productIds: next });
  }

  function removeProduct(id: string) {
    patch({ productIds: values.productIds.filter((p) => p !== id) });
  }

  function addProduct() {
    if (!addProductId || values.productIds.includes(addProductId)) return;
    patch({ productIds: [...values.productIds, addProductId] });
    setAddProductId("");
  }

  async function handleSubmit() {
    if (!values.title.trim()) {
      setTitleError("Give the collection a title.");
      document.getElementById("guide-basics")?.scrollIntoView({ block: "start" });
      return;
    }
    setTitleError(undefined);
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
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        occasionId: values.occasionId || undefined,
        productIds: values.productIds,
        imageSrc: values.imageSrc.trim() || undefined,
        featured: values.featured,
        sortOrder: Number.isNaN(Number(values.sortOrder)) ? 0 : Number(values.sortOrder),
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
    return (
      <div>
        <AdminPageHeader
          title={isEdit ? "Edit collection" : "New collection"}
          back={{ href: "/admin/collections", label: "Collections" }}
        />
        <LoadingRows rows={4} />
      </div>
    );
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

  const dirty = isDirty(initial, values);

  return (
    <div>
      <AdminPageHeader
        back={{ href: "/admin/collections", label: "Collections" }}
        eyebrow="Gift guide"
        title={isEdit ? values.title || "Edit collection" : "New collection"}
        subtitle="A gift guide at /guides/[slug] — and the curated ordering behind its occasion page, if you attach one."
      />

      <FormPage
        sections={[
          { id: "guide-basics", label: "The guide", todo: titleError ? 1 : 0 },
          { id: "guide-products", label: `Products (${values.productIds.length})` },
        ]}
        navLabel="On this page"
      >
        <FormSection id="guide-basics" title="The guide">
          <FieldGrid columns={2}>
            <Field label="Title" span="full" error={titleError}>
              <Input
                value={values.title}
                maxLength={80}
                onChange={(event) => {
                  patch({ title: event.target.value });
                  if (titleError) setTitleError(undefined);
                }}
                placeholder="e.g. Diwali Gifting Edit"
              />
            </Field>
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
                value={values.occasionId ? [values.occasionId] : []}
                onChange={(next) => patch({ occasionId: next[0] ?? "" })}
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
              {values.occasionId && (
                <button type="button" className={styles.clearOccasion} onClick={() => patch({ occasionId: "" })}>
                  Clear occasion
                </button>
              )}
            </div>
            <Field label="Running order" hint="Lower shows first on the occasion hub. Ties break on title.">
              <Input
                inputMode="numeric"
                value={values.sortOrder}
                onChange={(event) => patch({ sortOrder: event.target.value })}
              />
            </Field>
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
                value={values.imageSrc}
                onChange={(next) => patch({ imageSrc: next })}
                purpose="collection"
                label="Cover image"
                hint="Shown on the occasion hub and at the top of the guide."
              />
            </div>
            <Field label="Description" span="full" optional>
              <TextArea
                value={values.description}
                rows={3}
                autoGrow
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="A hand-picked edit of homemade favourites for…"
              />
            </Field>
          </FieldGrid>
          <Switch
            checked={values.featured}
            onChange={(next) => patch({ featured: next })}
            label="Feature this guide on the occasion hub"
            help="Featured guides lead the hub page for their occasion."
          />
        </FormSection>

        <FormSection
          id="guide-products"
          title={`Products (${values.productIds.length})`}
          description="In the order they appear on the guide. Move a row up or down to change it."
        >
          {values.productIds.length === 0 ? (
            <p className={styles.hint}>No products yet — add some below.</p>
          ) : (
            <div className={styles.productList}>
              {values.productIds.map((id, index) => {
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
                        disabled={index === values.productIds.length - 1}
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
            <Select
              dense
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
            </Select>
            <Button variant="secondary" size="sm" onClick={addProduct} disabled={!addProductId}>
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              Add
            </Button>
          </div>
        </FormSection>

        <SaveBar
          dirty={dirty}
          saving={saving}
          error={error}
          alwaysEnabled={!isEdit}
          onSave={handleSubmit}
          onDiscard={
            isEdit
              ? () => {
                  if (initial) setValues(initial);
                  setTitleError(undefined);
                  setError(undefined);
                }
              : undefined
          }
          saveLabel={isEdit ? "Save changes" : "Create collection"}
        >
          <Button variant="secondary" onClick={() => router.push("/admin/collections")} disabled={saving}>
            Cancel
          </Button>
        </SaveBar>
      </FormPage>
    </div>
  );
}
