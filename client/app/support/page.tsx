import { SupportClient } from "@/components/support/SupportClient";
import { getSupportChatGreeting, getSupportPhone } from "@/lib/api";

/** `/support` (M7b) — chat widget + call CTA + ticket form, standalone route (not under the account shell — support is reachable signed-out too). */
export default async function SupportPage() {
  const [phone, greeting] = await Promise.all([getSupportPhone(), getSupportChatGreeting()]);

  return <SupportClient phone={phone} chatGreeting={greeting} />;
}
