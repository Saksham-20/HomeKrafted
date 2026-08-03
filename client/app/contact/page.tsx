import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY, isPlaceholder } from "@/lib/legal";
import styles from "@/components/legal/LegalPage.module.css";

export const metadata = pageMetadata({
  title: "Contact us",
  description:
    "How to reach Homekrafted — support, order problems, HomeKrafter enquiries and our registered business address.",
  path: "/contact",
});

/** A row that shows a real value, or says plainly that it isn't filled in yet. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detail}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>
        {isPlaceholder(value) ? (
          <span className={styles.pending}>not published yet</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

/**
 * Contact (M18).
 *
 * A launch requirement rather than a nicety: Razorpay will not activate a
 * live account without a reachable contact address, and Indian
 * intermediary rules expect a named grievance officer. It is also the
 * page a customer looks for when the product has failed them, so it leads
 * with the fastest route to a human rather than with the company details.
 */
export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      intro="A real person reads everything below. If it's about an order, the support desk is the fastest route — it arrives with your order already attached."
    >
      <h2>A problem with an order</h2>
      <p>
        Open a ticket from <Link href="/support">Support</Link> while signed in. It
        carries your order details with it, so nobody has to ask you for an
        order number. We reply within one working day, and you&rsquo;ll get a
        notification when we do.
      </p>
      <p>
        For what can be cancelled, returned or refunded, see the{" "}
        <Link href="/refunds">cancellation &amp; refund policy</Link>.
      </p>

      <h2>Everything else</h2>
      <Detail label="Support email" value={LEGAL_ENTITY.supportEmail} />
      <Detail label="Phone" value={LEGAL_ENTITY.supportPhone} />
      <Detail label="Hours" value={LEGAL_ENTITY.supportHours} />

      <h2>Cooking, and want to sell here?</h2>
      <p>
        Apply at <Link href="/sell">Sell on Homekrafted</Link>. We read every
        application and reply either way. You do not need a company, a
        commercial kitchen, or a website &mdash; you need to cook something
        well and be able to make it repeatedly.
      </p>

      <h2>Grievance officer</h2>
      <p>
        In line with the Consumer Protection (E-Commerce) Rules, 2020 and the
        Information Technology Rules, complaints that the support desk
        hasn&rsquo;t resolved can be escalated to our grievance officer. We
        acknowledge within 48 hours and aim to resolve within one month.
      </p>
      <Detail label="Grievance email" value={LEGAL_ENTITY.grievanceEmail} />
      <Detail label="Grievance officer" value={LEGAL_ENTITY.legalName} />

      <h2>Registered business details</h2>
      <Detail label="Legal name" value={LEGAL_ENTITY.legalName} />
      <div className={styles.detail}>
        <span className={styles.detailLabel}>Registered address</span>
        <span className={styles.detailValue}>
          {LEGAL_ENTITY.address.every(isPlaceholder) ? (
            <span className={styles.pending}>not published yet</span>
          ) : (
            LEGAL_ENTITY.address.join(", ")
          )}
        </span>
      </div>
      {LEGAL_ENTITY.gstin && <Detail label="GSTIN" value={LEGAL_ENTITY.gstin} />}
      {LEGAL_ENTITY.cin && <Detail label="CIN" value={LEGAL_ENTITY.cin} />}

      <div className={styles.callout}>
        Homekrafted operates in Chandigarh, Mohali, Panchkula and Zirakpur.
        Deliveries outside the tricity are not available yet.
      </div>
    </LegalPage>
  );
}
