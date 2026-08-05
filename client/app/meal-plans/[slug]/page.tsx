import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { MealPlanSubscribeClient } from "@/components/meals/MealPlanSubscribeClient";
import { getMealPlan } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import styles from "./MealPlanDetail.module.css";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const plan = await getMealPlan(slug);
  if (!plan) {
    return pageMetadata({
      title: "Meal plan not found",
      description: "This meal plan is no longer available.",
      path: `/meal-plans/${slug}`,
    });
  }

  return pageMetadata({
    title: `${plan.name} — ${plan.vendor?.name ?? "homemade meal plan"}`,
    description:
      plan.servingSize
        ? `${plan.description} ${plan.servingSize}. ${formatCurrency(plan.pricePerMeal)} per meal.`
        : plan.description,
    path: `/meal-plans/${plan.slug}`,
  });
}

/**
 * One meal plan, and the form that subscribes to it.
 *
 * The page itself is a Server Component so it can carry real metadata; the
 * subscribe form is a `"use client"` island beneath it, split the way
 * `Header` → `HeaderClient` is. A `"use client"` route file cannot export
 * `metadata` at all, and this route is public and indexable.
 *
 * **Nothing may add a `loading.tsx` above this route.** It can `notFound()`,
 * and a Suspense boundary would start streaming the 200 before the body
 * runs — the soft-404 measured in M15.
 */
export default async function MealPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const plan = await getMealPlan(slug);
  if (!plan) notFound();

  const isFull = plan.seatsLeft !== null && plan.seatsLeft <= 0;
  // A kitchen whose stated hours don't overlap the meal offers no windows.
  // That is a real configuration error rather than a bug here, and it has
  // to stop the form rather than render an empty picker.
  const hasBrackets = plan.brackets.length > 0;

  return (
    <div className={clsx("container", styles.page)}>
      <nav className={styles.crumbs}>
        <Link href="/meal-plans">Meal plans</Link>
        <span aria-hidden="true"> / </span>
        <span>{plan.name}</span>
      </nav>

      <div className={styles.grid}>
        <div className={styles.media}>
          <ImageSlot
            ratio="4/3"
            label={plan.imagePlaceholder}
            alt={`${plan.name} from ${plan.vendor?.name ?? "a home kitchen"}`}
            src={plan.imageSrc}
            sizes="(max-width: 900px) 100vw, 520px"
            priority
          />
        </div>

        <div className={styles.summary}>
          <span className={styles.mealType}>
            {plan.slotName} · {plan.diet === "veg" ? "Veg" : "Non-veg"}
          </span>
          <h1 className={styles.title}>{plan.name}</h1>

          {plan.vendor && (
            <p className={styles.vendor}>
              by{" "}
              <Link href={`/storefront/${plan.vendor.slug}`}>{plan.vendor.name}</Link>
              {plan.distanceLabel ? ` · ${plan.distanceLabel}` : ` · ${plan.vendor.area}`}
            </p>
          )}

          <p className={styles.description}>{plan.description}</p>
          {plan.servingSize && (
            <p className={styles.serving}>
              <strong>What you get:</strong> {plan.servingSize}
            </p>
          )}

          <p className={styles.price}>
            {formatCurrency(plan.pricePerMeal)}
            <span className={styles.perMeal}>
              {plan.mealType ? " per meal" : " per delivery"}
            </span>
          </p>

          {plan.seatsLeft !== null && (
            <p className={styles.seats}>
              {isFull
                ? `${plan.vendor?.name ?? "This kitchen"} is full right now.`
                : `${plan.seatsLeft} of ${plan.maxSubscribers} seats left.`}
            </p>
          )}
        </div>
      </div>

      {plan.weeklyMenu.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>A week on this plan</h2>
          <ul className={styles.menu}>
            {plan.weeklyMenu.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={styles.menuNote}>
            Home kitchens cook to what the market had that morning, so the rotation is a guide
            rather than a contract.
          </p>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Start your plan</h2>
        {isFull ? (
          <p className={styles.blocked}>
            This kitchen is at capacity. That limit is theirs, not ours — a home cook can only
            cook so much. Try another plan, or check back next week.
          </p>
        ) : !hasBrackets ? (
          <p className={styles.blocked}>
            {plan.vendor?.name ?? "This kitchen"} has not opened any {plan.slotName.toLowerCase()} delivery
            windows yet. Nothing can be scheduled until they do.
          </p>
        ) : (
          <MealPlanSubscribeClient plan={plan} />
        )}
      </section>
    </div>
  );
}
