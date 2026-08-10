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
import { MealPlanForm } from "./MealPlanForm";
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
import type { Product, SellerMealPlan } from "@/lib/types";
import styles from "./MealPlanEditorClient.module.css";

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
 * The submit path has a real `catch` and an `aria-live` error region. The
 * three intake forms M19 fixed all had `try/finally` with no `catch`, so a
 * failed save re-enabled the button and said nothing; this is the same
 * shape of form and must not reintroduce it.
 */
export function MealPlanEditorClient({ planId }: MealPlanEditorClientProps) {
  const router = useRouter();
  const { ready, seller } = useAuth();
  const isEdit = Boolean(planId);

  const [values, setValues] = useState<MealPlanFormValues>(EMPTY_MEAL_PLAN_FORM);
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
            setValues(planToFormValues(plan));
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

  return (
    <div>
      <SellerPageHeader
        title={isEdit ? "Edit plan" : "New subscription plan"}
        subtitle={
          isEdit
            ? values.name
            : "Anything you'd cook on a repeat — a daily tiffin, a weekly thali, a monthly box."
        }
      />
      <ModerationNotice status={review.status} note={review.note} />

      <MealPlanForm
        values={values}
        onChange={setValues}
        listings={listings}
        brackets={brackets}
      />

      {/* `role="alert"` so a validation refusal is announced, not just shown. */}
      {error && (
        <p className={styles.error} role="alert" aria-live="polite">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create plan"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push("/seller/meal-plans")}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
