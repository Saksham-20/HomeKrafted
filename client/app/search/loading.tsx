import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";

/** Results are a card grid — matched so the field doesn't jump when they land. */
export default function SearchLoading() {
  return <RouteSkeleton variant="grid" count={6} label="Searching…" />;
}
