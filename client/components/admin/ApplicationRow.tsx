import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { formatDate } from "@/lib/format";
import type { SellerApplication } from "@/lib/types";
import styles from "./ApplicationRow.module.css";

const CATEGORY_LABEL: Record<SellerApplication["category"], string> = {
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
