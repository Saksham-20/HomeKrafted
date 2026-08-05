import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { getBuyerCoords } from "@/lib/location/server";
import { getMealPlans } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import styles from "./MealPlans.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Ghar Ka Khana — homemade meal plans",
  description:
    "Homemade meal subscriptions from tricity home kitchens. Pick your meals, your days and a 30-minute delivery window — breakfast, lunch or dinner, cooked fresh.",
  path: "/meal-plans",
});

/**
 * Rendered per request, and it has to be `force-dynamic` rather than a
 * short `revalidate`.
 *
 * This reads the `hk_loc` cookie, but `getBuyerCoords` catches the error
 * `cookies()` throws during a prerender and returns `undefined` — which
 * silently hides the per-visitor signal from Next and leaves the route
 * eligible for static export. The build then fetches the catalogue at build
 * time and fails outright when the API isn't up yet. `/hamper` carries the
 * same note for the same reason; this one reproduced it exactly.
 *
 * The second reason outlives the first: seat counts move as people
 * subscribe, and "3 seats left" frozen at build time is a lie.
 */
export const dynamic = "force-dynamic";

/**
 * `/meal-plans` — the catalogue of meal subscriptions.
 *
 * Server-rendered and reads the buyer's coords from the `hk_loc` cookie
 * via `getBuyerCoords`, the same way `/shop` and `/snacks` do. A Server
 * Component cannot read `localStorage`, and a listing page that forgets
 * this silently ignores the location filter (CLAUDE.md, M12).
 *
 * **No `loading.tsx` above this route**, here or on `[slug]`: a Suspense
 * boundary starts streaming the 200 before the body runs, so a later
 * `notFound()` cannot set the status and an unknown plan becomes a soft
 * 404. Measured in M15.
 */
export default async function MealPlansPage() {
  const coords = await getBuyerCoords();
  const plans = await getMealPlans({}, coords);

  return (
    <div className={clsx("container", styles.page)}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Everyday homemade meals</span>
        <h1 className={styles.title}>Ghar Ka Khana, Every Day</h1>
        <p className={styles.lede}>
          Homemade meal subscriptions for students, PGs, bachelors and working professionals.
          Pick your meals, your days and a 30-minute window — a home kitchen near you cooks
          the rest.
        </p>
        <ul className={styles.points}>
          <li>Pay once for the whole cycle — nothing charges you in the background.</li>
          <li>Skip a day and the meal is owed back to you, not lost.</li>
          <li>Pause when you travel. Cancel whenever.</li>
        </ul>
      </header>

      {plans.length === 0 ? (
        /*
          Empty is a real state, not an error: no kitchen near this buyer
          offers a plan yet. Say which of the two it is — a bare "no results"
          would read as a broken page on a route the home page links to.
        */
        <section className={styles.empty}>
          <h2 className={styles.emptyTitle}>No meal plans near you yet</h2>
          <p className={styles.emptyBody}>
            {coords
              ? "None of the kitchens delivering to your area have opened a meal plan yet. They're being added week by week — or browse everything else that's cooking today."
              : "Meal plans are just getting started. Check back shortly, or browse everything else that's cooking today."}
          </p>
          <Link href="/shop" className={styles.emptyCta}>
            Browse homemade food →
          </Link>
        </section>
      ) : (
        <section className={styles.grid}>
          {plans.map((plan) => (
            <article key={plan.id} className={styles.card}>
              <Link href={`/meal-plans/${plan.slug}`} className={styles.cardImage}>
                <ImageSlot
                  ratio="4/3"
                  label={plan.imagePlaceholder}
                  alt={`${plan.name} from ${plan.vendor?.name ?? "a home kitchen"}`}
                  src={plan.imageSrc}
                  sizes="(max-width: 780px) 100vw, 360px"
                />
              </Link>

              <div className={styles.cardBody}>
                <span className={styles.mealType}>
                  {plan.slotName} · {plan.diet === "veg" ? "Veg" : "Non-veg"}
                </span>
                <h2 className={styles.cardTitle}>
                  <Link href={`/meal-plans/${plan.slug}`}>{plan.name}</Link>
                </h2>
                {plan.vendor && (
                  <p className={styles.vendor}>
                    {plan.vendor.name}
                    {plan.distanceLabel ? ` · ${plan.distanceLabel}` : ""}
                  </p>
                )}
                {plan.servingSize && <p className={styles.serving}>{plan.servingSize}</p>}

                <div className={styles.cardFoot}>
                  <span className={styles.price}>
                    {formatCurrency(plan.pricePerMeal)}
                    {/* "per meal" is wrong on a monthly box. The unit
                        follows what the plan actually is. */}
                    <span className={styles.perMeal}>
                      {plan.mealType ? " / meal" : " / delivery"}
                    </span>
                  </span>
                  {/*
                    `seatsLeft === null` means the kitchen set no ceiling,
                    which is not the same as "no seats left" — rendering a
                    zero here would close a plan that is open.
                  */}
                  {plan.seatsLeft !== null && plan.seatsLeft <= 5 && (
                    <span className={styles.seats}>
                      {plan.seatsLeft === 0
                        ? "Full"
                        : `${plan.seatsLeft} seat${plan.seatsLeft === 1 ? "" : "s"} left`}
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
