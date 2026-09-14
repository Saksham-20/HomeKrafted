import { scrollBehavior } from "@/lib/motion";

/**
 * Put the cursor in the first field a failed save complained about.
 *
 * A banner saying "2 things are missing — they are marked on the form" is
 * only true if somebody can find them, and on the listing form they could
 * not: the two fields that fail most often sit two thirds of the way down
 * a twenty-field page, below the fold, with nothing to scroll the page to
 * them. A HomeKrafter editing the price of an existing listing read that
 * sentence, scrolled, found nothing marked, and gave up.
 *
 * This lives in `components/portal/` rather than `lib/` on purpose: it
 * touches `document`, and `client/lib` is compiled by the native app's
 * Metro, where a DOM global is a crash the bundler cannot see
 * (`lib/shared-boundary.spec.ts`). The pure half — which field is first,
 * and what its id is — is in `lib/sell/listing-input.ts` and is shared.
 *
 * `scrollIntoView` is a script instruction and ignores
 * `prefers-reduced-motion` entirely, so the behaviour comes from
 * `lib/motion.ts` rather than a literal `"smooth"`.
 */
export function focusFirstError(fieldId: string | undefined): void {
  if (!fieldId || typeof document === "undefined") return;

  // Two frames: the first lets React commit the error state (the field may
  // not be rendered yet — a section can be collapsed until it has a
  // problem), the second lets layout settle before we measure it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId);
      if (!el) return;

      el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });

      /*
       * `preventScroll` because `scrollIntoView` above already chose the
       * position, and focus() would otherwise re-scroll with the browser's
       * own default — which lands the field under the sticky header.
       *
       * Focus is what makes this work for a keyboard or screen-reader
       * user: `Field` has already put `role="alert"` on the message and
       * `aria-describedby` on the control, so landing here reads the
       * problem out. Scrolling alone would move the page and tell them
       * nothing.
       */
      if (el instanceof HTMLElement) {
        el.focus({ preventScroll: true });
      }
    });
  });
}
