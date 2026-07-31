import type { Metadata } from "next";
import { CartPageClient } from "@/components/cart/CartPageClient";

/**
 * Never indexable: a cart is per-visitor and has no content to rank.
 * `robots.ts` disallows the path too — this is the belt to that braces,
 * for a crawler arriving from an external link rather than by crawling.
 *
 * Server wrapper only, so this file can export `metadata` at all — the
 * screen itself is `"use client"` (see `CartPageClient`).
 */
export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return <CartPageClient />;
}
