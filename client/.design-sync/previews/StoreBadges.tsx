import { StoreBadges } from "homekrafted-web";

/** Solid, for the light QR panel. */
export const Solid = () => <StoreBadges variant="solid" appStoreHref="#" playStoreHref="#" />;

/** Outline, which is meant for a dark surface — shown on one. */
export const OnDark = () => (
  <div style={{ background: "var(--hk-pine-deep)", padding: 20, borderRadius: 16, width: 320 }}>
    <StoreBadges variant="outline" appStoreHref="#" playStoreHref="#" />
  </div>
);
