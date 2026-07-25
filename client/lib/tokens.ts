/**
 * Typed TS mirror of `handoff/design-system/tokens.json`.
 *
 * `styles/tokens.css` is the single source of truth for CSS custom
 * properties (`var(--hk-...)`) — components should reference those vars
 * directly in `*.module.css`. This file exists for the rare case where a
 * token value is needed in JS/TS (chart colours, inline SVG fills, canvas,
 * computed style logic, etc). Keep the two files in sync by hand; there is
 * no build-time generation step.
 */

export const tokens = {
  brand: {
    pine: "#234233",
    pineDeep: "#1B3327",
    pineGradA: "#2f5540",
    pineGradB: "#325a44",
    pineTint: "#EFF3EA",
    gold: "#B98724",
    goldBright: "#E4C874",
    goldTint: "#FBF1D6",
    goldBorder: "#E4CF8F",
    terracotta: "#B65D3C",
  },
  channel: {
    whatsapp: "#1FA855",
    whatsappDeep: "#128C3E",
    whatsappTint: "#F1F7F2",
    whatsappBorder: "#D3E6D9",
  },
  ink: {
    primary: "#2B241C",
    secondary: "#4A4335",
    body: "#5B5344",
    muted: "#8A8070",
    muted2: "#7A7568",
  },
  surface: {
    bg: "#F4F3F0",
    surface: "#FFFFFF",
    surface2: "#FBFBFA",
    surface3: "#F7F7F5",
  },
  line: {
    border: "#ECEAE4",
    border2: "#E5E2DA",
    divider: "#EFEDE7",
  },
  feedback: {
    success: "#3C6B47",
    successTint: "#E7F6EC",
  },
  font: {
    display: "'Fraunces', Georgia, serif",
    body: "'IBM Plex Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  type: {
    h1: { weight: 700, size: "34-58px", line: 1.04, family: "display" },
    h2: { weight: 600, size: "28px", line: 1.1, family: "display" },
    h3: { weight: 600, size: "24px", line: 1.08, family: "display" },
    cardTitle: { weight: 600, size: "17px", line: 1.15, family: "display" },
    body: { weight: 400, size: "15px", line: 1.6, family: "body" },
    small: { weight: 400, size: "13px", line: 1.5, family: "body" },
    eyebrow: {
      family: "mono",
      transform: "uppercase",
      letterSpacing: "0.12-0.22em",
      size: "11-12px",
    },
  },
  radius: {
    sm: "8px",
    md: "11px",
    lg: "16px",
    xl: "20px",
    pill: "999px",
  },
  space: {
    s1: "4px",
    s2: "8px",
    s3: "12px",
    s4: "16px",
    s5: "20px",
    s6: "26px",
    s7: "34px",
    s8: "44px",
  },
  shadow: {
    card: "0 14px 30px -18px rgba(35,66,51,.40)",
    stage: "0 30px 70px -30px rgba(27,51,39,.50)",
  },
  motion: {
    ease: "cubic-bezier(.2,.7,.2,1)",
    duration: "0.28s",
  },
  breakpoints: {
    mobile: "430px",
    desktop: "1180px",
  },
} as const;

export type Tokens = typeof tokens;
export type BrandToken = keyof Tokens["brand"];
export type ChannelToken = keyof Tokens["channel"];
export type RadiusToken = keyof Tokens["radius"];
export type SpaceToken = keyof Tokens["space"];

export default tokens;
