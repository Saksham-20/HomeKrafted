import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";

/**
 * Admin routes are queue/table-shaped throughout.
 *
 * **No kitchen-diary copy here, deliberately** (M28). Every other
 * skeleton picked up a line from `lib/kitchen-copy.ts`; this one keeps
 * "Loading…". An admin is usually on these screens because something
 * needs deciding — an application waiting, a listing flagged, a refund —
 * and "letting the dough rest…" over a queue somebody's income is stuck
 * in reads as a product not taking the job seriously. Brand voice is for
 * the people being served, not the people working.
 */
export default function AdminLoading() {
  return <RouteSkeleton variant="list" count={7} label="Loading…" />;
}
