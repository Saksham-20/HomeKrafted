"use client";

import { useRouter } from "next/navigation";
import { CategoryTile } from "@/components/ui/CategoryTile";
import type { Category } from "@/lib/types";

export interface CategoryTileLinkProps {
  category: Category;
}

/** Client wrapper around `CategoryTile` — navigates to the Shop listing pre-filtered to this category via `?category=`. */
export function CategoryTileLink({ category }: CategoryTileLinkProps) {
  const router = useRouter();
  return (
    <CategoryTile
      category={category}
      onClick={() => router.push(`/shop?category=${category.slug}`)}
    />
  );
}
