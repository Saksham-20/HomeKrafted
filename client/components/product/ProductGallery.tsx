import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { ProductImage } from "@/lib/types";
import styles from "./ProductGallery.module.css";

export interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
}

/** Product detail gallery — main image + thumbnail row, ported from the prototype's sticky gallery column. */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [main, ...thumbs] = images.length > 0 ? images : [{ placeholder: productName, ratio: "1/1" }];

  return (
    <div className={styles.gallery}>
      <ImageSlot ratio={main.ratio} label={main.placeholder} />
      {thumbs.length > 0 && (
        <div className={styles.thumbRow}>
          {thumbs.slice(0, 4).map((thumb, index) => (
            <ImageSlot key={index} ratio="1/1" label={thumb.placeholder} shape="square" compact />
          ))}
        </div>
      )}
    </div>
  );
}
