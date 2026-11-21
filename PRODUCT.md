# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary, for the next few months (owner, 2026-09-23): gift buyers.**
  Urban Indian buyers, mostly on phones, choosing a present they want to
  feel personal — students and staff on the ISB Mohali campus for the
  current crochet pre-order, and tricity (Chandigarh · Mohali · Panchkula)
  buyers more broadly. Gifts ship across India.
- **Secondary, dormant: homemade-food buyers.** Food is browsable but not
  buyable (`PlatformSettings.foodOrdersOpen` off, "coming soon"). They
  return as a primary audience when the owner flips food open.
- **Supply side: HomeKrafters** — home cooks and independent makers who
  apply at `/sell`. The landing carries one pitch to them.

## Product Purpose

A marketplace where every listing is made by a named person in their own
home: homemade food from tricity home kitchens (cooked after you order)
and handcrafted gifts from independent makers. Success for the landing
page: a first-time visitor understands within one screen that a real
person makes each thing, finds the current campaign, and goes to a gift.

## Positioning

The maker is the product. A neighbouring marketplace can copy the
catalogue categories; it cannot truthfully claim that every item has a
named maker with a storefront, that food is cooked only after the order,
and that listings are reviewed by a person before they go live.

## Operating Context

- Campaign now: ISB Mohali crochet pre-order, delivered by hand on campus
  (free, the only destination checkout offers today).
- Occasions are dated by a person (Diwali, Raksha Bandhan, Karwa Chauth
  move every year); a seasonal countdown appears when one is close.
- Real footage exists: four hosted reels of real orders.

## Capabilities and Constraints

- Next.js App Router, CSS Modules over `styles/tokens.css` (law) +
  `styles/tokens.extend.css` (sanctioned overrides). No Tailwind, no
  shadcn, **no framer-motion**, no cva. Fonts via `next/font/google` only.
- Mobile-first; five breakpoint rails 420 · 560 · 640 · 780 · 900.
- One basket = one maker; checkout is one page; food orders are gated
  server-side.
- The native app compiles `client/lib`; anything under `lib/` stays free
  of React/DOM.

## Brand Commitments

- Name **Homekrafted**; makers are **HomeKrafters** in copy.
- Logo lockup (pine green + gold) is unchanged. Pine + gold remain the
  brand anchor; their *use* may change (owner, 2026-09-23).
- Landing typography (owner, 2026-11-21, supersedes 2026-10-23's Public
  Sans): **Fraunces headings over Hanken Grotesk body** — the same pair as
  the rest of the site.
- Gold (`#B98724`) never carries text; small gold-family text uses
  `--hk-gold-text-sm`.
- The ISB crochet campaign artwork remains an owner asset, but no longer
  appears on the landing page (owner, 2026-10-23).

## Evidence on Hand

- Real product photography under `client/public/images/products`
  (licensed Pexels stand-ins recorded in `docs/IMAGE-LICENSES.md`),
  category and site photography, four hosted reels + posters.
- Backers strip (CUNA, ISB AIC, CGC-J VentureNest) lives on `/about`,
  unverified — not a landing-page claim.
- **Absences that must not be fabricated:** maker counts ("200+"),
  review totals, delivery-time promises, hygiene inspections, a blanket
  guarantee, app-store availability (native apps are not published), any
  number the catalogue did not count.

## Product Principles

1. The person before the product — every surface names who made it.
2. Say only what a column holds; absence is never an answer.
3. Honest waiting beats fake speed: "cooked after you order" is the flex.
4. Location and taste never gate browsing.
5. A decision somebody's income depends on is made by a person, not a script.

## Accessibility & Inclusion

WCAG AA contrast measured by `e2e/tests/a11y.spec.ts` + `node
e2e/sweep.mjs`; `prefers-reduced-motion` honoured globally (CSS floor +
`lib/motion.ts`); no text control under 16px on phones; dialogs trap and
restore focus; cards that navigate are links.
