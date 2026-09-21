import type { PolicyDoc } from "./types";
import { h2, p, ul } from "./types";

/**
 * The two documents a HomeKrafter is bound by (footer column "Sellers").
 * Client-reviewed wording — see `types.ts` before editing a sentence.
 *
 * **Neither path starts with `/seller`**, and that is on purpose:
 * `ConsumerChrome` and `LocationPrompt` treat any pathname beginning
 * `/seller` as the seller portal (no header, no footer), and `robots.ts`
 * disallows the `/seller` prefix — so `/seller-terms` rendered bare and
 * unindexable. `policies.spec.ts` fails the build on such a path.
 */
export const SELLER_POLICIES: readonly PolicyDoc[] = [
  {
    slug: "entrepreneur-terms",
    path: "/entrepreneur-terms",
    title: "Homekrafted Entrepreneur Terms",
    footerLabel: "Seller Terms",
    description:
      "The terms that apply to home entrepreneurs, artisans, food businesses and other sellers who list products or services on Homekrafted.",
    group: "sellers",
    lead: "These Terms apply to individuals, home entrepreneurs, artisans, food businesses and other sellers who list products or services on Homekrafted.",
    blocks: [
      p("By registering or selling through Homekrafted, the seller agrees to these Terms."),

      h2("1. Seller Eligibility"),
      p("The seller represents that:"),
      ul(
        "The information provided during registration is accurate;",
        "The seller is legally entitled to operate the relevant business;",
        "The seller will comply with applicable laws and regulations;",
        "The seller has the necessary licences, registrations and permissions applicable to their business; and",
        "The products/services offered are lawful.",
      ),

      h2("2. Food Sellers"),
      p(
        "Food sellers are responsible for obtaining and maintaining all licences, registrations and approvals applicable to their food business.",
      ),
      p(
        "Where applicable, food sellers must maintain valid FSSAI registration/licence and comply with applicable food-safety requirements.",
      ),
      p("Homekrafted may request documentary proof of applicable registration/licensing."),
      p(
        "A seller whose required licence/registration is expired, suspended or cancelled must not continue selling the affected food products through Homekrafted.",
      ),

      h2("3. Product Information"),
      p("Sellers must provide accurate information regarding:"),
      ul(
        "Product name",
        "Description",
        "Price",
        "Quantity",
        "Ingredients, where applicable",
        "Allergen information, where applicable",
        "Product photographs",
        "Preparation/manufacturing information",
        "Shelf life/expiry information, where applicable",
        "Country of origin where legally required",
        "Delivery/processing timelines",
        "Applicable taxes and other required information",
      ),
      p("Sellers must not make misleading or deceptive claims."),

      h2("4. Product Quality"),
      p("Sellers are responsible for ensuring that products listed on Homekrafted:"),
      ul(
        "Match the product description;",
        "Are of acceptable quality;",
        "Are safely packaged;",
        "Are fit for their intended purpose;",
        "Comply with applicable laws; and",
        "Are not counterfeit, prohibited or unlawfully sourced.",
      ),

      h2("5. Packaging"),
      p("Sellers are responsible for appropriate packaging of their products."),
      p(
        "Food products must be packaged in a manner appropriate to the nature of the product and applicable food-safety requirements.",
      ),
      p(
        "Sellers should minimise unnecessary packaging and comply with applicable plastic-waste/EPR requirements where applicable.",
      ),

      h2("6. Orders"),
      p(
        "Once a seller accepts an order, the seller should fulfil the order within the committed preparation/processing timeline.",
      ),
      p(
        "Repeated cancellations, unreasonable delays or failure to fulfil confirmed orders may result in temporary suspension or termination of the seller account.",
      ),

      h2("7. Pricing"),
      p("Sellers are responsible for maintaining accurate product pricing."),
      p("Homekrafted may require correction of inaccurate pricing or product information."),

      h2("8. Customer Complaints"),
      p("Sellers must reasonably cooperate with Homekrafted in resolving customer complaints."),
      p("Homekrafted may request:"),
      ul(
        "Product photographs;",
        "Packaging photographs;",
        "Batch information;",
        "Preparation information;",
        "Order records;",
        "Licence/registration details; or",
        "Other information reasonably required to investigate a complaint.",
      ),

      h2("9. Returns and Refunds"),
      p("Seller products may be subject to Homekrafted's Cancellation & Returns Policy."),
      p("For fresh/perishable products, returns may generally not be possible because of their nature."),
      p(
        "Where a complaint is found to be valid, the resolution may include replacement, partial refund or full refund depending on the circumstances.",
      ),

      h2("10. Seller Payments"),
      p("Seller payouts will be made according to the commercial arrangement applicable to the seller."),
      p("Homekrafted may deduct applicable:"),
      ul(
        "Platform commissions;",
        "Delivery charges;",
        "Payment gateway charges;",
        "Taxes;",
        "Refunds;",
        "Adjustments; or",
        "Other agreed charges.",
      ),

      h2("11. Seller Taxes"),
      p(
        "The seller is responsible for their own applicable tax, GST, income-tax and other statutory obligations.",
      ),

      h2("12. Intellectual Property"),
      p(
        "The seller must have the necessary rights to use photographs, logos, product names, artwork and other intellectual property uploaded to Homekrafted.",
      ),
      p(
        "The seller grants Homekrafted a non-exclusive licence to use such material for operating, marketing and promoting the seller's products on Homekrafted and its marketing channels.",
      ),

      h2("13. Prohibited Products"),
      p("Sellers must not list products that violate applicable law or Homekrafted's policies."),
      p(
        "Homekrafted may remove listings or suspend accounts where there is a reasonable concern regarding legality, safety, fraud, counterfeit goods or consumer protection.",
      ),

      h2("14. Account Suspension"),
      p("Homekrafted may suspend or terminate a seller account in circumstances including:"),
      ul(
        "Fraud;",
        "Repeated customer complaints;",
        "Misleading listings;",
        "Counterfeit products;",
        "Regulatory non-compliance;",
        "Food-safety concerns;",
        "Repeated order cancellations;",
        "Abuse of the platform; or",
        "Violation of these Terms.",
      ),

      h2("15. Independent Seller"),
      p(
        "Unless expressly stated otherwise, sellers operate independently and are not employees, agents or partners of Homekrafted merely because they sell through the platform.",
      ),

      h2("16. Changes"),
      p("Homekrafted may update these Terms from time to time."),
    ],
  },
  {
    slug: "content-ip-policy",
    path: "/content-ip-policy",
    title: "Seller Content Policy",
    footerLabel: "Seller Content & IP Policy",
    description:
      "The rights a seller confirms and the licence they give Homekrafted when they upload photographs, videos, descriptions, logos and other material.",
    group: "sellers",
    lead: "Sellers may upload photographs, videos, descriptions, logos, product names and other material to Homekrafted.",
    blocks: [
      p("The seller represents that they have the necessary rights to use such content."),
      p(
        "By uploading content, the seller grants Homekrafted a non-exclusive, royalty-free licence to use, reproduce, display and distribute the content for:",
      ),
      ul(
        "Listing the seller's products;",
        "Operating the Homekrafted platform;",
        "Social-media promotion;",
        "Advertising;",
        "Promotional campaigns;",
        "Marketing material; and",
        "Other activities connected with Homekrafted's business.",
      ),
      p(
        "The seller remains responsible for ensuring that uploaded content does not infringe another person's copyright, trademark, privacy or other rights.",
      ),
      p(
        "Homekrafted may remove content that it reasonably believes violates applicable law or platform policies.",
      ),
    ],
  },
];
