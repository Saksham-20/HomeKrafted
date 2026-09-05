"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { FormPage } from "@/components/portal/FormPage";
import { SaveBar } from "@/components/portal/SaveBar";
import { ModerationNotice } from "./ModerationNotice";
import { GuidedListingForm } from "./GuidedListingForm";
import { sellerTaxonomyActions } from "@/lib/taxonomy-actions";
import { SellerPageHeader } from "./SellerPageHeader";
import {
  EMPTY_LISTING_FORM,
  LISTING_FORM_SECTIONS,
  ListingForm,
  hasListingFormErrors,
  toSellerListingInput,
  validateListingForm,
  type ListingFormErrors,
  type ListingFormValues,
} from "./ListingForm";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  createSellerListing,
  getCategories,
  getOccasions,
  getSellerListing,
  updateSellerListing,
} from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import type { Category, Occasion, Product } from "@/lib/types";
import styles from "./SellerListingEditorClient.module.css";

function productToFormValues(product: Product): ListingFormValues {
  const defaultRowIndex = Math.max(
    0,
    product.weightOptions.findIndex((w) => w.sku === product.defaultWeightSku),
  );
  return {
    name: product.name,
    categoryId: product.categoryId,
    categoryIds: product.categoryIds ?? [],
    occasionIds: product.occasionIds,
    dietary: product.dietary,
    // Blank when the listing has never been asked — see `parsePrepTime`.
    prepTimeMins: product.prepTimeMins === undefined ? "" : String(product.prepTimeMins),
    description: product.description,
    isPackaged: product.isPackaged,
    isHamper: product.isHamper ?? false,
    // All three absent read as what a pre-M20 listing was.
    kind: product.kind ?? "food",
    shippingScope: product.shippingScope ?? "local",
    isSnack: product.isSnack ?? false,
    cashbackPct: String(product.cashbackPct),
    tags: product.tags,
    imagePath: product.images[0]?.src ?? "",
    weightRows: product.weightOptions.map((w) => ({
      sku: w.sku,
      label: w.label,
      price: String(w.price),
      mrp: String(w.mrp),
      stock: String(w.stock),
    })),
    defaultRowIndex,
  };
}

export interface SellerListingEditorClientProps {
  /** Present in edit mode (`/seller/listings/[id]`); absent for create (`/seller/listings/new`). */
  productId?: string;
}

/**
 * Shared screen for `/seller/listings/new` and `/seller/listings/[id]` —
 * loads catalog reference data (+ the existing product, in edit mode),
 * then renders the guided flow or the long form and wires up
 * create/update.
 *
 * The long form sits in a `FormPage` with a jump-nav and a `SaveBar`
 * (2026-09-04). A refusal is now two things: the per-field message on
 * the field that needs it, and one sentence in the bar saying how many
 * there are — instead of one sentence at the bottom of a two-screen form
 * naming fields somebody then has to scroll up and find.
 */
export function SellerListingEditorClient({ productId }: SellerListingEditorClientProps) {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const isEdit = Boolean(productId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [valuesState, setValues] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  /** What an edit was loaded with — the SaveBar's baseline. */
  const [initialValues, setInitialValues] = useState<ListingFormValues | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [review, setReview] = useState<{
    status?: Product["moderationStatus"];
    note?: string;
  }>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<ListingFormErrors>({});
  /**
   * Guided is the default for a *new* listing and the long form for an
   * edit. Somebody adding their first product is being asked to describe
   * something they have never described before; somebody editing one has
   * a specific field in mind and wants to see it, not walk four screens
   * to reach it.
   */
  const [guided, setGuided] = useState(!productId);

  useEffect(() => {
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      const [cats, occs, product] = await Promise.all([
        getCategories(),
        getOccasions(),
        productId ? getSellerListing(seller.vendorId!, productId) : Promise.resolve(undefined),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setOccasions(occs);
      if (productId) {
        if (product) {
          const loaded = productToFormValues(product);
          setValues(loaded);
          setInitialValues(loaded);
          // Kept alongside the form values so the review banner can show
          // the admin's reason at the top of the screen — the one place
          // the HomeKrafter can act on it.
          setReview({ status: product.moderationStatus, note: product.moderationNote });
        } else {
          setNotFound(true);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, productId]);

  function handleChange(next: ListingFormValues) {
    setValues(next);
    // A field that was refused clears its message the moment it is
    // touched — the message was about the value that is no longer there.
    if (hasListingFormErrors(fieldErrors)) setFieldErrors(validateListingForm(next));
  }

  async function handleSubmit(override?: ListingFormValues) {
    if (!seller?.vendorId) return;
    const values = override ?? valuesState;
    // `description` was missing from this list while the server requires
    // it, so submitting without one produced the raw class-validator
    // string "description must be longer than or equal to 1 characters" —
    // developer language, on the screen a home cook writes their first
    // listing on.
    const problems = validateListingForm(values);
    if (hasListingFormErrors(problems)) {
      setFieldErrors(problems);
      const count =
        Number(Boolean(problems.name)) +
        Number(Boolean(problems.categoryId)) +
        Number(Boolean(problems.description)) +
        Object.keys(problems.weightRows ?? {}).length;
      setError(
        count === 1
          ? "One thing is missing — it is marked on the form."
          : `${count} things are missing — they are marked on the form.`,
      );
      return;
    }
    setFieldErrors({});
    setError(undefined);
    setSaving(true);
    const input = toSellerListingInput(values);
    try {
      if (isEdit && productId) {
        await updateSellerListing(seller.vendorId, productId, input);
      } else {
        await createSellerListing(seller.vendorId, input);
      }
      router.push("/seller/listings");
    } catch (err) {
      // There was no `try` here at all. A rejected save — a validation
      // refusal, a 403, a dropped connection — left the promise rejected,
      // so `setSaving(false)` never ran and the button sat on "Saving…"
      // forever with nothing said. A HomeKrafter writing up their first
      // listing would lose the lot.
      setError(apiErrorMessage(err, "Couldn't save this listing. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return <RouteSkeleton variant="page" message={kitchenLoading("seller/listing-editor", MAKER_LOADING)} />;
  }

  if (notFound) {
    return (
      <NotFoundCard
        title="We couldn’t find that listing"
        body="No listing of yours matches this id. It may have been removed, or the link may be from another account. Your other listings are unaffected."
        backHref="/seller/listings"
        backLabel="Back to listings"
      />
    );
  }

  // A create screen has no baseline, so its Save is always live; an edit
  // enables it only once something differs from what was loaded.
  const dirty = isEdit ? isDirty(initialValues, valuesState) : true;

  return (
    <div>
      <SellerPageHeader
        back={{ href: "/seller/listings", label: "Products" }}
        title={isEdit ? "Edit product" : "Add a product"}
        subtitle={
          isEdit
            ? valuesState.name
            : guided
              ? "Four questions, and you are done."
              : "Everything about the product on one page."
        }
      />
      <ModerationNotice status={review.status} note={review.note} />

      {guided ? (
        <GuidedListingForm
          values={valuesState}
          onChange={setValues}
          categories={categories}
          occasions={occasions}
          taxonomy={sellerTaxonomyActions}
          commission={seller?.commission}
          onSubmit={(finished) => void handleSubmit(finished)}
          saving={saving}
          error={error}
          onSwitchToFull={() => {
            setError(undefined);
            setGuided(false);
          }}
          submitLabel={isEdit ? "Save changes" : "Put it on my storefront"}
        />
      ) : (
        <FormPage sections={LISTING_FORM_SECTIONS.map((s) => ({ ...s }))} navLabel="Sections">
          <ListingForm
            values={valuesState}
            onChange={handleChange}
            categories={categories}
            occasions={occasions}
            taxonomy={sellerTaxonomyActions}
            commission={seller?.commission}
            errors={fieldErrors}
          />
          <SaveBar
            dirty={dirty}
            saving={saving}
            error={error}
            onSave={() => void handleSubmit()}
            onDiscard={
              isEdit && initialValues
                ? () => {
                    setValues(initialValues);
                    setFieldErrors({});
                    setError(undefined);
                  }
                : undefined
            }
            saveLabel={isEdit ? "Save changes" : "Create product"}
            alwaysEnabled={!isEdit}
          >
            <Button variant="secondary" size="sm" onClick={() => router.push("/seller/listings")} disabled={saving}>
              Cancel
            </Button>
          </SaveBar>
          {/* The way back. Somebody who switched to look for one field
              should not have to leave and re-enter to get the guided
              flow again — and both write the same values, so nothing is
              lost either way. */}
          {!isEdit && (
            <p className={styles.switchBack}>
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => setGuided(true)}
              >
                Take me through it question by question instead
              </button>
            </p>
          )}
        </FormPage>
      )}
    </div>
  );
}
