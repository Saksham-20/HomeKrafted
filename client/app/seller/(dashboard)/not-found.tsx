import { RouteMessage, RouteMessageLink } from "@/components/feedback/RouteMessage";

/** 404 inside the HomeKrafter portal — keeps `<SellerShell>` around it, unlike the consumer 404. */
export default function SellerNotFound() {
  return (
    <RouteMessage
      eyebrow="404"
      title="Not in your portal"
      body="That listing, order or pickup either doesn't exist or belongs to another HomeKrafter."
      actions={<RouteMessageLink href="/seller">Back to dashboard</RouteMessageLink>}
    />
  );
}
