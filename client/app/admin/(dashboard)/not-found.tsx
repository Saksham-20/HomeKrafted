import { RouteMessage, RouteMessageLink } from "@/components/feedback/RouteMessage";

/** 404 inside the admin panel — keeps `<AdminShell>` around it. */
export default function AdminNotFound() {
  return (
    <RouteMessage
      eyebrow="404"
      title="No such record"
      body="That user, order, listing or collection doesn't exist — it may have been deleted since the link was made."
      actions={<RouteMessageLink href="/admin">Back to dashboard</RouteMessageLink>}
    />
  );
}
