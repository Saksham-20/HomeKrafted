import type { BrowseSortKey } from "@/lib/browse-params";
import type { Category, Product, Vendor } from "@/lib/types";

/**
 * One home kitchen, with the dishes it has live — the unit `/shop`
 * browses in since M51.
 *
 * **Why the food half is people-first and the gifting half is not.**
 * Ordering food is a decision about *who cooks it*: the same page of
 * pickle jars from five kitchens is five different hygiene standards,
 * five delivery radii and five people whose Sunday you are interrupting.
 * Every marketplace that sells cooked food this way — Swiggy, Zomato,
 * DoorDash — lists the kitchen first and the dish second, and it is not a
 * styling preference: a dish grid asks a buyer to trust a stranger they
 * are never shown. A candle is not that decision. `/gifts` stays a
 * product grid deliberately, and merging the two browse models would
 * throw away the only thing that makes the food half honest.
 *
 * Everything here is **derived from listings already fetched**. There is
 * no `GET /kitchens`, and adding one would duplicate the delivery-radius
 * filtering that `GET /products?lat&lng` already does correctly — the
 * products handed in are the ones that reach this buyer, so the kitchens
 * grouped out of them are the kitchens that can feed them. A kitchen with
 * nothing live simply does not appear, which is right on a page whose job
 * is "what can I eat tonight".
 */
export interface Kitchen {
  vendor: Vendor;
  /** This kitchen's listings out of the set handed in, best-rated first. */
  dishes: Product[];
  /**
   * Distance to the kitchen. Present only when the buyer's coordinates
   * were sent — absent means "we do not know where you are", never "far".
   */
  distanceKm?: number;
  distanceLabel?: string;
  /** Cheapest default option across `dishes`. */
  fromPrice?: number;
  /** Category names, most-listed first, at most three — "what they make". */
  makes: string[];
  /**
   * True only when **every** listing is vegetarian. A kitchen with one
   * untagged dish is not a veg kitchen, and claiming it is on a food
   * platform is the kind of wrong that reaches somebody's plate.
   */
  allVegetarian: boolean;
}

/**
 * The price a card shows: the default weight option's, not the cheapest.
 * Shared with the dish grid so a kitchen's "from ₹220" and the dish card
 * one click later cannot disagree.
 */
export function listingPrice(product: Product): number {
  const option =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
    product.weightOptions[0];
  return option?.price ?? 0;
}

/**
 * Group listings into kitchens.
 *
 * Pure, and it never reads the clock or the network — it runs in a Server
 * Component (the `/shop` header count) and again in the browser (the
 * filtered grid), and those two have to agree or hydration throws.
 */
export function buildKitchens(
  products: Product[],
  vendors: Vendor[],
  categories: Category[],
): Kitchen[] {
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const held = grouped.get(product.vendorId);
    if (held) held.push(product);
    else grouped.set(product.vendorId, [product]);
  }

  const kitchens: Kitchen[] = [];
  for (const [vendorId, dishes] of grouped) {
    const vendor = vendorById.get(vendorId);
    // A listing whose kitchen is missing from the vendor list is a data
    // fault, not a kitchen with no name — dropping it is better than
    // rendering a card headed "undefined".
    if (!vendor) continue;

    const sorted = [...dishes].sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.reviewCount - a.reviewCount;
    });

    const counts = new Map<string, number>();
    for (const dish of sorted) {
      counts.set(dish.categoryId, (counts.get(dish.categoryId) ?? 0) + 1);
    }
    const makes = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([categoryId]) => categoryName.get(categoryId))
      .filter((name): name is string => Boolean(name))
      .slice(0, 3);

    const withDistance = sorted.find((dish) => dish.distanceKm !== undefined);
    const prices = sorted.map(listingPrice).filter((price) => price > 0);

    kitchens.push({
      vendor,
      dishes: sorted,
      distanceKm: withDistance?.distanceKm,
      distanceLabel: withDistance?.distanceLabel,
      fromPrice: prices.length ? Math.min(...prices) : undefined,
      makes,
      allVegetarian: sorted.every((dish) => dish.dietary.includes("vegetarian")),
    });
  }

  return kitchens;
}

/**
 * Order kitchens for the grid.
 *
 * The sort keys are the listing page's own (`BrowseSortKey`) rather than
 * a second vocabulary, so switching between the kitchens and the dishes
 * view keeps the sort the visitor chose instead of silently resetting it.
 * A price sort reads the kitchen's cheapest dish; `nearest` puts unknown
 * distances last, because "we were not told where you are" is not the
 * same as "far away" and must not be sorted as if it were.
 */
export function sortKitchens(kitchens: Kitchen[], sort: BrowseSortKey): Kitchen[] {
  const list = [...kitchens];
  if (sort === "price-asc") {
    list.sort((a, b) => (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity));
  } else if (sort === "price-desc") {
    list.sort((a, b) => (b.fromPrice ?? -Infinity) - (a.fromPrice ?? -Infinity));
  } else if (sort === "nearest") {
    list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  } else {
    list.sort((a, b) => {
      if (b.vendor.rating !== a.vendor.rating) return b.vendor.rating - a.vendor.rating;
      return b.vendor.reviewCount - a.vendor.reviewCount;
    });
  }
  return list;
}
