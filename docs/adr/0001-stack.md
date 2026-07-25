# ADR 0001: Stack, execution model, and styling approach

**Status:** Accepted (M0)

## Context

Homekrafted needs a single, greenfield web app covering four fairly
different product surfaces (marketplace e-commerce, service booking,
menu+WhatsApp ordering, promo-only marketing) that all share one account
and wallet layer. A design system already exists (`handoff/`) as a
proprietary prototype (`x-dc`/`DCLogic`) plus tokens/component docs — a
visual contract, not shippable code. Scope is large (M0 through M9); it
needs to be buildable incrementally without the backend blocking UI work,
and reviewable milestone by milestone.

## Decisions

1. **Next.js, full-stack, App Router, TypeScript, npm.** One framework for
   routing, server components, and (from M8) API routes — avoids standing
   up a separate backend service for what is, at this scale, well within
   what Next.js route handlers can serve. npm because the plan's
   verification steps (`npm run dev`/`npm run build`) assume it.

2. **Frontend-first build order.** Every milestone through M7 builds
   full, responsive UI against **typed mock data** (`lib/data/` behind
   `lib/api/`), before any real backend exists. The domain types that fall
   out of building real screens (`lib/types/`) become the Prisma schema in
   M8 — letting actual UI needs shape the schema, rather than guessing a
   backend model up front and bending screens to fit it. This also means
   the whole frontend is demoable and reviewable long before auth/payments
   are wired.

3. **Opus plans + reviews, Sonnet builds — one milestone at a time.** Opus
   (orchestrator) writes each milestone's brief and Definition-of-Done,
   dispatches a Sonnet subagent to implement it against the plan + this
   repo's `CLAUDE.md`, then runs `/review` + `/design-review` (+
   `/security-review` for backend work) before integrating. Foundation
   (M0) is blocking; independent feature milestones (e.g. Laundry vs.
   Snacks) can run in parallel once M0 + M1 land.

4. **CSS Modules over `tokens.css`, not Tailwind, not inline styles.** The
   design system ships as CSS custom properties
   (`handoff/design-system/tokens.css`) with a component inventory
   (`components.md`) describing states (default/hover/selected/disabled)
   per component — CSS Modules map onto that directly (one stylesheet per
   component, `var(--hk-...)` throughout) without a utility-class layer
   translating token names into a second vocabulary. The prototype's own
   technique (huge inline `style="..."` strings) is explicitly a
   reviewer/prototyping convenience, not a pattern to carry into
   production code.

5. **Auth.js + Razorpay deferred to M8, not scaffolded early.** Phone
   OTP + email + social login (Auth.js) and payments (Razorpay, ₹) are
   real integrations with real credentials and webhook surfaces — adding
   them before there's a real backend to secure them against would mean
   either fake/no security or premature infrastructure. `lib/api/` and
   `lib/messaging.ts` are built so the swap is contained: mock reads
   become real `fetch()`s, click-to-chat becomes a Cloud API call, in
   both cases behind an interface/module boundary that call sites don't
   need to know about.

6. **Messaging abstraction from day one, not just "WhatsApp later."**
   `lib/messaging.ts` defines a `Messaging` interface now, with a
   click-to-chat (`wa.me`) implementation backing Snacks in M5 — and a
   documented stub for the M9 WhatsApp Cloud API implementation. This
   means Snacks' UI code (and any future order-status notification code)
   is written once against the interface, not rewritten when Cloud API
   access is provisioned.

## Consequences

- Every milestone's Definition-of-Done includes "builds + typechecks +
  lints clean" — mock data has to be real `lib/types`-shaped data, not
  loose objects, so type errors surface immediately rather than at M8.
- `lib/api/` is a hard boundary: components must not import `lib/data`
  directly. Skipping this for "just one quick read" would leak
  mock-specific shapes into components and make the M8 swap non-mechanical.
- Some visual details in the prototype use colors that aren't in
  `tokens.css` (see `CLAUDE.md` → "Known token gaps"). Because
  `tokens.css` is a verbatim, load-bearing copy of the design system, M0
  did not add new token names unilaterally — gaps are hardcoded locally
  with a comment and flagged for the design system owner instead.
- Until M8, "the API" has no network latency, no auth, and no real
  persistence — anything that looks like it works end-to-end before M8
  (e.g. the wallet balance in the header) is reading a static mock value,
  not state that responds to user actions yet.
