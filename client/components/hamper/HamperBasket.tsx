import { CapacityMeter } from "@/components/ui/CapacityMeter";
import { StickySummary, type StickySummaryLine } from "@/components/ui/StickySummary";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import styles from "./HamperBasket.module.css";

export interface HamperBasketLineItem {
  productId: string;
  name: string;
  price: number;
}

export interface HamperBasketProps {
  boxName: string;
  boxPrice: number;
  maxItems: number;
  lineItems: HamperBasketLineItem[];
  onRemove: (productId: string) => void;
  cashback: number;
  ctaLabel: string;
  ctaDisabled?: boolean;
  onCta: () => void;
  className?: string;
}

/**
 * Sticky hamper basket — ported from the prototype's aside (box name +
 * capacity fraction, gold-gradient track, dashed item rows with a ✕
 * remove, an "add N more" prompt, then Items/Box/Total lines and the
 * cashback footline). Composed from `StickySummary` (line items + totals
 * + CTA + cashback, one bordered card) with `CapacityMeter` slotted into
 * its `beforeLines` region — the M3 addition to that M1 primitive.
 */
export function HamperBasket({
  boxName,
  boxPrice,
  maxItems,
  lineItems,
  onRemove,
  cashback,
  ctaLabel,
  ctaDisabled,
  onCta,
  className,
}: HamperBasketProps) {
  const itemsTotal = lineItems.reduce((sum, item) => sum + item.price, 0);
  const total = itemsTotal + boxPrice;
  const remaining = maxItems - lineItems.length;

  const lines: StickySummaryLine[] = [
    ...lineItems.map((item) => ({
      label: (
        <span className={styles.itemRow}>
          <span className={styles.itemThumb} aria-hidden="true" />
          <span className={styles.itemName}>{item.name}</span>
        </span>
      ),
      value: (
        <span className={styles.itemValue}>
          {formatCurrency(item.price)}
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(item.productId)}
            aria-label={`Remove ${item.name} from hamper`}
          >
            ✕
          </button>
        </span>
      ),
    })),
    ...(remaining > 0
      ? [
          {
            label: (
              <span className={styles.prompt}>
                <span className={styles.promptIcon} aria-hidden="true">
                  +
                </span>
                <span>
                  Add {remaining} more to fill your box
                </span>
              </span>
            ),
            value: "",
          },
        ]
      : []),
    { label: `Items (${lineItems.length})`, value: formatCurrency(itemsTotal) },
    { label: `${boxName} Box`, value: formatCurrency(boxPrice) },
    { label: "Total", value: formatCurrency(total), emphasis: true },
  ];

  return (
    <StickySummary
      className={className}
      stickyOnMobile
      beforeLines={<CapacityMeter title={boxName} current={lineItems.length} max={maxItems} />}
      lines={lines}
      cashbackLabel={`Earn ${formatCurrency(cashback)} wallet cashback`}
    >
      <Button variant="primary" onClick={onCta} disabled={ctaDisabled}>
        {ctaLabel}
      </Button>
    </StickySummary>
  );
}
