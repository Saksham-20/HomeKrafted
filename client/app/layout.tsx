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

export const metadata: Metadata = {
  title: "Homekrafted — Homemade, Handpicked",
  description:
    "Handmade gifts, homemade foods, laundry & cleaning, and home snacks — from real home kitchens and makers, delivered with care.",
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
                    <main>{children}</main>
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
