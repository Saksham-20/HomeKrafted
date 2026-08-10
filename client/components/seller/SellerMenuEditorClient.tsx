"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { ModerationNotice } from "./ModerationNotice";
import type { ProductModerationStatus } from "@/lib/types";
import { SellerPageHeader } from "./SellerPageHeader";
import {
  EMPTY_SNACK_FORM,
  SnackMenuForm,
  toSellerMenuInput,
  type SnackMenuFormValues,
} from "./SnackMenuForm";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  createSellerMenuItem,
  getSellerMenuItem,
  updateSellerMenuItem,
} from "@/lib/api";
import type { Snack } from "@/lib/types";
import styles from "./SellerMenuEditorClient.module.css";

function snackToFormValues(snack: Snack): SnackMenuFormValues {
  return {
    name: snack.name,
    description: snack.description,
    price: String(snack.price),
    category: snack.category,
    diet: snack.diet,
    imagePath: snack.imageSrc ?? "",
    available: snack.available,
  };
}

export interface SellerMenuEditorClientProps {
  /** Present in edit mode (`/seller/menu/[id]`); absent for create (`/seller/menu/new`). */
  snackId?: string;
}

/** Shared screen for `/seller/menu/new` and `/seller/menu/[id]` — loads the existing snack (in edit mode), then renders `SnackMenuForm` and wires up create/update. Mirrors `SellerListingEditorClient`'s shape for the maker Listings flow. */
export function SellerMenuEditorClient({ snackId }: SellerMenuEditorClientProps) {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const isEdit = Boolean(snackId);

  const [values, setValues] = useState<SnackMenuFormValues>(EMPTY_SNACK_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [review, setReview] = useState<{ status?: ProductModerationStatus; note?: string }>({});
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      if (snackId) {
        const snack = await getSellerMenuItem(seller.id, snackId);
        if (cancelled) return;
        if (snack) {
          setValues(snackToFormValues(snack));
          setReview({ status: snack.moderationStatus, note: snack.moderationNote });
        } else {
          setNotFound(true);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, snackId]);

  async function handleSubmit() {
    if (!seller) return;
    if (!values.name.trim() || !values.price.trim() || Number(values.price) <= 0) {
      setError("Fill in a snack name and a price above ₹0 before saving.");
      return;
    }
    setError(undefined);
    setSaving(true);
    const input = toSellerMenuInput(values);
    try {
      if (isEdit && snackId) {
        await updateSellerMenuItem(seller.id, snackId, input);
      } else {
        await createSellerMenuItem(seller.id, input);
      }
      router.push("/seller/menu");
    } catch (err) {
      // Same shape as the listing editor: with no `try`, a refused save
      // left the button on "Saving…" for good and the item unsaved.
      setError(apiErrorMessage(err, "Couldn't save this menu item. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return <RouteSkeleton variant="page" message={kitchenLoading("seller/menu-editor", MAKER_LOADING)} />;
  }

  if (notFound) {
    return (
      <NotFoundCard
        title="We couldn’t find that snack"
        body="No snack on your menu matches this id. It may have been removed since this link was made."
        backHref="/seller/menu"
        backLabel="Back to your menu"
      />
    );
  }

  return (
    <div>
      <SellerPageHeader
        title={isEdit ? "Edit snack" : "Add snack"}
        subtitle={isEdit ? values.name : "Add a new snack to your menu."}
      />
      <ModerationNotice status={review.status} note={review.note} />
      <SnackMenuForm values={values} onChange={setValues} />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add snack"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/seller/menu")} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
