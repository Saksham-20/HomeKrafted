import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { formatDate } from "@/lib/format";
import type { SellerApplication } from "@/lib/types";
import styles from "./ApplicationRow.module.css";

const CATEGORY_LABEL: Record<SellerApplication["category"], string> = {
  home_chef: "Home chef",
  maker: "Maker",
  baker: "Baker",
  artist: "Artist",
  other: "Other",
};

export interface ApplicationRowProps {
  application: SellerApplication;
  onApprove: (applicationId: string) => void;
  onReject: (applicationId: string) => void;
}

/** `/admin/sellers`'s approval-queue row — application details + approve/reject, the M7b `/sell` → M11a admin decision point. */
export function ApplicationRow({ application, onApprove, onReject }: ApplicationRowProps) {
  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.body}>
        <span className={styles.title}>{application.businessName}</span>
        <span className={styles.meta}>
          {CATEGORY_LABEL[application.category]} · {application.city} · {application.contactName} ·{" "}
          {formatDate(application.createdAt)}
        </span>
        {/*
          An out-of-area applicant is visible BEFORE the approve button,
          not discovered from its refusal. The server won't approve an area
          it can't resolve, so an admin needs to know that here.
          Rendered as plain text — `areaLabel` is free text from a public
          endpoint.
        */}
        {application.areaLabel && (
          <span className={styles.outOfArea}>
            Outside the tricity — applicant typed &ldquo;{application.areaLabel}&rdquo;. Assign a
            serviced area before approving.
          </span>
        )}
        <span className={styles.description}>{application.description}</span>
      </div>
      <span className={styles.badges}>
        <StatusPill status={application.status} />
      </span>
      <span className={styles.actions}>
        <Button variant="primary" size="sm" onClick={() => onApprove(application.id)}>
          Approve
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onReject(application.id)}>
          Reject
        </Button>
      </span>
    </Card>
  );
}
