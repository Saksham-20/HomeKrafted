import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";

/** Admin routes are queue/table-shaped throughout. */
export default function AdminLoading() {
  return <RouteSkeleton variant="list" count={7} label="Loading…" />;
}
