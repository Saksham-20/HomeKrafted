import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { formatDate } from "@/lib/format";
import { SPECIALTY_LABELS, type Seller } from "@/lib/types";
import styles from "./ApplicationRow.module.css";

export interface SellerRowProps {
  seller: Seller;
  onToggleStatus: (sellerId: string, nextStatus: "approved" | "suspended") => void;
}

/** `/admin/sellers` row — displayName, specialties, status, rating (if any), suspend/reactivate. */
export function SellerRow({ seller, onToggleStatus }: SellerRowProps) {
  const suspended = seller.status === "suspended";
  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.body}>
        <span className={styles.title}>{seller.displayName}</span>
        <span className={styles.meta}>
          {seller.specialties.map((sp) => SPECIALTY_LABELS[sp]).join(" · ") || "HomeKrafter"} ·
          Since {formatDate(seller.createdAt)}
          {seller.rating ? ` · ★ ${seller.rating.toFixed(1)} (${seller.reviewCount ?? 0})` : ""}
        </span>
      </div>
      <span className={styles.badges}>
        <StatusPill status={seller.status} />
      </span>
      <span className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onToggleStatus(seller.id, suspended ? "approved" : "suspended")}
        >
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </span>
    </Card>
  );
}
