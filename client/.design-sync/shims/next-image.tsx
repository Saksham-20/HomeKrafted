/* design-sync shim: next/image -> plain <img>. The DS previews render
   outside Next, where the real component needs the image-config context. */
import React from "react";

export interface ShimImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number | string;
  height?: number | string;
  sizes?: string;
  priority?: boolean;
  quality?: number;
}

export default function Image({
  fill,
  priority: _priority,
  quality: _quality,
  sizes: _sizes,
  style,
  ...rest
}: ShimImageProps) {
  const fillStyle: React.CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }
    : {};
  return <img {...rest} style={{ ...fillStyle, ...style }} />;
}
