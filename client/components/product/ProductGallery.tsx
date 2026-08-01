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
      {/* The one image on this page worth `priority`: it is the LCP
          element, and lazy-loading it delays the thing the visitor came
          for. The thumbnails below stay lazy. */}
      <ImageSlot
        ratio={main.ratio}
        label={main.placeholder}
        alt={productName}
        src={main.src}
        sizes="(max-width: 900px) 100vw, 560px"
        priority
      />
      {thumbs.length > 0 && (
        <div className={styles.thumbRow}>
          {thumbs.slice(0, 4).map((thumb, index) => (
            <ImageSlot
              key={index}
              ratio="1/1"
              label={thumb.placeholder}
              alt={`${productName} — photo ${index + 2}`}
              src={thumb.src}
              sizes="96px"
              shape="square"
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
