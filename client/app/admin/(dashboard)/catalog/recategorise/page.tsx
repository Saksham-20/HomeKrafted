import { RecategoriseClient } from "@/components/admin/RecategoriseClient";

/**
 * `/admin/catalog/recategorise` (G1 §3.5) — proposals for where each live
 * gift belongs on the new department tree.
 *
 * Nothing is re-filed automatically: the rule proposes, an admin approves
 * one row at a time, and every row shows the words it matched on.
 */
export default function AdminRecategorisePage() {
  return <RecategoriseClient />;
}
