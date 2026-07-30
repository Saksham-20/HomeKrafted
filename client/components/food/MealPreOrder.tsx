"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PreOrderPicker, type PreOrderSelection } from "@/components/ui/PreOrderPicker";
import { describeSlot } from "@/lib/schedule";
import { buildWhatsAppLink, HOMEKRAFTED_WHATSAPP_NUMBER } from "@/lib/messaging";
import styles from "./MealPreOrder.module.css";

/**
 * Pre-order for full meals.
 *
 * Full meals still have **no menu on the web** (`lib/channel.ts` —
 * `full-meals.hasMenuOnWeb === false`, and `/app-promo` asserts on it), so
 * this cannot be an order: there is nothing on this page to order from.
 * What it is, is a way to say "I want dinner, around this time" and have a
 * real person pick it up — which is the useful half of pre-ordering while
 * the app is still the ordering surface.
 *
 * Goes out over WhatsApp for the same reason Snacks does: it's the channel
 * that actually exists today, and it puts the request in front of someone
 * who can answer with what's cooking.
 */
export function MealPreOrder() {
  const [slot, setSlot] = useState<PreOrderSelection | undefined>(undefined);
  const [sent, setSent] = useState(false);

  function handleSend() {
    const when = slot ? describeSlot(slot.dayId, slot.windowId) : "as soon as it launches";
    const message = [
      "Hi Homekrafted! I'd like to pre-order a full meal.",
      "",
      `Preferred time: ${when}`,
      "Please let me know what's cooking and what you can deliver.",
    ].join("\n");
    window.open(
      buildWhatsAppLink(HOMEKRAFTED_WHATSAPP_NUMBER, message),
      "_blank",
      "noopener,noreferrer",
    );
    setSent(true);
  }

  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>Pre-order a meal</h2>
      <p className={styles.copy}>
        Full meals are ordered in the app, but you don&rsquo;t have to wait for it. Tell us when
        you&rsquo;d like to eat and we&rsquo;ll message you back with what&rsquo;s cooking near you.
      </p>

      <PreOrderPicker value={slot} onChange={setSlot} title="When would you like to eat?" />

      <Button variant="whatsapp" onClick={handleSend}>
        Pre-order on WhatsApp
      </Button>
      {sent && (
        <p className={styles.sent}>
          Opened WhatsApp — send the message and we&rsquo;ll reply with today&rsquo;s menu.
        </p>
      )}
    </Card>
  );
}
