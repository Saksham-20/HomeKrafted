import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./PhotoUpload.module.css";

export interface PhotoUploadProps {
  /** Placeholder labels for already-added photos (matches `LaundryBooking.photos`). */
  photos?: string[];
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  maxPhotos?: number;
  label?: string;
  className?: string;
}

/**
 * Photo upload — dashed drop tile with a "+", ported from the hamper
 * basket's dashed "add more" tile (the closest prototype precedent;
 * components.md flags dry-clean photo upload as "spec'd, build in prod").
 * Already-added photos render as small `<ImageSlot>` thumbnails with a
 * remove affordance — no real photography, per the placeholders-only rule.
 */
export function PhotoUpload({
  photos = [],
  onAdd,
  onRemove,
  maxPhotos = 6,
  label = "Add photo",
  className,
}: PhotoUploadProps) {
  const canAddMore = photos.length < maxPhotos;

  return (
    <div className={clsx(styles.grid, className)}>
      {photos.map((photo, index) => (
        <div key={`${photo}-${index}`} className={styles.thumb}>
          <ImageSlot ratio="1/1" label={photo} compact />
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove?.(index)}
            aria-label={`Remove photo ${index + 1}`}
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      ))}
      {canAddMore && (
        <button type="button" className={styles.dropTile} onClick={onAdd}>
          <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className={styles.label}>{label}</span>
        </button>
      )}
    </div>
  );
}
