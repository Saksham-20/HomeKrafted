import { MealPlanEditorClient } from "@/components/seller/MealPlanEditorClient";

export interface SellerMealPlanEditPageProps {
  params: Promise<{ id: string }>;
}

/** `/seller/meal-plans/[id]` — edit a plan. The lookup is owner-scoped client state (see `MealPlanEditorClient`), so this just forwards the route param. */
export default async function SellerMealPlanEditPage({ params }: SellerMealPlanEditPageProps) {
  const { id } = await params;
  return <MealPlanEditorClient planId={id} />;
}
