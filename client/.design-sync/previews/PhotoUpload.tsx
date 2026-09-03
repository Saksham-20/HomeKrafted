import { PhotoUpload } from "homekrafted-web";

const frame: React.CSSProperties = { width: 460 };

/* Stand-in images as inline data URIs: the bundle ships no photography, and a
   `/uploads/...` path would render as a broken image in a preview card. */
const PHOTOS = [
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2VmZWNlNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTU4IiBmb250LWZhbWlseT0ibW9ub3NwYWNlIiBmb250LXNpemU9IjIwIiBmaWxsPSIjNWI1MzQ2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5raXRjaGVuIDE8L3RleHQ+PC9zdmc+",
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2U4ZTRkYSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTU4IiBmb250LWZhbWlseT0ibW9ub3NwYWNlIiBmb250LXNpemU9IjIwIiBmaWxsPSIjNWI1MzQ2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5raXRjaGVuIDI8L3RleHQ+PC9zdmc+",
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YyZWZlOCIvPjx0ZXh0IHg9IjE1MCIgeT0iMTU4IiBmb250LWZhbWlseT0ibW9ub3NwYWNlIiBmb250LXNpemU9IjIwIiBmaWxsPSIjNWI1MzQ2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5raXRjaGVuIDM8L3RleHQ+PC9zdmc+",
];

/** An empty gallery — the tile a maker taps first. */
export const Empty = () => (
  <div style={frame}>
    <PhotoUpload
      photos={[]}
      onChange={() => {}}
      purpose="storefront"
      label="Photos of your kitchen"
      maxPhotos={6}
    />
  </div>
);

/** Three photos in, three slots left — with the remove affordance on each. */
export const WithPhotos = () => (
  <div style={frame}>
    <PhotoUpload
      photos={PHOTOS}
      onChange={() => {}}
      purpose="storefront"
      label="Photos of your kitchen"
      maxPhotos={6}
    />
  </div>
);
