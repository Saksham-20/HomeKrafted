"use client";

import { useEffect } from "react";
import {
  RouteMessage,
  RouteMessageButton,
  RouteMessageLink,
} from "@/components/feedback/RouteMessage";

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * App-wide error boundary. Without this file any thrown render error
 * takes the whole document white — Next's fallback in production is a
 * bare "Application error" string with no way back into the site.
 *
 * `error.message` is deliberately never rendered: in a production build
 * Next replaces it with a generic string anyway, and in dev it can carry
 * query fragments or ids that shouldn't be read aloud to a shopper. The
 * `digest` is safe (it's a hash Next also writes to the server log) and
 * is what a support agent needs to find the trace.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Server-side render errors already log on the box; this covers the
    // client-side half so both halves of a hydration-time failure land
    // somewhere. Swap for a real error reporter when one exists.
    console.error("Route error", error);
  }, [error]);

  return (
    <RouteMessage
      tone="error"
      eyebrow="Something broke"
      title="This page didn't load"
      body="That's on us, not you. Try again — if it keeps happening, our support team can pick it up from here."
      actions={
        <>
          <RouteMessageButton onClick={reset}>Try again</RouteMessageButton>
          <RouteMessageLink href="/support" variant="outline">
            Contact support
          </RouteMessageLink>
        </>
      }
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
    />
  );
}
