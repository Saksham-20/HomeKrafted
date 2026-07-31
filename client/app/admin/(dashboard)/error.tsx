"use client";

import { useEffect } from "react";
import {
  RouteMessage,
  RouteMessageButton,
  RouteMessageLink,
} from "@/components/feedback/RouteMessage";

export interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Error boundary for the admin panel — keeps `<AdminShell>` and its nav painted. */
export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    console.error("Admin panel error", error);
  }, [error]);

  return (
    <RouteMessage
      tone="error"
      eyebrow="Something broke"
      title="This screen didn't load"
      body="No action was taken. Retry the screen, or go back to the dashboard."
      actions={
        <>
          <RouteMessageButton onClick={reset}>Try again</RouteMessageButton>
          <RouteMessageLink href="/admin" variant="outline">
            Back to dashboard
          </RouteMessageLink>
        </>
      }
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
    />
  );
}
