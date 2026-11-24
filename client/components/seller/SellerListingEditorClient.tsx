"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { focusFirstError } from "@/components/portal/focus-first-error";
import { resolveFamily } from "@/lib/sell/listing-families";
import { Button } from "@/components/ui/Button";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { FormPage } from "@/components/portal/FormPage";
import { SaveBar } from "@/components/portal/SaveBar";
import { Notice } from "@/components/portal/Notice";
import { getVendorById } from "@/lib/api/vendors";
import { isVendorProfileComplete } from "@/lib/maker-portrait";
import { ModerationNotice } from "./ModerationNotice";
import { GuidedListingForm } from "./GuidedListingForm";
import { sellerTaxonomyActions } from "@/lib/taxonomy-actions";
import { SellerPageHeader } from "./SellerPageHeader";
import {
  EMPTY_LISTING_FORM,
  LISTING_FORM_SECTIONS,
  ListingForm,
  hasListingFormErrors,
  prepTimeMinsToFormValue,
  toSellerListingInput,
  validateListingForm,
  countListingFormErrors,
  firstListingErrorId,
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
    // Days for a craft listing, minutes for food — see `prepTimeMinsToFormValue`.
    prepTimeMins: prepTimeMinsToFormValue(product.prepTimeMins, product.kind ?? "food"),
    description: product.description,
    isPackaged: product.isPackaged,
    isHamper: product.isHamper ?? false,
    // All three absent read as what a pre-M20 listing was.
    kind: product.kind ?? "food",
    shippingScope: product.shippingScope ?? "local",
    isSnack: product.isSnack ?? false,
    cashbackPct: String(product.cashbackPct),
    tags: product.tags,
    // Every stored photo, in `sortOrder` (the mapper sorts) — seeding
    // only `images[0]` would drop the rest on the next save.
    imagePaths: product.images.map((image) => image.src).filter((src): src is string => Boolean(src)),
    weightRows: product.weightOptions.map((w) => ({
      sku: w.sku,
      label: w.label,
      price: String(w.price),
      mrp: String(w.mrp),
      stock: String(w.stock),
    })),
    defaultRowIndex,
    dimensions: product.dimensions ?? "",
    material: product.material ?? "",
    careInstructions: product.careInstructions ?? "",
    ingredients: product.ingredients ?? "",
    shelfLife: product.shelfLife ?? "",
    storageInstructions: product.storageInstructions ?? "",
    disclaimer: product.disclaimer ?? "",
    allergens: product.allergens ?? [],
    servingGuidance: product.servingGuidance ?? "",
    fulfillmentType: product.fulfillmentType ?? "fresh_nearby",
    fulfilment: product.fulfilment ?? "",
    isPersonalisable: product.isPersonalisable ?? false,
    personalisationPrompt: product.personalisationPrompt ?? "",
  };
}

/**
 * A copy of one of the maker's own listings, as a new one. Name and photos
 * are cleared (they are what makes it a different product), the sizes
 * lose their SKUs so the server mints new ones instead of colliding with
 * the original's, and its moderation history stays behind.
 */
function duplicateValues(product: Product): ListingFormValues {
  const values = productToFormValues(product);
  return {
    ...values,
    name: "",
    imagePaths: [],
    weightRows: values.weightRows.map((row) => ({ ...row, sku: undefined })),
  };
}

/*
  An unfinished new listing, kept in this browser until it is submitted.
  A stopgap for the server-side drafts GIFTING-REWORK §D6 plans: the camera
  app can push a phone browser's tab out of memory, and a reload used to
  lose every answer. Best-effort — storage may be blocked, so every access
  is guarded and the form works the same without it.
*/
const draftKey = (vendorId: string) => `hk:listing-draft:${vendorId}`;

function readDraft(vendorId: string): ListingFormValues | undefined {
  try {
    const raw = window.localStorage.getItem(draftKey(vendorId));
    // Spread over the empty form so a draft saved before a field existed still opens.
    return raw ? { ...EMPTY_LISTING_FORM, ...(JSON.parse(raw) as Partial<ListingFormValues>) } : undefined;
  } catch {
    return undefined;
  }
}

function writeDraft(vendorId: string, values: ListingFormValues | undefined) {
  try {
    if (values) window.localStorage.setItem(draftKey(vendorId), JSON.stringify(values));
    else window.localStorage.removeItem(draftKey(vendorId));
  } catch {
    // Storage full or blocked: the listing still saves normally.
  }
}

export interface SellerListingEditorClientProps {
  /** Present in edit mode (`/seller/listings/[id]`); absent for create (`/seller/listings/new`). */
  productId?: string;
  /** Create mode only: start from a copy of this listing (`/seller/listings/new?from=`). */
  duplicateFrom?: string;
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
export function SellerListingEditorClient({ productId, duplicateFrom }: SellerListingEditorClientProps) {
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
  const [profileWarning, setProfileWarning] = useState(false);
  /** Name of the listing this one was copied from, for the subtitle. */
  const [copiedFrom, setCopiedFrom] = useState<string | undefined>();
  const [restoredDraft, setRestoredDraft] = useState(false);
  /** Bumped by "Start fresh" so the forms drop their own local state too. */
  const [formEpoch, setFormEpoch] = useState(0);
  /** Only a plain new listing keeps a browser draft; an edit or a copy has its source. */
  const keepsDraft = !productId && !duplicateFrom;
  /**
   * Guided is the default for a *new* listing and the long form for an
   * edit. Somebody adding their first product is being asked to describe
   * something they have never described before; somebody editing one has
   * a specific field in mind and wants to see it, not walk four screens
   * to reach it.
   */
  // A copy arrives fully answered, so it opens on the one-page form where
  // every answer can be checked at once.
  const [guided, setGuided] = useState(!productId && !duplicateFrom);

  useEffect(() => {
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      const sourceId = productId ?? duplicateFrom;
      const [cats, occs, product, vendor] = await Promise.all([
        getCategories(),
        getOccasions(),
        sourceId ? getSellerListing(seller.vendorId!, sourceId) : Promise.resolve(undefined),
        getVendorById(seller.vendorId),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setOccasions(occs);
      if (vendor && !isVendorProfileComplete(vendor)) {
        setProfileWarning(true);
      }
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
      } else if (duplicateFrom) {
        // A copy whose source has gone is just a new listing, not an error.
        if (product) {
          setValues(duplicateValues(product));
          setCopiedFrom(product.name);
        }
      } else {
        const draft = readDraft(seller.vendorId!);
        if (draft && isDirty(EMPTY_LISTING_FORM, draft)) {
          setValues(draft);
          setRestoredDraft(true);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, productId, duplicateFrom]);

  // Every change to a new listing is kept until it is submitted.
  useEffect(() => {
    if (!keepsDraft || loading || !seller?.vendorId) return;
    writeDraft(seller.vendorId, isDirty(EMPTY_LISTING_FORM, valuesState) ? valuesState : undefined);
  }, [keepsDraft, loading, seller?.vendorId, valuesState]);

  /**
   * The product family for these values — what the form asks about, and
   * what the validator blocks on. Resolved from the category the maker
   * picked for THIS listing, so it follows the form rather than the
   * account: one kitchen listing a thali and a jar of pickle gets two
   * different sets of questions, which the account-level specialty tag
   * cannot express.
   */
  function familyOf(v: ListingFormValues) {
    return resolveFamily({
      kind: v.kind,
      categorySlug: categories.find((c) => c.id === v.categoryId)?.slug,
    });
  }

  function handleChange(next: ListingFormValues) {
    setValues(next);
    // A field that was refused clears its message the moment it is
    // touched — the message was about the value that is no longer there.
    if (hasListingFormErrors(fieldErrors)) setFieldErrors(validateListingForm(next, familyOf(next)));
  }

  async function handleSubmit(override?: ListingFormValues) {
    if (!seller?.vendorId) return;
    const values = override ?? valuesState;
    // `description` was missing from this list while the server requires
    // it, so submitting without one produced the raw class-validator
    // string "description must be longer than or equal to 1 characters" —
    // developer language, on the screen a home cook writes their first
    // listing on.
    const problems = validateListingForm(values, familyOf(values));
    if (hasListingFormErrors(problems)) {
      setFieldErrors(problems);
      /*
       * The count is derived, and the form is scrolled to the first
       * problem.
       *
       * This used to add up four hand-listed keys, so a listing failing
       * only on ingredients and shelf life — every food listing created
       * before the food-safety change, which is every food listing whose
       * price anybody edits — rendered "0 things are missing — they are
       * marked on the form". Nothing was marked, because neither field
       * passed an `error` prop, and both were labelled Optional.
       */
      const count = countListingFormErrors(problems);
      setError(
        count === 1
          ? "One thing needs fixing — we have taken you to it."
          : `${count} things need fixing — we have taken you to the first.`,
      );
      focusFirstError(firstListingErrorId(problems));
      return;
    }
    setFieldErrors({});
    setError(undefined);
    setSaving(true);
    const input = toSellerListingInput(values);
    try {
      if (isEdit && productId) {
        await updateSellerListing(seller.vendorId, productId, input);
        router.push("/seller/listings");
      } else {
        await createSellerListing(seller.vendorId, input);
        if (keepsDraft) writeDraft(seller.vendorId, undefined);
        router.push("/seller/listings?submitted=1");
      }
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
            : copiedFrom
              ? `A copy of “${copiedFrom}”. Give it its own name and photos, check the rest, and submit.`
              : guided
              ? "Four questions, and you are done."
              : "Everything about the product on one page."
        }
      />
      <ModerationNotice status={review.status} note={review.note} />

      {restoredDraft && (
        <Notice
          tone="info"
          title="We kept what you had started"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setValues(EMPTY_LISTING_FORM);
                setRestoredDraft(false);
                setFormEpoch((n) => n + 1);
                setFieldErrors({});
                setError(undefined);
              }}
            >
              Start fresh
            </Button>
          }
        >
          Your unfinished listing is filled back in, so you can carry on where you stopped.
        </Notice>
      )}

      {profileWarning && (
        <Notice
          tone="warning"
          title="Your shop profile is missing key details"
          actions={
            <Button variant="secondary" size="sm" onClick={() => router.push("/seller/profile")}>
              Edit profile
            </Button>
          }
        >
          Your storefront profile is missing an avatar photo or bio. Please complete your profile in Settings so buyers can trust your kitchen once your items are approved.
        </Notice>
      )}

      {guided ? (
        <GuidedListingForm
          key={formEpoch}
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
          submitLabel={isEdit ? "Save changes" : "Submit for review"}
        />
      ) : (
        <FormPage sections={LISTING_FORM_SECTIONS.map((s) => ({ ...s }))} navLabel="Sections">
          <ListingForm
            key={formEpoch}
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
            saveLabel={isEdit ? "Save changes" : "Submit for review"}
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
