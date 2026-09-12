/**
 * Canonical Homekrafted Support Channels & Policy Surface (P1-07).
 * Single authoritative source of truth for official contact and customer resolution.
 */

export interface SupportChannel {
  channel: string;
  label: string;
  target: string;
  hours: string;
  description: string;
}

export const CANONICAL_SUPPORT = {
  phone: {
    display: "+91 80 4718 2020",
    tel: "+918047182020",
    hours: "Mon–Sat, 9am–8pm IST",
  },
  whatsapp: {
    display: "+91 80 4718 2020",
    waUrl: "https://wa.me/918047182020",
    label: "WhatsApp Support",
  },
  email: {
    orders: "orders@homekrafted.in",
    sellers: "makers@homekrafted.in",
    general: "support@homekrafted.in",
  },
  policies: {
    freshFoodGuaranteeHours: 6,
    craftReturnWindowDays: 7,
    hygieneStandard: "FSSAI registered & verified home kitchen standards",
  },
} as const;

export const SUPPORT_CHANNELS: SupportChannel[] = [
  {
    channel: "orders",
    label: "Orders & Delivery Support",
    target: CANONICAL_SUPPORT.phone.tel,
    hours: CANONICAL_SUPPORT.phone.hours,
    description: "Questions about your active delivery, delivery delays, or kitchen preparation.",
  },
  {
    channel: "sellers",
    label: "HomeKrafter & Kitchen Partners",
    target: `mailto:${CANONICAL_SUPPORT.email.sellers}`,
    hours: CANONICAL_SUPPORT.phone.hours,
    description: "Kitchen onboarding, menu changes, capacity management, and seller payouts.",
  },
  {
    channel: "general",
    label: "General Enquiries & Feedback",
    target: `mailto:${CANONICAL_SUPPORT.email.general}`,
    hours: "24/7 (reply within 1 business day)",
    description: "Bulk orders, corporate gifting, partnerships, and suggestions.",
  },
];

