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
import type { ProductModerationStatus } from "@/lib/types";
import { SellerPageHeader } from "./SellerPageHeader";
import { MEAL_PLAN_FORM_SECTIONS, MealPlanForm } from "./MealPlanForm";
import { DayMenuEditor } from "./DayMenuEditor";
import {
  EMPTY_MEAL_PLAN_FORM,
  toMealPlanInput,
  validateMealPlan,
  type MealPlanFormValues,
} from "@/lib/meal-plans";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  createMyMealPlan,
  getMyMealPlans,
  getSellerListings,
  updateMyMealPlan,
} from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import type { Product, SellerMealPlan } from "@/lib/types";

function planToFormValues(plan: SellerMealPlan): MealPlanFormValues {
  return {
    name: plan.name,
    description: plan.description,
    // `mealType` absent is what makes a plan "something else" — the same
    // decision `mapMealPlan` makes when it resolves `slotName`.
    slotKind: plan.mealType ?? "other",
    slotLabel: plan.slotLabel ?? "",
    productId: plan.productId ?? "",
    diet: plan.diet,
    pricePerMeal: String(plan.pricePerMeal),
    servingSize: plan.servingSize ?? "",
    weeklyMenu: plan.weeklyMenu.join("\n"),
    imageSrc: plan.imageSrc ?? "",
    maxSubscribers: plan.maxSubscribers ? String(plan.maxSubscribers) : "",
    isActive: plan.isActive,
  };
}

export interface MealPlanEditorClientProps {
  /** Present in edit mode (`/seller/meal-plans/[id]`); absent for create. */
  planId?: string;
}

/**
 * Shared screen for `/seller/meal-plans/new` and `/seller/meal-plans/[id]`.
 *
 * Edit mode resolves the plan from the owner-scoped list rather than a
 * per-id endpoint — the list is already scoped to the caller's `sellerId`,
 * so a plan that isn't theirs simply isn't in it, and there is no id to
 * probe with.
 *
 * The submit path has a real `catch` and an `aria-live` error region (the
 * SaveBar's). The three intake forms M19 fixed all had `try/finally` with
 * no `catch`, so a failed save re-enabled the button and said nothing;
 * this is the same shape of form and must not reintroduce it.
 */
export function MealPlanEditorClient({ planId }: MealPlanEditorClientProps) {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const isEdit = Boolean(planId);

  const [values, setValues] = useState<MealPlanFormValues>(EMPTY_MEAL_PLAN_FORM);
  const [initialValues, setInitialValues] = useState<MealPlanFormValues | undefined>();
  const [listings, setListings] = useState<Product[]>([]);
  const [brackets, setBrackets] = useState<string[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [review, setReview] = useState<{ status?: ProductModerationStatus; note?: string }>({});
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      try {
        const [plans, myListings] = await Promise.all([
          planId ? getMyMealPlans() : Promise.resolve<SellerMealPlan[]>([]),
          seller.vendorId ? getSellerListings(seller.vendorId) : Promise.resolve<Product[]>([]),
        ]);
        if (cancelled) return;
        setListings(myListings);
        if (planId) {
          const plan = plans.find((p) => p.id === planId);
          if (plan) {
            const loaded = planToFormValues(plan);
            setValues(loaded);
            setInitialValues(loaded);
            setReview({ status: plan.moderationStatus, note: plan.moderationNote });
            setBrackets(plan.brackets);
          } else {
            setNotFound(true);
          }
        }
      } catch {
        if (!cancelled) setError("Couldn't load this page. Refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller, planId]);

  async function handleSubmit() {
    const invalid = validateMealPlan(values);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const input = toMealPlanInput(values);
      if (isEdit && planId) {
        await updateMyMealPlan(planId, input);
      } else {
        await createMyMealPlan(input);
      }
      router.push("/seller/meal-plans");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That didn't save. Check your connection and try again.",
      );
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return <RouteSkeleton variant="page" message={kitchenLoading("seller/meal-plan-editor", MAKER_LOADING)} />;
  }

  if (notFound) {
    return (
      <NotFoundCard
        title="We couldn’t find that meal plan"
        body="No plan of yours matches this id. It may have been removed since this link was made."
        backHref="/seller/meal-plans"
        backLabel="Back to meal plans"
      />
    );
  }

  const dirty = isEdit ? isDirty(initialValues, values) : true;

  return (
    <div>
      <SellerPageHeader
        back={{ href: "/seller/meal-plans", label: "Meal plans" }}
        title={isEdit ? "Edit plan" : "New subscription plan"}
        subtitle={
          isEdit
            ? values.name
            : "Anything you'd cook on a repeat — a daily tiffin, a weekly thali, a monthly box."
        }
      />
      <ModerationNotice status={review.status} note={review.note} />

      <FormPage sections={MEAL_PLAN_FORM_SECTIONS.map((s) => ({ ...s }))} navLabel="Sections">
        <MealPlanForm
          values={values}
          onChange={(next) => {
            setValues(next);
            if (error) setError(undefined);
          }}
          listings={listings}
          brackets={brackets}
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
                  setError(undefined);
                }
              : undefined
          }
          saveLabel={isEdit ? "Save changes" : "Create plan"}
          alwaysEnabled={!isEdit}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/seller/meal-plans")}
            disabled={saving}
          >
            Cancel
          </Button>
        </SaveBar>

        {/* M37 — dated menus save per-day, independently of the plan form
            above: changing one date's dal must not re-submit (and re-queue)
            the whole plan. Edit mode only: a plan that doesn't exist yet
            has no dates to set. */}
        {isEdit && planId && <DayMenuEditor planId={planId} />}
      </FormPage>
    </div>
  );
}
