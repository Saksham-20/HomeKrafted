"use client";

import { useEffect } from "react";
import {
  RouteMessage,
  RouteMessageButton,
  RouteMessageLink,
} from "@/components/feedback/RouteMessage";

export interface SellerErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the HomeKrafter portal. Nested inside the
 * `(dashboard)` layout, so `<SellerShell>` — nav, header, sign-out —
 * stays painted and a failed module doesn't strand someone mid-shift
 * with no way back to their orders.
 */
export default function SellerError({ error, reset }: SellerErrorProps) {
  useEffect(() => {
    console.error("Seller portal error", error);
  }, [error]);

  return (
    <RouteMessage
      tone="error"
      eyebrow="Something broke"
      title="This didn't load"
      body="Your listings and orders are safe — this screen just failed to fetch. Try again, or head back to your dashboard."
      actions={
        <>
          <RouteMessageButton onClick={reset}>Try again</RouteMessageButton>
          <RouteMessageLink href="/seller" variant="outline">
            Back to dashboard
          </RouteMessageLink>
        </>
      }
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
    />
  );
}
