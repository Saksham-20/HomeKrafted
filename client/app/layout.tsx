import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/tokens.extend.css";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ConsumerChrome } from "@/components/layout/ConsumerChrome";
import { CartProvider } from "@/lib/cart/CartContext";
import { WalletProvider } from "@/lib/wallet/WalletContext";
import { WishlistProvider } from "@/lib/wishlist/WishlistContext";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { LocationProvider } from "@/lib/location/LocationContext";
import { LocationPrompt } from "@/components/location/LocationPrompt";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

// Fraunces (display/headings/prices) — 400-700 + italic, per the design system.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

// IBM Plex Sans (body/controls/nav) — 400/500/600.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

// IBM Plex Mono (eyebrows/meta/prices ticks) — 400/500.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
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
    "Handmade gifts, homemade foods, laundry & cleaning, and home snacks — from real home kitchens and makers, delivered with care.",
  applicationName: SITE_NAME,
  keywords: [
    "homemade gifts",
    "home kitchen food",
    "Chandigarh",
    "Mohali",
    "Panchkula",
    "homemade snacks",
    "gift hampers",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: SITE_URL,
    title: "Homekrafted — Homemade, Handpicked",
    description:
      "Handmade gifts, homemade foods, laundry & cleaning, and home snacks — from real home kitchens across the Chandigarh tricity.",
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
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        {/* First thing in the tab order (M16). A keyboard user landing on
            any page otherwise has to tab through the announcement bar,
            the whole header and the nav before reaching the content —
            on every page, every time. */}
        <a className="hk-skip-link" href="#main-content">
          Skip to content
        </a>
        <AuthProvider>
          {/* Outside the shopping providers: where the buyer is decides
            which kitchens can reach them, so cart/wishlist/wallet all
            read from it rather than the other way round. */}
          <LocationProvider>
            <WalletProvider>
              <CartProvider>
                <WishlistProvider>
                  <ConsumerChrome
                    announcementBar={<AnnouncementBar />}
                    header={<Header />}
                    footer={<Footer />}
                  >
                    {/* `tabIndex={-1}` so the skip link can actually move
                      focus here — a <main> isn't focusable otherwise, and
                      the link would scroll without moving the caret. */}
                    <main id="main-content" tabIndex={-1}>
                      {children}
                    </main>
                  </ConsumerChrome>
                  {/* Renders itself only on a first visit — see LocationPrompt. */}
                  <LocationPrompt />
                </WishlistProvider>
              </CartProvider>
            </WalletProvider>
          </LocationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
