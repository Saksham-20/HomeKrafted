import { redirect } from "next/navigation";

/**
 * `/cart` is `/checkout` now (owner, 2026-09-16).
 *
 * The two pages listed the same lines, and the cart's only unique job was
 * a button to the other one — a page load that asked for a decision and
 * gave nothing back. The basket is the first section of checkout now,
 * editable in place, so nothing is lost by arriving there directly.
 *
 * **A redirect, not a deletion.** `/cart` is in shared links, in the
 * header's basket icon on older cached pages, and in anything a buyer
 * bookmarked; a 404 there would read as a lost basket, which is the exact
 * fear this path is attached to.
 */
export default function CartPage() {
  redirect("/checkout");
}
