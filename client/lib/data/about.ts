/**
 * `/about` content — the brand story, mission, offerings and team.
 *
 * **Rewritten in M28; it is no longer the old marketing site's words.**
 * Until now this file carried the copy from homekrafted.in verbatim, on
 * the reasoning that the brand voice should survive the move. The 2026-08
 * brand review found that voice was the problem: "A Revolution in
 * Home-Cooked Goodness", "more than just a food delivery platform. We are
 * a movement", "Experience the difference" — lines that could sit on any
 * startup's page, on a site whose whole claim is that it is not
 * interchangeable.
 *
 * The rule for anything written here now: **say what actually happens.**
 * Who makes it, where, how long it takes. A sentence that would still be
 * true if you swapped "homemade food" for "enterprise software" is the
 * wrong sentence. Specifically avoid: revolution, movement, journey,
 * passion-into-business, "experience the difference", and any number
 * nobody can check.
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
  /**
   * What they actually do, in plain words. Not a corporate title — a team
   * of eight supporting home kitchens does not have a Chief Research
   * Analyst, and claiming one reads as either a much bigger company or a
   * much less serious one.
   */
  role: string;
  /**
   * A real photograph, once there is one. Absent, `ImageSlot` renders the
   * labelled placeholder — which is why the label must be the person's
   * **name** and never `"<name>.jpg"`: the placeholder prints its label,
   * so a filename-shaped label put the literal text "Lavya.jpg" on the
   * page where a face should be.
   */
  photoSrc?: string;
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
  title: "Someone's kitchen, not a cloud kitchen",
  lede: "Food cooked at home, by the person whose recipe it is.",

  storyHeading: "What is Homekrafted?",
  story: [
    "Homekrafted is a marketplace for things made at home. A HomeKrafter cooks or makes what they would make for their own family — in their own kitchen, in the quantity a home kitchen actually manages — and lists it here.",
    "That means small batches and real lead times. Mango is cut, salted and tempered the morning the thokku goes out. Laddoos are rolled by hand, a tray at a time. Nothing is cooked in advance and held in a freezer waiting for an order to arrive.",
    "It is slower than a restaurant, and slower than the cloud kitchen behind a delivery app. We show you that time rather than hiding it: the day something is made, and the day it reaches you.",
  ],

  missionHeading: "Our mission",
  mission:
    "Founded by Harkanwar Singh. The idea is narrow on purpose — people who already cook well at home, mostly women working from their own kitchens, should be able to sell it without first renting a commercial one.",

  pillarsHeading: "What makes us different",
  pillars: [
    {
      title: "A home kitchen, and we say whose",
      body: "Every listing names the kitchen it came from and the person who runs it. You can read their storefront before you order, which is the whole point of buying from a person instead of a brand.",
    },
    {
      title: "Made after you order, not before",
      body: "Most of what is sold here does not exist until someone buys it. That is why a jar takes a day or two and a full meal is cooked to a slot, rather than pulled off a shelf.",
    },
    {
      title: "Food licences, checked and shown",
      body: "HomeKrafters selling food give us their FSSAI registration when they apply. Once it has been checked, the storefront says so — and until then it doesn't, because a badge nobody verified is worse than no badge.",
    },
    {
      title: "The maker is paid for the work",
      body: "An order goes to one kitchen, not to a fulfilment queue. The person who cooked it is the person the money is for.",
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
      // Live since M20 — `/gifts`, in the nav, with its own catalogue.
      // The "soon" chip outlived the thing it was waiting for.
      title: "Handicrafts & art",
      body: "Candles, ceramics, prints and hand-poured soap from makers in the tricity — posted anywhere in India, since a craft gift does not need to be near you.",
    },
  ],

  teamHeading: "The team",
  teamIntro:
    "A small team in Mohali building for the home kitchens around us.",
  /*
   * Titles are the rank stripped off, not duties invented.
   *
   * These read "Chief Research Analyst" and "Innovation & Strategy
   * Manager" on a team of eight supporting home kitchens, which is the
   * org chart of a company that does not exist. The fix the brand review
   * asked for is a plain description of what each person actually does
   * ("Runs the kitchens", "Photographs the food") — and nobody here knows
   * that, so writing it would be inventing facts about named real people
   * to hit a tone. Instead: same domain, no rank. Replace these with the
   * real one-liners when someone who knows can supply them.
   */
  founder: { name: "Harkanwar Singh", role: "Founder" },
  team: [
    { name: "Lavya", role: "Strategy" },
    { name: "Rohan", role: "Strategy" },
    { name: "Jatin", role: "Research and development" },
    { name: "Eklavya", role: "Creative" },
    { name: "Gurpreet Singh", role: "Research" },
    { name: "Anjali Chabra", role: "Product" },
    { name: "Garv", role: "Data" },
  ],

  contactHeading: "Talk to us",
  contactLine:
    "Cooking something worth sharing, or want us in your neighbourhood? We read everything.",
  city: "Mohali, Punjab — serving Chandigarh, Mohali, Panchkula & Zirakpur",
  phones: ["+91 74948 62979", "+91 90565 76683"],
  email: "support@homekrafted.in",
  instagram: { handle: "@_homekrafted", href: "https://instagram.com/_homekrafted" },
};
