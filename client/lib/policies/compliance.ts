import type { PolicyDoc } from "./types";
import { h2, lines, officer, p, ul } from "./types";

/**
 * The compliance documents (footer column "Compliance"), in footer order.
 * Client-reviewed wording — see `types.ts` before editing a sentence.
 */
export const COMPLIANCE_POLICIES: readonly PolicyDoc[] = [
  {
    slug: "grievance-redressal",
    path: "/grievance-redressal",
    title: "Grievance Redressal Policy",
    footerLabel: "Grievance Redressal",
    description:
      "How customers, sellers and other users can raise a complaint with Homekrafted, and who to write to.",
    group: "compliance",
    showsBusinessDetails: true,
    lead: "Homekrafted is committed to providing a transparent mechanism for customers, sellers and other users to raise concerns relating to products, services, orders, payments, deliveries or use of the platform.",
    blocks: [
      h2("Grievance Officer"),
      officer(),

      h2("How to Submit a Grievance"),
      p("A grievance may be submitted by email with:"),
      ul(
        "Name of complainant",
        "Order number, where applicable",
        "Registered mobile/email",
        "Description of the issue",
        "Supporting photographs/documents, where applicable",
        "Desired resolution",
      ),
      p(
        "Upon receiving a grievance, Homekrafted will provide an acknowledgement and process the complaint in accordance with applicable law and its internal grievance procedures.",
      ),
      p("We may request additional information where required to investigate the matter."),
      p(
        "Where a grievance concerns an independent seller, Homekrafted may coordinate with the relevant seller to investigate and resolve the issue.",
      ),
      p("Nothing in this policy limits any rights available to consumers under applicable law."),
      p(
        "For consumer grievances, the National Consumer Helpline operated by the Department of Consumer Affairs can also be accessed at 1915.",
      ),
      lines("Email: {{grievanceEmail}}"),
    ],
  },
  {
    slug: "food-safety",
    path: "/food-safety",
    title: "Food Safety & Food Disclaimer",
    footerLabel: "Food Safety",
    description:
      "Food-safety responsibilities of independent sellers, allergy guidance for customers, and how to report a food-quality concern.",
    group: "compliance",
    lead: "Homekrafted provides a platform through which independent home entrepreneurs and food businesses may offer homemade and prepared food products.",
    blocks: [
      p("Food products listed on Homekrafted may be prepared by independent sellers at their respective premises."),

      h2("Seller Responsibility"),
      p(
        "Each food seller is responsible for complying with applicable food-safety laws, licensing/registration requirements, hygiene standards, labelling requirements and other applicable regulations.",
      ),

      h2("Allergies"),
      p("Customers should carefully review available ingredient and allergen information before ordering."),
      p(
        "If you have a serious food allergy or dietary restriction, contact the seller/Homekrafted before placing an order where necessary.",
      ),
      p(
        "Homekrafted does not guarantee that a food preparation environment is completely free from cross-contact with allergens unless specifically stated.",
      ),

      h2("Product Variations"),
      p("Because many products are handmade or homemade:"),
      ul(
        "Appearance may vary slightly;",
        "Portion sizes may have reasonable variations;",
        "Colour may vary from photographs;",
        "Packaging may vary;",
        "Ingredients may be substituted where permitted and appropriately communicated.",
      ),

      h2("Storage"),
      p("Customers should follow the storage and consumption instructions supplied with the product."),
      p("Perishable food should be consumed within the recommended period."),

      h2("Complaints"),
      p("Any suspected food-quality or food-safety issue should be reported immediately to Homekrafted."),
      lines("Email: {{supportEmail}}"),
    ],
  },
  {
    slug: "epr-compliance",
    path: "/epr-compliance",
    title: "EPR Compliance",
    footerLabel: "EPR Compliance",
    description:
      "Homekrafted's approach to packaging, waste management and Extended Producer Responsibility obligations.",
    group: "compliance",
    lead: `Homekrafted is committed to responsible packaging and waste-management practices and seeks to comply with applicable environmental laws and Extended Producer Responsibility ("EPR") requirements.`,
    blocks: [
      p(
        "Where applicable, Homekrafted and/or relevant sellers, manufacturers, importers or brand owners shall comply with the requirements applicable to their respective role under the relevant environmental regulations.",
      ),
      p(
        "For products involving plastic packaging, the applicable responsibilities may depend upon the nature of the packaging, the entity placing the product/packaging on the market and the applicable regulatory framework.",
      ),
      p("Homekrafted encourages sellers and business partners to:"),
      ul(
        "Minimise unnecessary packaging;",
        "Prefer recyclable/reusable packaging where reasonably possible;",
        "Avoid prohibited single-use plastic items;",
        "Maintain appropriate packaging records where applicable;",
        "Use authorised waste-management/recycling channels where required; and",
        "Obtain and maintain applicable registrations or authorisations where legally required.",
      ),
      p(
        "Where Homekrafted is required to register under an applicable EPR framework, the relevant registration and compliance information will be maintained and updated accordingly.",
      ),
      p(
        "For regulatory information, users may refer to the Central Pollution Control Board's applicable EPR framework and portals.",
      ),
    ],
  },
  {
    slug: "website-disclaimer",
    path: "/website-disclaimer",
    title: "Website Disclaimer",
    footerLabel: "Website Disclaimer",
    description:
      "What the information on Homekrafted is and is not, including seller-provided content, product images, external links and availability.",
    group: "compliance",
    lead: "The information provided on Homekrafted is intended for general informational and commercial purposes.",
    blocks: [
      p(
        "Homekrafted makes reasonable efforts to keep information on the platform accurate and current. However, product descriptions, photographs, prices, availability and other information may be provided or updated by independent sellers.",
      ),
      p(
        "Accordingly, Homekrafted does not warrant that every piece of information displayed on the platform will always be complete, accurate or error-free.",
      ),

      h2("Seller-Provided Content"),
      p("Certain information is provided directly by sellers."),
      p("Sellers are responsible for the accuracy and legality of their product listings and claims."),

      h2("Product Images"),
      p(
        "Product images are intended to provide a representation of products. Actual products may vary slightly in colour, appearance, size or packaging, particularly where products are handmade or homemade.",
      ),

      h2("External Links"),
      p("Homekrafted may provide links to third-party websites or services."),
      p(
        "Homekrafted does not control those websites and is not responsible for their content, privacy policies or practices.",
      ),

      h2("Availability"),
      p("Products and services displayed on Homekrafted may not always be available."),
      p("Homekrafted may modify, suspend or discontinue features or listings subject to applicable law."),

      h2("No Waiver of Consumer Rights"),
      p(
        "Nothing on this website is intended to exclude or restrict any consumer right or remedy that cannot legally be excluded or restricted.",
      ),
    ],
  },
  {
    slug: "promotional-offers",
    path: "/promotional-offers",
    title: "Promotional Offers Policy",
    footerLabel: "Promotional Offers Policy",
    description:
      "The kinds of terms that can apply to Homekrafted discounts, coupons, cashback and referral offers, and what is not allowed.",
    group: "compliance",
    lead: "Homekrafted may offer promotional discounts, coupons, cashback, referral benefits and other promotional offers.",
    blocks: [
      p("Each offer may have specific terms including:"),
      ul(
        "Validity period;",
        "Minimum order value;",
        "Maximum discount;",
        "Eligible products;",
        "Eligible customers;",
        "Geographic restrictions;",
        "Maximum usage;",
        "One-time or recurring use; and",
        "Other applicable conditions.",
      ),
      p("Unless specifically stated, promotional offers cannot be exchanged for cash."),
      p("Homekrafted may cancel or modify a promotion where reasonably necessary, subject to applicable law."),
      p(
        "Customers must not misuse promotional codes or create multiple accounts for the purpose of obtaining unauthorised promotional benefits.",
      ),
    ],
  },
  {
    slug: "customer-reviews",
    path: "/customer-reviews",
    title: "Customer Reviews & Ratings",
    footerLabel: "Customer Reviews Policy",
    description:
      "What Homekrafted expects of ratings and reviews, what may not be submitted, and when a review can be moderated or removed.",
    group: "compliance",
    lead: "Customers may be permitted to submit ratings, reviews, photographs or other feedback relating to products or sellers.",
    blocks: [
      p("Reviews should be genuine and based on the customer's actual experience."),
      p("Users must not submit:"),
      ul(
        "Fake reviews;",
        "Misleading reviews;",
        "Abusive or threatening content;",
        "Defamatory content;",
        "Personal information of another person;",
        "Promotional spam; or",
        "Content violating applicable law.",
      ),
      p("Homekrafted may moderate or remove content that violates this policy or applicable law."),
      p(
        "Homekrafted does not guarantee that every customer review represents the views of Homekrafted.",
      ),
    ],
  },
];
