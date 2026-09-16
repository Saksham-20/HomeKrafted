import { AttributesClient } from "@/components/admin/AttributesClient";

/**
 * `/admin/catalog/attributes` (G1) — what each shelf asks a maker.
 *
 * The screen exists so that adding a question to a shelf needs no deploy;
 * until G1 the question set was a hardcoded map in the client that had
 * already drifted from the database (docs/GIFTING-REWORK.md §4).
 */
export default function AdminAttributesPage() {
  return <AttributesClient />;
}
