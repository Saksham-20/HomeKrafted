import clsx from "clsx";
import { BrushCleaning, Shirt, WashingMachine, Wind, type LucideIcon } from "lucide-react";
import type { LaundryService } from "@/lib/types";
import styles from "./ServiceCard.module.css";

export interface ServiceCardProps {
  service: LaundryService;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}

/**
 * The prototype uses emoji for these icons — design-system.md calls that
 * out as a temporary placeholder ("replace with line icons"), so this port
 * maps each service's `iconPlaceholder` to a lucide line icon instead.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  WASHER: WashingMachine,
  HANGER: Shirt,
  IRON: Wind,
  CLEANING: BrushCleaning,
};

/** Service card (laundry) — icon tile, name, per-unit price, selectable border. */
export function ServiceCard({
  service,
  selected = false,
  onSelect,
  className,
}: ServiceCardProps) {
  const Icon =
    (service.iconPlaceholder && ICON_MAP[service.iconPlaceholder]) ||
    WashingMachine;

  return (
    <button
      type="button"
      className={clsx(styles.card, selected && styles.selected, className)}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={styles.iconTile}>
        <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className={styles.name}>{service.name}</span>
      <span className={styles.desc}>{service.description}</span>
      <span className={styles.price}>{service.priceLabel}</span>
    </button>
  );
}
