import { h2, lines, p, ul, type PolicyDoc } from "./types";

/**
 * The customer-facing policies — the footer's "Consumer Policy" column, in
 * footer order. The wording is the client's, reviewed by them, and is data:
 * see the header of `types.ts` before editing any sentence here.
 */
export const CONSUMER_POLICIES: readonly PolicyDoc[] = [
  {
    slug: "cancellation-returns",
    path: "/cancellation-returns",
    title: "Cancellation & Returns Policy",
    footerLabel: "Cancellation & Returns",
    group: "consumer",
    description:
      "When a Homekrafted order can be cancelled, which products can be returned, and how to report a damaged or wrong item.",
    lead: "At Homekrafted, we connect customers with home entrepreneurs offering homemade food, bakery products, handcrafted products, gifts and other products/services.",
    blocks: [
      p("Because many products are freshly prepared, made-to-order, customised or handmade, cancellation and return eligibility may vary depending on the product."),

      h2("1. Order Cancellation"),
      p("Customers may request cancellation of an order before the order has been accepted/confirmed by the relevant seller or before preparation/processing has commenced."),
      p("Once a food order has been accepted and preparation has started, cancellation may not be possible."),
      p("For customised, personalised or made-to-order products, cancellation may not be possible once the seller has started preparing the product."),
      p("Homekrafted may cancel an order in circumstances including:"),
      ul(
        "Product unavailability",
        "Seller inability to fulfil the order",
        "Incorrect pricing or product information",
        "Delivery restrictions",
        "Suspected fraudulent activity",
        "Operational or technical reasons",
        "Circumstances beyond reasonable control",
      ),
      p("Where an order is cancelled by Homekrafted or the seller and payment has already been received, the eligible amount will be refunded through the original payment method or another appropriate method."),

      h2("2. Returns"),
      p("Due to the nature of homemade and handcrafted products, food and perishable products are generally not eligible for return."),
      p("Non-food products may be eligible for return where:"),
      ul(
        "The product received is materially different from the product ordered;",
        "The product is damaged during delivery;",
        "The wrong product has been delivered; or",
        "The product has a manufacturing/quality defect, where applicable.",
      ),
      p("The customer should report the issue as soon as reasonably possible after delivery and preferably within 24 hours for food/perishable products and 48 hours for non-perishable products."),
      p("Photographs, videos, packaging details and other information may be requested to investigate a complaint."),

      h2("3. Food & Perishable Products"),
      p("For food, bakery, desserts, cakes, cooked meals, pickles, chutneys and other perishable products:"),
      ul(
        "Returns are generally not accepted because of hygiene and food-safety considerations.",
        "Complaints relating to missing, incorrect, damaged or substantially defective products should be raised promptly.",
        "Homekrafted may request photographs/videos or other evidence.",
        "Where a complaint is found to be valid, Homekrafted may provide an appropriate resolution, which may include replacement, partial refund or full refund, depending on the circumstances.",
      ),

      h2("4. Damaged Products"),
      p("If a product arrives damaged, customers should:"),
      ul(
        "Take photographs/videos of the package and product.",
        "Retain the original packaging.",
        "Contact Homekrafted customer support as soon as possible.",
        "Provide the order number and relevant details.",
      ),

      h2("5. Refunds"),
      p("Approved refunds will be initiated after verification of the complaint/cancellation."),
      p("The time taken for the amount to reflect in the customer's bank account/card/wallet may depend on the payment gateway, bank or financial institution."),

      h2("6. Seller-Specific Policies"),
      p("Certain sellers may have additional product-specific cancellation, return or replacement conditions. Such conditions may be displayed on the relevant product page."),
      p("Where there is a conflict between a seller's policy and applicable consumer law, applicable law will prevail."),

      h2("7. Contact"),
      lines("Email: {{supportEmail}}", "Website: homekrafted.in"),
    ],
  },

  {
    slug: "refunds",
    path: "/refunds",
    title: "Refund Policy",
    footerLabel: "Refund Policy",
    group: "consumer",
    description:
      "When a full or partial refund may be considered on a Homekrafted order, how refunds are paid, and how food and COD orders are handled.",
    lead: "Refunds may be available depending on the nature of the order and the circumstances of the complaint.",
    blocks: [
      h2("Full Refund"),
      p("A full refund may be considered where:"),
      ul(
        "Homekrafted/seller cancels a confirmed prepaid order;",
        "The ordered product is unavailable and payment has already been collected;",
        "The wrong product is delivered;",
        "The product is materially damaged or defective;",
        "A valid complaint is established; or",
        "A refund is otherwise required under applicable law.",
      ),

      h2("Partial Refund"),
      p("A partial refund may be considered where only part of an order is affected or where the circumstances reasonably warrant a partial adjustment."),

      h2("Food Orders"),
      p("Because food and other perishable products cannot generally be returned for hygiene reasons, refunds for food orders will be assessed based on the particular circumstances."),

      h2("Refund Method"),
      p("Approved refunds will generally be processed to the original payment method or another appropriate method."),
      p("The time taken for the amount to reach the customer may depend upon the payment gateway, bank or financial institution."),

      h2("COD Orders"),
      p("Where an eligible COD order requires a refund, Homekrafted may request bank-account/payment details necessary to process the refund."),

      h2("Fraudulent Claims"),
      p("Homekrafted reserves the right to investigate suspected fraudulent or abusive refund claims."),
      p("Nothing in this policy limits rights available to consumers under applicable law."),
    ],
  },

  {
    slug: "shipping-delivery",
    path: "/shipping-delivery",
    title: "Shipping & Delivery Policy",
    footerLabel: "Shipping & Delivery",
    group: "consumer",
    description:
      "Where Homekrafted delivers, how delivery timelines and charges work, and what happens when a delivery cannot be completed.",
    lead: "Homekrafted connects customers with independent home entrepreneurs, sellers and service providers. Delivery timelines and methods may therefore vary depending on the product, seller, location and availability.",
    blocks: [
      h2("1. Delivery Areas"),
      p("Homekrafted currently offers delivery in selected cities and locations."),
      p("Availability of delivery will be displayed during the ordering process and may depend upon the customer's delivery address and the availability of a seller or delivery partner."),
      p("For products such as homemade pickles, chutneys, gifting products, handicrafts and other eligible non-perishable products, shipping may be available to additional locations across India."),

      h2("2. Delivery Timelines"),
      p("Estimated delivery timelines may be displayed on the relevant product page or during checkout."),
      p("Fresh food and made-to-order products may have shorter delivery windows, while handmade, customised or shipped products may require additional processing time."),
      p("The estimated delivery time may be affected by:"),
      ul(
        "Seller preparation time",
        "Product availability",
        "Customer location",
        "Traffic and weather",
        "Delivery partner availability",
        "Public holidays",
        "Operational or technical issues",
        "Circumstances beyond reasonable control",
      ),

      h2("3. Same-Day / Express Delivery"),
      p("Where same-day or express delivery is offered, the applicable delivery time, cutoff and service area will be displayed at the time of ordering."),
      p("Same-day delivery may not be available for all products or locations."),

      h2("4. Delivery Charges"),
      p("Delivery charges, where applicable, will be communicated before order confirmation."),
      p("Charges may vary depending on:"),
      ul(
        "Distance",
        "Order size",
        "Product category",
        "Delivery speed",
        "Location",
        "Seller",
        "Applicable third-party delivery charges",
      ),

      h2("5. Delivery Attempts"),
      p("The customer is responsible for providing an accurate delivery address and ensuring that someone is available to receive the order where required."),
      p("If delivery cannot be completed because of:"),
      ul(
        "Incorrect address;",
        "Customer unavailable;",
        "Customer refusing the order;",
        "Customer not responding to calls/messages; or",
        "Access restrictions,",
      ),
      p("additional delivery charges or other consequences may apply depending on the circumstances."),

      h2("6. Food Orders"),
      p("Fresh and prepared food products should generally be consumed in accordance with the product's stated storage and consumption instructions."),
      p("Customers should inspect the package upon delivery and contact Homekrafted promptly if there is a significant issue with the order."),

      h2("7. Delayed Delivery"),
      p("Homekrafted will make reasonable efforts to facilitate delivery within the estimated timeframe."),
      p("However, delivery times are estimates unless expressly guaranteed."),

      h2("8. Third-Party Delivery Partners"),
      p("Delivery may be performed by Homekrafted, the seller or an independent third-party delivery/logistics provider."),
      p("Where a third-party delivery provider is used, the delivery may also be subject to that provider's operational terms."),

      h2("9. Contact"),
      lines("Email: {{supportEmail}}"),
    ],
  },

  {
    slug: "terms",
    path: "/terms",
    title: "Terms of Use",
    footerLabel: "Terms of Use",
    group: "consumer",
    description:
      "The terms that govern your use of the Homekrafted website, apps and services, and how orders, sellers, payments and delivery work.",
    lead: "Welcome to Homekrafted.",
    blocks: [
      p("These Terms of Use govern your access to and use of the Homekrafted website, mobile applications and related services."),
      p(`Homekrafted is operated by Tics Foodworks Pvt. Ltd. ("Homekrafted", "we", "us", "our").`),
      p("By accessing or using Homekrafted, you agree to these Terms of Use."),

      h2("1. About Homekrafted"),
      p("Homekrafted is a marketplace/platform that enables customers to discover and purchase products and services offered by independent home entrepreneurs and other sellers."),
      p("These may include:"),
      ul(
        "Homemade food",
        "Home bakery products",
        "Cakes and desserts",
        "Pickles and chutneys",
        "Homemade gifting",
        "Handcrafted products",
        "Art and home décor",
        "Other products and services offered through the platform",
      ),
      p("Depending on the transaction model, Homekrafted may facilitate discovery, ordering, payment, communication and/or delivery."),

      h2("2. Seller Relationship"),
      p("Many products available on Homekrafted are offered by independent sellers/home entrepreneurs."),
      p("The seller is responsible for the accuracy, quality, legality, preparation/manufacturing and fulfilment of the products/services offered by them, subject to Homekrafted's role and applicable law."),
      p("Homekrafted may undertake reasonable onboarding, verification and platform-level quality processes, but this does not mean that Homekrafted manufactures every product listed on the platform."),

      h2("3. Product Information"),
      p("Sellers are responsible for providing accurate information relating to:"),
      ul(
        "Product description",
        "Ingredients, where applicable",
        "Quantity",
        "Price",
        "Availability",
        "Allergen information, where applicable",
        "Product photographs",
        "Preparation/processing information",
        "Other legally required information",
      ),
      p("Homekrafted may make reasonable efforts to display accurate information but cannot guarantee that every seller-provided listing is completely error-free."),

      h2("4. Food Products"),
      p("Customers should review product descriptions, ingredients, allergen information and other available information before placing an order."),
      p("Food products may be prepared in home kitchens or other permitted premises by independent sellers."),
      p("Sellers are responsible for complying with applicable food safety, hygiene, licensing and other legal requirements applicable to their business."),

      h2("5. Pricing"),
      p("Prices displayed on Homekrafted may include or exclude applicable taxes, delivery charges or other charges as specifically indicated at checkout."),
      p("Homekrafted reserves the right to correct genuine pricing or listing errors."),

      h2("6. Orders"),
      p("An order placed through Homekrafted constitutes a request to purchase the selected product/service."),
      p("Order acceptance may depend on seller availability, product availability, payment confirmation and other operational factors."),
      p("Homekrafted reserves the right to cancel or decline an order where reasonably necessary."),

      h2("7. Payments"),
      p("Payments may be processed through third-party payment gateways."),
      p("Customers agree to provide accurate payment and billing information."),
      p("Homekrafted does not store complete card details unless expressly permitted and required under applicable law and payment-security standards."),

      h2("8. Delivery"),
      p("Delivery timelines are estimates unless specifically stated otherwise."),
      p("Delivery may be performed by:"),
      ul(
        "Homekrafted;",
        "Third-party logistics/delivery partners;",
        "Sellers; or",
        "Other authorised service providers.",
      ),
      p("Delivery delays may occur because of traffic, weather, availability, seller preparation time, technical issues or circumstances beyond reasonable control."),

      h2("9. User Accounts"),
      p("Users must provide accurate information while creating an account or placing an order."),
      p("Users are responsible for maintaining the confidentiality of their login credentials."),
      p("Homekrafted may suspend or terminate accounts involved in fraudulent, abusive or unlawful activity."),

      h2("10. Prohibited Activities"),
      p("Users must not:"),
      ul(
        "Use Homekrafted for unlawful activities;",
        "Provide false information;",
        "Attempt unauthorised access;",
        "Interfere with the website or application;",
        "Upload malicious software;",
        "Misuse promotional offers;",
        "Engage in fraudulent transactions;",
        "Scrape or reproduce platform content without permission; or",
        "Violate the rights of Homekrafted, sellers or other users.",
      ),

      h2("11. Intellectual Property"),
      p("The Homekrafted name, logo, website design, graphics, text, software and other platform content are owned by or licensed to Homekrafted unless otherwise stated."),
      p("No part of the platform may be copied, reproduced, modified or commercially exploited without prior written permission."),
      p("Seller-owned content remains subject to the rights of the respective seller."),

      h2("12. Third-Party Services"),
      p("Homekrafted may use third-party services including payment gateways, logistics providers, analytics providers, communication services and other technology providers."),
      p("Use of such services may also be subject to their respective terms and policies."),

      h2("13. Promotions"),
      p("Promotional offers may have additional terms including validity periods, minimum order values, geographic restrictions or usage limits."),
      p("Homekrafted may withdraw or modify an offer where permitted by law."),

      h2("14. Limitation"),
      p("To the extent permitted by applicable law, Homekrafted shall not be responsible for circumstances beyond its reasonable control."),
      p("Nothing in these Terms is intended to exclude or restrict any consumer right or legal remedy that cannot lawfully be excluded."),

      h2("15. Changes"),
      p("Homekrafted may update these Terms from time to time."),
      p("Updated Terms will be published on this page with the revised date."),

      h2("16. Governing Law"),
      p("These Terms shall be governed by the laws of India."),
      p("Subject to applicable consumer protection laws, courts having appropriate jurisdiction in India shall have jurisdiction over disputes relating to these Terms."),

      h2("17. Contact"),
      lines("Tics Foodworks Pvt. Ltd.", "Brand: Homekrafted", "Email: {{supportEmail}}", "Website: homekrafted.in"),
    ],
  },

  {
    slug: "privacy",
    path: "/privacy",
    title: "Privacy Policy",
    footerLabel: "Privacy Policy",
    group: "consumer",
    description:
      "What personal information Homekrafted may collect, why it is collected, who it may be shared with, and the rights you have over it.",
    lead: "Homekrafted respects your privacy and is committed to handling personal information responsibly.",
    blocks: [
      p("This Privacy Policy explains what information we may collect, why we collect it and how it may be used."),

      h2("1. Information We Collect"),
      p("Depending on how you use Homekrafted, we may collect:"),
      ul(
        "Name",
        "Mobile number",
        "Email address",
        "Delivery/billing address",
        "Account information",
        "Order history",
        "Payment-related information",
        "Customer support communications",
        "Product reviews and feedback",
        "Device and browser information",
        "IP address and technical information",
        "Information voluntarily provided to us",
      ),

      h2("2. How We Use Information"),
      p("Information may be used to:"),
      ul(
        "Process and fulfil orders;",
        "Coordinate deliveries;",
        "Communicate with customers;",
        "Provide customer support;",
        "Process refunds;",
        "Improve our products and services;",
        "Personalise the user experience;",
        "Prevent fraud and misuse;",
        "Maintain platform security;",
        "Comply with legal requirements; and",
        "Send promotional communications where permitted by law.",
      ),

      h2("3. Sharing of Information"),
      p("We may share relevant information with:"),
      ul(
        "Sellers/home entrepreneurs for fulfilment;",
        "Delivery partners;",
        "Payment gateways;",
        "Technology/service providers;",
        "Customer support providers;",
        "Professional advisers; and",
        "Government or law-enforcement authorities where legally required.",
      ),
      p("We do not intend to sell personal information to third parties for their independent marketing purposes."),

      h2("4. Marketing Communications"),
      p("Where legally permitted, Homekrafted may send information about offers, products, events or services."),
      p("Users may opt out of promotional communications through available unsubscribe mechanisms or by contacting us."),

      h2("5. Cookies"),
      p("Homekrafted may use cookies and similar technologies to:"),
      ul(
        "Operate the website;",
        "Remember preferences;",
        "Understand website usage;",
        "Improve performance; and",
        "Support analytics and marketing activities where permitted.",
      ),
      p("Users may control cookies through browser settings, although disabling certain cookies may affect website functionality."),

      h2("6. Data Security"),
      p("We use reasonable security measures designed to protect personal information."),
      p("However, no electronic transmission or storage system can be guaranteed to be completely secure."),

      h2("7. Data Retention"),
      p("We retain information for as long as reasonably necessary for the purposes described in this Policy, including fulfilling transactions, maintaining records, resolving disputes and complying with legal obligations."),

      h2("8. Children's Privacy"),
      p("Homekrafted services are not intended to be used independently by children where prohibited by applicable law."),
      p("We do not knowingly seek to collect personal information from children in violation of applicable legal requirements."),

      h2("9. Your Rights"),
      p("Subject to applicable law, users may have rights relating to their personal information, including rights to access, correction, withdrawal of consent and other applicable rights."),
      p("Requests may be sent to:"),
      p("{{supportEmail}}"),

      h2("10. Changes to this Policy"),
      p("Homekrafted may update this Privacy Policy from time to time."),
      p("The revised version will be published on this page with an updated date."),

      h2("11. Contact"),
      lines("Tics Foodworks Pvt. Ltd.", "Homekrafted", "Email: {{supportEmail}}"),
    ],
  },

  {
    slug: "security",
    path: "/security",
    title: "Security",
    footerLabel: "Security",
    group: "consumer",
    description:
      "How Homekrafted protects user information and payments, what customers can do to stay safe, and who to contact about suspicious activity.",
    lead: "Homekrafted takes reasonable measures to protect user information and transactions on its platform.",
    blocks: [
      p("We use appropriate technical and organisational safeguards designed to protect information against unauthorised access, alteration, disclosure or destruction."),
      p("These measures may include:"),
      ul(
        "Secure website connections",
        "Access controls",
        "Authentication mechanisms",
        "Payment gateway security",
        "Monitoring and technical safeguards",
        "Restricted access to personal information",
        "Reasonable security practices for stored information",
      ),

      h2("Payment Security"),
      p("Online payments may be processed through third-party payment service providers."),
      p("Homekrafted does not intend to receive or store customers' complete debit/credit card information where payment processing is handled directly by the payment service provider."),

      h2("User Responsibility"),
      p("Customers should:"),
      ul(
        "Keep passwords confidential;",
        "Avoid sharing OTPs or authentication credentials;",
        "Use secure devices;",
        "Report suspicious account activity immediately; and",
        "Avoid responding to requests for passwords, OTPs or payment credentials claiming to be from Homekrafted.",
      ),
      p("No internet-based system can be guaranteed to be completely secure. Homekrafted therefore cannot guarantee absolute security of information transmitted over the internet."),
      p("If you suspect unauthorised access or fraudulent activity relating to your Homekrafted account, contact us immediately."),
      p("Security contact: {{supportEmail}}"),
    ],
  },

  {
    slug: "payment-policy",
    path: "/payment-policy",
    title: "Payment Policy",
    footerLabel: "Payment Policy",
    group: "consumer",
    description:
      "The payment options available on Homekrafted, how online payments and Cash on Delivery work, and what to do if a payment fails.",
    lead: "Homekrafted may provide customers with multiple payment options, including online payment and, where available, Cash on Delivery.",
    blocks: [
      p("Payments may be processed through authorised third-party payment service providers."),

      h2("Online Payments"),
      p("Customers may be redirected to or interact with a third-party payment gateway to complete payment."),
      p("Homekrafted does not intend to store complete card credentials where payment processing is performed by the payment service provider."),

      h2("Cash on Delivery"),
      p("COD may be available only for selected products, sellers, locations or order values."),
      p("Homekrafted may restrict COD where there is a history of:"),
      ul(
        "Failed deliveries;",
        "Order refusals;",
        "Fraudulent activity; or",
        "Other misuse.",
      ),

      h2("Payment Failure"),
      p("If payment is unsuccessful, the order may not be confirmed."),
      p("If money is debited but the order is not successfully created, customers should contact Homekrafted with the relevant transaction details."),
    ],
  },

  {
    slug: "cookies",
    path: "/cookies",
    title: "Cookies Policy",
    footerLabel: "Cookies Policy",
    group: "consumer",
    description:
      "How Homekrafted may use cookies and similar technologies, and how you can manage them in your browser.",
    lead: "Homekrafted may use cookies and similar technologies to improve website functionality and understand how users interact with the platform.",
    blocks: [
      p("Cookies may be used to:"),
      ul(
        "Maintain login sessions;",
        "Remember preferences;",
        "Support shopping-cart functionality;",
        "Understand website performance;",
        "Analyse traffic;",
        "Improve user experience; and",
        "Support marketing activities where permitted.",
      ),
      p("Users may manage cookies through their browser settings."),
      p("Disabling certain cookies may affect some website functionality."),
      p("Where required by applicable law, Homekrafted will obtain the necessary consent for cookies or similar technologies."),
    ],
  },
];
