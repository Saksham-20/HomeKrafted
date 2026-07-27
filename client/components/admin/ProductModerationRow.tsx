import Link from "next/link";
import clsx from "clsx";
import { Pencil, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { StatusPill } from "./StatusPill";
import { formatCurrency } from "@/lib/format";
import type { AdminProductSummary, ProductModerationAction } from "@/lib/api";
import styles from "./ProductModerationRow.module.css";

export interface ProductModerationRowProps {
  product: AdminProductSummary;
  onAction: (productId: string, action: ProductModerationAction) => void;
}

/** `/admin/catalog` row — thumbnail, name/vendor/category, price, moderation status pill, feature star, and the approve/hide/flag/feature actions + an edit link. */
export function ProductModerationRow({ product, onAction }: ProductModerationRowProps) {
  const status = product.moderationStatus ?? "active";
  const weight = product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ?? product.weightOptions[0];
  const image = product.images[0];

  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.thumb}>
        <ImageSlot ratio="1/1" label={image?.placeholder ?? product.name} src={image?.src} compact />
      </div>
      <div className={styles.body}>
        <span className={styles.name}>
          {product.name}
          {product.featured && (
            <Star size={13} strokeWidth={1.8} className={styles.featuredStar} aria-label="Featured on home" />
          )}
        </span>
        <span className={styles.meta}>
          {product.vendorName} · {product.categoryName}
        </span>
      </div>
      <span className={styles.price}>{weight ? formatCurrency(weight.price) : "—"}</span>
      <StatusPill status={status} className={styles.statusPill} />
      <div className={styles.actions}>
        {status !== "active" && (
          <Button variant="secondary" size="sm" onClick={() => onAction(product.id, "approve")}>
            Approve
          </Button>
        )}
        {status !== "hidden" && (
          <Button variant="secondary" size="sm" onClick={() => onAction(product.id, "hide")}>
            Take down
          </Button>
        )}
        {status !== "flagged" && (
          <Button variant="secondary" size="sm" onClick={() => onAction(product.id, "flag")}>
            Flag
          </Button>
        )}
        <Button
          variant={product.featured ? "secondary" : "ghost-gold"}
          size="sm"
          onClick={() => onAction(product.id, product.featured ? "unfeature" : "feature")}
        >
          {product.featured ? "Unfeature" : "Feature"}
        </Button>
        <Link
          href={`/admin/catalog/${product.id}`}
          className={clsx(styles.iconLink)}
          aria-label={`Edit ${product.name}`}
        >
          <Pencil size={15} strokeWidth={1.7} />
        </Link>
      </div>
    </Card>
  );
}
