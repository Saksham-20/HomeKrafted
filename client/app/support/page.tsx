import type { Metadata } from "next";
import { SupportClient } from "@/components/support/SupportClient";
import { getSupportChatGreeting, getSupportPhone } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

/** `/support` (M7b) — chat widget + call CTA + ticket form, standalone route (not under the account shell — support is reachable signed-out too). */
export const metadata: Metadata = pageMetadata({
  title: "Support",
  description:
    "Order gone wrong, refund not landed, or a question about a HomeKrafter? Chat, call, or raise a ticket and we'll pick it up.",
  path: "/support",
});

export default async function SupportPage() {
  const [phone, greeting] = await Promise.all([getSupportPhone(), getSupportChatGreeting()]);

  return <SupportClient phone={phone} chatGreeting={greeting} />;
}
