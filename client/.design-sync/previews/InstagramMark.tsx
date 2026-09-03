import { InstagramMark } from "homekrafted-web";

/** The brand glyph at the sizes the footer and profile rows use. */
export const Sizes = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "center", color: "var(--hk-ink)" }}>
    <InstagramMark size={16} />
    <InstagramMark size={24} />
    <InstagramMark size={32} />
  </div>
);

/** On the dark footer ground, where it actually sits. */
export const OnDark = () => (
  <div style={{ background: "var(--hk-pine-deep)", color: "var(--hk-footer-ink)", padding: 20, borderRadius: 16, display: "flex", gap: 16, alignItems: "center" }}>
    <InstagramMark size={20} />
    <span style={{ font: "500 14px/1.4 var(--hk-font-body)" }}>@homekrafted</span>
  </div>
);
