import { AuditClient } from "@/components/admin/AuditClient";

/**
 * `/admin/audit` (M27) — the admin audit trail.
 *
 * `GET /admin/audit` and the rows behind it have existed since M8; this
 * is the first screen that reads them. `docs/PRODUCTION-AUDIT.md` already
 * listed an audit log among the admin panel's features, which was not
 * true until this page.
 */
export default function AdminAuditPage() {
  return <AuditClient />;
}
