/**
 * Emoji for the browse pages' category chips (M59b), keyed by slug —
 * the same visual language the owner's own homepage-category doc uses
 * ("🍲 Eat Homemade, 🥨 Snack Time"). Decoration only: rendered
 * `aria-hidden` beside the label, so a missing entry costs nothing and
 * a screen reader never hears it. Not product imagery — the no-invented
 * -imagery rule is about photographs of things for sale.
 */
export const CATEGORY_EMOJI: Record<string, string> = {
  // food shelves
  bakery: "🥐",
  chocolates: "🍫",
  chutneys: "🫙",
  cookies: "🍪",
  "dry-fruits": "🥜",
  hampers: "🧺",
  pickles: "🥭",
  snacks: "🍿",
  "sweets-ladoos": "🍬",
  breakfast: "🍳",
  "street-food": "🥟",
  beverages: "☕",
  "cakes-and-desserts": "🍰",
  combos: "🍱",
  "sunday-specials": "✨",
  "north-indian": "🍛",
  "south-indian": "🥘",
  bengali: "🐟",
  gujarati: "🥗",
  punjabi: "🌾",
  "indo-chinese": "🍜",
  "lunch-and-dinner": "🍽️",
  desserts: "🍨",
  "snacks-and-namkeen": "🥨",
  // gift shelves
  "candles-home": "🕯️",
  "handmade-jewellery": "💍",
  "art-prints": "🎨",
  "personalised-gifts": "💝",
  "handmade-gifts": "🎁",
  "home-decor": "🏺",
  flowers: "💐",
  "self-care": "🌿",
  "festive-gifts": "🪔",
};
