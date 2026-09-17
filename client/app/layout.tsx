import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, IBM_Plex_Mono, Instrument_Serif, Kalam, Kaushan_Script } from "next/font/google";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/tokens.extend.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ConsumerChrome } from "@/components/layout/ConsumerChrome";
import { CartProvider } from "@/lib/cart/CartContext";
import { WalletProvider } from "@/lib/wallet/WalletContext";
import { WishlistProvider } from "@/lib/wishlist/WishlistContext";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { LocationProvider } from "@/lib/location/LocationContext";
import { LocationPrompt } from "@/components/location/LocationPrompt";
import { MobileOverflowDetector } from "@/components/debug/MobileOverflowDetector";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

// Fraunces (display/headings/prices) — the VARIABLE face + italic.
//
// It used to load four static instances. DESIGN.md's type direction asks
// for `SOFT 70-80, WONK 1` at display sizes (the `.hk-wonk` utility in
// globals.css), and `font-variation-settings` does nothing to a static
// instance — the axes only exist on the variable file. Naming an axis in
// `axes` requires dropping `weight`, which is also why the whole 100-900
// range is now available rather than four steps; `opsz` is deliberately
// left off so it keeps tracking the rendered size on its own.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});

// Hanken Grotesk (body/controls/nav) — 400/500/600. Replaced IBM Plex Sans
// on 2026-09-16 (DESIGN.md typography, phase 1): same neutrality, warmer
// counters, without Plex's institutional-SaaS voice. Same three weights, so
// nothing in the type ramp had to move.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hanken",
  display: "swap",
});

// IBM Plex Mono (eyebrows/meta/prices ticks) — 400/500.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Kalam (Indian Type Foundry) — the maker's hand, for annotations only:
// "Dadi's bestseller ->" beside a tile. DESIGN.md rations it hard — **max
// two per screen**, always decorative and `aria-hidden`, never carrying a
// fact that exists nowhere else. Use the `.hk-annotation` class rather
// than reaching for the variable, so the ration stays greppable. Single
// weight.
const kalam = Kalam({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-kalam",
  display: "swap",
});

// Instrument Serif — the home page's section headings only ("Bestsellers",
// "Someone you owe a present", ...), owner-requested as a deliberate
// departure from Fraunces there (2026-09-17). Not part of the shared type
// ramp: every other h1/h2 on the site stays on `--hk-font-display`. Single
// weight, has an italic if a section ever wants emphasis.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

// Kaushan Script — the hero's "to the world" brush line ONLY (owner-supplied
// hero design, 2026-08-13). Not part of the handoff type ramp; don't reach
// for it anywhere else without a design decision. Single weight.
const kaushan = Kaushan_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

/**
 * Site-wide defaults. `metadataBase` is what makes every route's
 * relative Open Graph image and canonical resolve to an absolute URL —
 * without it Next emits relative `og:image`s, which crawlers and social
 * unfurlers silently ignore.
 *
 * The title template lets each route set only its own name; anything
 * that wants a bare title (a product page, say) uses `title.absolute`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Homekrafted — Homemade, Handpicked",
    template: "%s — Homekrafted",
  },
  description:
    "Handmade gifts, homemade foods and home snacks — from real home kitchens and makers, delivered with care.",
  applicationName: SITE_NAME,
  keywords: [
    "homemade gifts",
    "home kitchen food",
    "homemade food delivery",
    "handcrafted gifts",
    "homemade snacks",
    "gift hampers",
    "artisanal food",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: SITE_URL,
    title: "Homekrafted — Homemade, Handpicked",
    description:
      "Handmade gifts, homemade foods and artisanal snacks — from real home kitchens and independent makers.",
    images: [{ url: "/images/site/hero-hamper.jpg" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hanken.variable} ${plexMono.variable} ${instrumentSerif.variable} ${kalam.variable} ${kaushan.variable}`}
    >
      <body>
        <AuthProvider>
          {/* Outside the shopping providers: where the buyer is decides
            which kitchens can reach them, so cart/wishlist/wallet all
            read from it rather than the other way round. */}
          <LocationProvider>
            <WalletProvider>
              <CartProvider>
                <WishlistProvider>
                  <ConsumerChrome header={<Header />} footer={<Footer />}>
                    {/* `tabIndex={-1}` so the skip link can actually move
                      focus here — a <main> isn't focusable otherwise, and
                      the link would scroll without moving the caret. */}
                    <main id="main-content" tabIndex={-1}>
                      {children}
                    </main>
                  </ConsumerChrome>
                  {/* Renders itself only on a first visit — see LocationPrompt. */}
                  <LocationPrompt />
                  <MobileOverflowDetector />
                </WishlistProvider>
              </CartProvider>
            </WalletProvider>
          </LocationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
