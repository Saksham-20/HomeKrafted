"use client";

import { useEffect } from "react";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/tokens.extend.css";
import {
  RouteMessage,
  RouteMessageButton,
  RouteMessageLink,
} from "@/components/feedback/RouteMessage";

export interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Last-resort boundary for an error thrown by the root layout itself —
 * a provider blowing up, a font load failing. It *replaces* the root
 * layout, so it has to supply its own `<html>`/`<body>` and pull the
 * stylesheets in directly; `next/font`'s variables are set on the root
 * layout's `<html>` and are gone here, which is why the token font
 * stacks' Georgia/system-ui fallbacks matter.
 *
 * Nothing on this page may touch a context — none of them are mounted.
 * That rules out `<Header>`/`<Footer>`, so the panel stands alone.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <RouteMessage
          tone="error"
          eyebrow="Something broke"
          title="Homekrafted didn't load"
          body="The site hit an error before it could start. Reloading usually clears it."
          actions={
            <>
              <RouteMessageButton onClick={reset}>Reload</RouteMessageButton>
              <RouteMessageLink href="/" variant="outline">
                Go home
              </RouteMessageLink>
            </>
          }
          detail={error.digest ? `Reference: ${error.digest}` : undefined}
        />
      </body>
    </html>
  );
}
