import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";

/** Grid-shaped placeholder — `/shop` is a card grid, so a stack of slabs would reflow badly when the real page lands. */
export default function ShopLoading() {
  return <RouteSkeleton variant="grid" count={8} label="Loading the marketplace…" />;
}
