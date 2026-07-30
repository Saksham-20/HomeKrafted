/**
 * `/about` content — the brand story, mission, offerings and team.
 *
 * **Source of truth:** this is carried over from the live marketing site at
 * homekrafted.in (`/` and `/about-us/`), which this app replaces. Headings
 * and the story paragraphs are the site's own words, kept verbatim so the
 * brand voice survives the move; only the delivery-area line is updated,
 * because the old site listed template cities (Gurgaon/Mumbai/Delhi) it
 * never served while this build is explicitly Chandigarh tricity.
 *
 * Copy/config, like `site.ts` — not part of the Prisma-bound domain model.
 */

export interface AboutPillar {
  title: string;
  body: string;
}

export interface AboutOffering {
  title: string;
  body: string;
  /** Rendered muted with a "soon" chip — nothing links anywhere yet. */
  comingSoon?: boolean;
}

export interface TeamMember {
  name: string;
  role: string;
}

export interface AboutContent {
  eyebrow: string;
  title: string;
  lede: string;
  storyHeading: string;
  story: string[];
  missionHeading: string;
  mission: string;
  pillarsHeading: string;
  pillars: AboutPillar[];
  offeringsHeading: string;
  offerings: AboutOffering[];
  teamHeading: string;
  teamIntro: string;
  founder: TeamMember;
  team: TeamMember[];
  contactHeading: string;
  contactLine: string;
  city: string;
  phones: string[];
  email: string;
  instagram: { handle: string; href: string };
}

export const aboutContent: AboutContent = {
  eyebrow: "Our story",
  title: "A Revolution in Home-Cooked Goodness",
  lede: "Home-Crafted Delights, Delivered Fresh.",

  storyHeading: "What is Homekrafted?",
  story: [
    "Homekrafted is more than just a food delivery platform. We are a movement that supports home makers, bakers, and artists in transforming their passion into a thriving business.",
    "Homekrafted isn't your average food delivery service. We're a passionate team on a mission to bring healthy, delicious home-cooked meals to your doorstep.",
    "Missing the taste of home-cooked meals? Look no further. We bring back the coziness of home-cooked food to your doorstep — the ghar ka khaana, the pickles, the small-batch bakes — made this morning in a kitchen near you.",
  ],

  missionHeading: "Our mission",
  mission:
    "Founded by Harkanwar Singh, our mission is to create a platform that not only offers exceptional food but also uplifts home-based entrepreneurs, particularly women.",

  pillarsHeading: "What makes us different",
  pillars: [
    {
      title: "Healthy alternatives, not restaurant guilt",
      body: "Skip the restaurant guilt. We partner with incredibly talented home chefs to offer a wide array of healthy alternatives to typical takeout.",
    },
    {
      title: "More than a meal — an opportunity",
      body: "Homekrafted empowers home cooks to become micro-entrepreneurs, supporting their families and sharing their culinary passion.",
    },
    {
      title: "Safety first",
      body: "We prioritise food safety — all our partner kitchens are FSSAI registered.",
    },
    {
      title: "Made with love, delivered with care",
      body: "Experience the difference. Homekrafted delivers the comfort and taste of home, made with love and delivered with care.",
    },
  ],

  offeringsHeading: "What our HomeKrafters make",
  offerings: [
    {
      title: "Regional home cooking",
      body: "Himachali, Kashmiri and Rajasthani kitchens cooking the food they grew up on — not a restaurant's version of it.",
    },
    {
      title: "Snacks, sweets, chutneys & preserves",
      body: "Small-batch pickles, achar, laddoos and seasonal preserves, made in the quantities a home kitchen actually makes.",
    },
    {
      title: "Bulk orders & catering",
      body: "House parties, office lunches and family functions, cooked to a menu you set with the kitchen directly.",
    },
    {
      title: "Customisable menus",
      body: "Tell a HomeKrafter what you need and how much heat you can take. Home kitchens can do what a chain cannot.",
    },
    {
      title: "Handicrafts & art",
      body: "The same platform, opened up to the artists and makers in the tricity.",
      comingSoon: true,
    },
  ],

  teamHeading: "The team",
  teamIntro:
    "A small team in Mohali building for the home kitchens around us.",
  founder: { name: "Harkanwar Singh", role: "Founder & CEO" },
  team: [
    { name: "Lavya", role: "Innovation & Strategy Manager" },
    { name: "Rohan", role: "Innovation & Strategy Manager" },
    { name: "Jatin", role: "Research & Development Specialist" },
    { name: "Eklavya", role: "Creative Specialist" },
    { name: "Gurpreet Singh", role: "Chief Research Analyst" },
    { name: "Anjali Chabra", role: "Product Development Manager" },
    { name: "Garv", role: "Data Analyst" },
  ],

  contactHeading: "Talk to us",
  contactLine:
    "Cooking something worth sharing, or want us in your neighbourhood? We read everything.",
  city: "Mohali, Punjab — serving Chandigarh, Mohali, Panchkula & Zirakpur",
  phones: ["+91 74948 62979", "+91 90565 76683"],
  email: "support@homekrafted.in",
  instagram: { handle: "@_homekrafted", href: "https://instagram.com/_homekrafted" },
};
