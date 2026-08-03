import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY } from "@/lib/legal";
import styles from "@/components/legal/LegalPage.module.css";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "What Homekrafted collects, why, who it is shared with, and how to get it deleted.",
  path: "/privacy",
});

/**
 * Privacy policy (M18).
 *
 * Written against what the system actually stores and sends, which is
 * knowable precisely: the Prisma schema is the list of what is collected,
 * and `NotificationsDeliveryService` is the list of who it goes to. A
 * generic template would have claimed things that are not true here (no
 * analytics vendor, no ad network, no third-party cookies) and omitted the
 * ones that are (a HomeKrafter sees your delivery address, because
 * somebody has to bring you food).
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="What we collect, why, and who sees it. Short version: enough to get food to your door, and nothing sold to anyone."
    >
      <div className={styles.callout}>
        <strong>We do not sell your data, ever.</strong> There is no
        advertising network on this site, no third-party analytics, and no
        tracking pixel. The only parties who see anything about you are the
        kitchen making your order and the services that carry our messages
        and payments.
      </div>

      <h2>What we collect</h2>
      <h3>Because you gave it to us</h3>
      <ul>
        <li>
          <strong>Your name, phone number and email.</strong> Needed to sign
          you in and to tell you where your order is.
        </li>
        <li>
          <strong>Delivery addresses</strong> you save, including the
          recipient&rsquo;s name and phone when you send a gift.
        </li>
        <li>
          <strong>Order history</strong>, wallet balance and transactions,
          reviews you write, and support tickets you open.
        </li>
        <li>
          <strong>Your approximate location</strong>, if you allow it or pick
          an area &mdash; used to show kitchens that can reach you. Declining
          is fine: you get the full catalogue instead of a sorted one.
        </li>
      </ul>
      <h3>Because using the site creates it</h3>
      <ul>
        <li>
          Sign-in sessions, so you stay logged in, and the fact of a password
          reset being requested.
        </li>
        <li>
          Ordinary server logs, which include IP addresses, for security and
          debugging.
        </li>
      </ul>
      <h3>What we never hold</h3>
      <p>
        <strong>Card details never touch our servers.</strong> Payments are
        handled by our payment provider; we receive only whether a payment
        succeeded and a reference for it. Passwords are stored as a one-way
        hash and cannot be read back by anyone here, including us.
      </p>

      <h2>Who sees it</h2>
      <ul>
        <li>
          <strong>The HomeKrafter making your order</strong> sees your name,
          delivery address, phone number and what you ordered. There is no way
          to deliver food without this.
        </li>
        <li>
          <strong>Our payment provider</strong> receives what it needs to take
          a payment.
        </li>
        <li>
          <strong>Messaging providers</strong> (WhatsApp, SMS and email)
          receive your phone number or email and the message, when we send you
          an order update.
        </li>
        <li>
          <strong>Nobody else.</strong> We do not share, rent or sell personal
          data for marketing, by us or anyone else.
        </li>
      </ul>
      <p>
        We may disclose information where the law requires it, or to
        investigate fraud or a safety issue on the platform.
      </p>

      <h2>Reviews and anything public</h2>
      <p>
        A review you post shows your first name publicly, alongside the
        rating and text. Your storefront follows, wallet balance, addresses
        and order history are never public.
      </p>

      <h2>Messages you can turn off</h2>
      <p>
        Order updates reach you on WhatsApp, email and in the app by default,
        because an update you never see is not an update. Every one of these
        is a per-category toggle at{" "}
        <Link href="/account/notifications">notification settings</Link>, and
        turning one off stops it immediately.
      </p>
      <p>
        Marketing messages are <strong>off by default</strong> and only ever
        go out if you turn them on.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies for exactly two things: keeping you signed in, and
        remembering the delivery area you picked so pages render for the right
        place. There are no advertising or analytics cookies on this site.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order and payment records are kept as long as tax and accounting rules
        require. Everything else &mdash; your account, addresses, wallet, saved
        items &mdash; is kept while your account is open.
      </p>

      <h2>Getting your data, or deleting it</h2>
      <p>
        Write to{" "}
        <a href={`mailto:${LEGAL_ENTITY.supportEmail}`}>
          {LEGAL_ENTITY.supportEmail}
        </a>{" "}
        and ask for a copy of what we hold about you, a correction, or
        deletion of your account. We will act within 30 days.
      </p>
      <p>
        One limit worth stating plainly: we cannot delete the record of an
        order you have already placed, because a kitchen was paid for it and
        both sides need that record. Deleting your account removes your
        profile, addresses and saved items, and detaches your name from your
        reviews.
      </p>

      <h2>Children</h2>
      <p>
        Homekrafted is not intended for anyone under 18, and we do not
        knowingly collect information from children.
      </p>

      <h2>Changes, and how to complain</h2>
      <p>
        If this policy changes in a way that affects you, we will say so on
        the site rather than quietly editing the page. Complaints go to our
        grievance officer &mdash; see the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
