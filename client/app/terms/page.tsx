import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY } from "@/lib/legal";
import styles from "@/components/legal/LegalPage.module.css";

export const metadata = pageMetadata({
  title: "Terms of service",
  description:
    "The terms you agree to when you use Homekrafted — as a shopper, or as a HomeKrafter selling on the platform.",
  path: "/terms",
});

/**
 * Terms of service (M18).
 *
 * The one thing these must get right is **what Homekrafted actually is**:
 * a marketplace where the seller is an individual home cook, not a shop
 * selling its own manufactured food. Terms that quietly claimed we make
 * the food would misstate who is liable for it, which on a food platform
 * is not a technicality.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="Homekrafted is a marketplace. Food is made and sold by independent home kitchens — we run the platform, take the payment, and stand behind the experience."
    >
      <h2>1. Who you are contracting with</h2>
      <p>
        When you buy on Homekrafted, your contract for the food is with the{" "}
        <strong>HomeKrafter who makes it</strong>. Homekrafted operates the
        platform: listings, payment, delivery coordination, wallet, support
        and dispute resolution.
      </p>
      <p>
        This is not a disclaimer we hide behind. We vet kitchens before they
        can list, we verify FSSAI registration where it applies, we hold
        payouts, and we resolve returns ourselves &mdash; see the{" "}
        <Link href="/refunds">cancellation &amp; refund policy</Link>. But the food
        is cooked by a person, in their home, and the terms should say so.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be 18 or older to buy or sell here.</li>
        <li>
          Keep your sign-in details to yourself. Anything done from your
          account is treated as done by you.
        </li>
        <li>
          The details you give us must be accurate &mdash; particularly a
          delivery address and a phone number, since food that cannot be
          delivered cannot be remade.
        </li>
        <li>
          We may suspend an account for fraud, abuse of a HomeKrafter, or
          repeated bad-faith returns. We will tell you why.
        </li>
      </ul>

      <h2>3. Orders, prices and availability</h2>
      <p>
        Prices are set by each HomeKrafter and shown inclusive of applicable
        taxes. Delivery fees, where they apply, are shown before you pay.
      </p>
      <p>
        Placing an order is an offer, not a completed sale. An order can be
        declined &mdash; an ingredient ran out, the kitchen is closed that day
        &mdash; and if it is, anything you paid is returned to your wallet in
        full.
      </p>
      <p>
        Food is made in small batches. Colour, texture and exact weight vary
        between batches; photographs are indicative. That is a property of
        home cooking, not a defect.
      </p>

      <h2>4. Delivery</h2>
      <p>
        We deliver within Chandigarh, Mohali, Panchkula and Zirakpur. Delivery
        windows are estimates, and a kitchen&rsquo;s own schedule and prep time
        determine what you can pick. Somebody has to be able to receive the
        order at the address and time you chose &mdash; food left because
        nobody answered cannot be refunded.
      </p>

      <h2>5. Payments and the wallet</h2>
      <p>
        Payments are handled by our payment provider; we never see or store
        your card details. The Homekrafted wallet holds refunds, cashback and
        top-ups. Wallet balance can be spent anywhere on the platform, does
        not expire, and is <strong>not transferable and not withdrawable as
        cash</strong> except where we owe you a refund and you ask for it to
        go back to your card.
      </p>

      <h2>6. Reviews</h2>
      <p>
        You can review something only after an order containing it has been
        delivered to you. Reviews must be your own honest experience. We
        remove reviews that are abusive, contain personal information, or are
        clearly not about the item &mdash; and we do not remove one for being
        negative.
      </p>

      <h2>7. If you sell here</h2>
      <p>These apply in addition to everything above.</p>
      <ul>
        <li>
          <strong>You are responsible for your food.</strong> Its safety,
          hygiene, accurate description, ingredient and allergen information,
          and shelf life are yours.
        </li>
        <li>
          <strong>You must hold the registrations that apply to you</strong>,
          including FSSAI registration where required, and keep them current.
          Verification badges are granted by us on evidence and can be
          withdrawn.
        </li>
        <li>
          <strong>List only what you can actually make.</strong> Mark items
          unavailable rather than accepting an order you cannot fulfil.
        </li>
        <li>
          <strong>Payouts.</strong> We collect from the buyer and settle to you
          on the payout schedule, less the platform commission shown in your
          portal. Payouts on disputed orders are held until the dispute is
          resolved.
        </li>
        <li>
          <strong>Your customers are not your mailing list.</strong> Buyer
          details are given to you to fulfil an order and for nothing else.
        </li>
        <li>
          We may remove a listing or suspend a kitchen for a safety concern, a
          pattern of complaints, or misrepresentation.
        </li>
      </ul>

      <h2>8. Acceptable use</h2>
      <p>
        Don&rsquo;t attempt to break, overload or gain unauthorised access to
        the platform; don&rsquo;t scrape it; don&rsquo;t impersonate anyone;
        don&rsquo;t use it to sell anything illegal. Brand names, copy and
        design here belong to Homekrafted. Photographs and descriptions
        uploaded by a HomeKrafter remain theirs, licensed to us to display and
        promote their listings.
      </p>

      <h2>9. Liability</h2>
      <p>
        Nothing here limits liability for death or personal injury caused by
        negligence, for fraud, or anything else that cannot be limited under
        Indian law &mdash; and your rights under consumer law are unaffected
        by anything on this page.
      </p>
      <p>
        Subject to that, Homekrafted&rsquo;s liability for any order is limited
        to the amount you paid for it. We are not liable for a
        HomeKrafter&rsquo;s acts beyond our role in operating the platform and
        resolving disputes.
      </p>
      <div className={styles.callout}>
        <strong>Allergies.</strong> These are home kitchens. We cannot
        guarantee any item is free from cross-contamination with nuts, dairy,
        gluten or anything else. If you have a serious allergy, check with the
        kitchen before ordering.
      </div>

      <h2>10. Changes and governing law</h2>
      <p>
        We may update these terms; material changes will be announced on the
        site rather than quietly edited in. These terms are governed by the
        laws of India, and the courts at Chandigarh have jurisdiction.
      </p>
      <p>
        Questions go to{" "}
        <a href={`mailto:${LEGAL_ENTITY.supportEmail}`}>
          {LEGAL_ENTITY.supportEmail}
        </a>{" "}
        or the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
