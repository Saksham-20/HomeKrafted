import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY } from "@/lib/legal";
import styles from "@/components/legal/LegalPage.module.css";

export const metadata = pageMetadata({
  title: "Cancellation & refund policy",
  description:
    "When a Homekrafted order can be cancelled, when it can be returned, and how refunds are paid — for food made to order in home kitchens.",
  path: "/refunds",
});

/**
 * Cancellation & refund policy (M18).
 *
 * **Written from what the code actually enforces**, not from a template.
 * Cancellation really does close at `packed` and returns really do close
 * seven days after `deliveredAt`, both server-side (M15); a return request
 * really does move no money until an admin resolves it. A policy that
 * promised something the software refuses would be the worst of both —
 * customers quoting it, support unable to honour it.
 *
 * Also a launch requirement: Razorpay will not activate a live account
 * without a published cancellation/refund policy.
 */
export default function RefundsPage() {
  return (
    <LegalPage
      title="Cancellation & refund policy"
      intro="Homekrafted sells food made to order in home kitchens. That shapes this policy: once someone has started cooking for you, the ingredients are spent."
    >
      <h2>Cancelling an order</h2>
      <p>
        You can cancel an order yourself, from{" "}
        <Link href="/account/orders">your orders page</Link>, up until the kitchen
        marks it <strong>packed</strong>. Until that point nothing has been
        made and there is nothing to waste, so cancellation is immediate and
        free.
      </p>
      <p>
        Once an order is packed, it can no longer be cancelled from the site.
        The food exists by then, and it was made for you specifically. If
        something has gone wrong, contact us — see &ldquo;When we make an
        exception&rdquo; below.
      </p>
      <div className={styles.callout}>
        <strong>Why the cut-off is where it is.</strong>{" "}Most of what we sell
        is cooked the morning it ships, in batches of a few. A cancellation
        after cooking has started isn&rsquo;t a restocking cost to a warehouse
        — it&rsquo;s a loss to one person&rsquo;s household.
      </div>

      <h2>Returns</h2>
      <p>
        You can request a return within <strong>seven days of delivery</strong>,
        from your orders page. Tell us what went wrong; photos help and are
        never required.
      </p>
      <p>Reasons we expect to see, and act on:</p>
      <ul>
        <li>The item arrived damaged, leaking, or with broken packaging.</li>
        <li>
          The wrong item, wrong weight, or a missing item from your order.
        </li>
        <li>
          The food was spoiled, mouldy, or clearly not fresh on arrival.
        </li>
        <li>The item was past, or too close to, its stated shelf life.</li>
      </ul>
      <p>
        Because this is food, we generally <strong>cannot</strong>{" "}accept a
        return simply because you changed your mind, or because a dish was not
        to your taste. A home cook&rsquo;s recipe is not a defect. If a
        listing described something inaccurately, that is different — tell us,
        because that is our problem to fix.
      </p>

      <h2>How a refund is decided and paid</h2>
      <p>
        A return request does not move money on its own. A person at
        Homekrafted reads it, and where we need to, asks the kitchen. We aim
        to decide within <strong>three working days</strong>.
      </p>
      <p>
        Where a refund is due, it is credited to your{" "}
        <Link href="/wallet">Homekrafted wallet</Link>, usually the same day the
        decision is made. Wallet balance can be spent on any order on the
        platform and does not expire.
      </p>
      <div className={styles.callout}>
        <strong>Want it back on your card instead?</strong>{" "}Ask, and we will
        arrange it. Card refunds are processed through our payment provider
        and typically reach your bank in 5&ndash;7 working days. We do not do
        this automatically because most people would rather have the balance
        immediately than wait a week.
      </div>
      <p>
        If an order is cancelled before it is packed and you had already paid,
        the full amount &mdash; including any delivery fee &mdash; is returned
        to your wallet automatically, without you asking.
      </p>

      <h2>When we make an exception</h2>
      <p>
        The rules above are the defaults, not the ceiling. If something went
        wrong outside them &mdash; a delivery that never arrived, an order
        packed while you were trying to cancel it, an allergen not listed
        &mdash; contact us. Nothing on this page removes any right you have
        under Indian consumer law.
      </p>

      <h2>Allergies and dietary needs</h2>
      <p>
        Listings carry dietary tags and ingredient lists supplied by the
        kitchen. These are home kitchens, and{" "}
        <strong>
          we cannot guarantee that any item is free of cross-contamination
        </strong>{" "}
        with nuts, dairy, gluten or anything else. If you have a serious
        allergy, please treat every item as potentially exposed, and ask the
        kitchen before ordering.
      </p>

      <h2>Contacting us about an order</h2>
      <p>
        Raise a ticket from <Link href="/support">Support</Link> &mdash; it reaches
        us with your order attached, which is faster than email. Or write to{" "}
        <a href={`mailto:${LEGAL_ENTITY.supportEmail}`}>
          {LEGAL_ENTITY.supportEmail}
        </a>
        , or see the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
