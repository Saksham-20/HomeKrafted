"use client";

import { useRouter } from "next/navigation";
import { OccasionTile } from "@/components/ui/OccasionTile";
import type { Occasion } from "@/lib/types";

export interface OccasionTileLinkProps {
  occasion: Occasion;
}

/**
 * Client wrapper around `OccasionTile` (a `<button>` primitive) that
 * navigates to that occasion's collection page. Routes to
 * `/collections/[occasion]` rather than the prototype's undifferentiated
 * `goShop()` — a deliberate M2 extension now that Collections is a real
 * route, not just a demo screen switch (flagged for Opus in the M2 report).
 */
export function OccasionTileLink({ occasion }: OccasionTileLinkProps) {
  const router = useRouter();
  return <OccasionTile occasion={occasion} onClick={() => router.push(`/collections/${occasion.slug}`)} />;
}
