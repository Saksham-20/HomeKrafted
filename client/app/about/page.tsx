import type { Metadata } from "next";
import { AboutClient } from "@/components/about/AboutClient";
import { getAboutContent } from "@/lib/api";

export const metadata: Metadata = {
  title: "About",
  description:
    "Homekrafted is more than just a food delivery platform. We are a movement that supports home makers, bakers, and artists in transforming their passion into a thriving business.",
};

/**
 * `/about` — brand story, mission, offerings, team and contact. Carried
 * over from the marketing site at homekrafted.in that this app replaces;
 * see `lib/data/about.ts` for what is verbatim and what was updated.
 */
export default async function AboutPage() {
  const content = await getAboutContent();
  return <AboutClient content={content} />;
}
