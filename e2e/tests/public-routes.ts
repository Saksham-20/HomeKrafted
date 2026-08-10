/**
 * The public routes the fast CI gate walks.
 *
 * **One list, because two lists lie differently.** Until M27 `a11y.spec.ts`
 * held seven routes and `presentation.spec.ts` held eight (it had
 * `/hamper`), and both files described themselves as covering the public
 * site. Nobody had noticed they disagreed, which is the ordinary fate of
 * a constant that exists twice.
 *
 * **This is deliberately not the whole site, and the docs must not say it
 * is.** `CLAUDE.md` claimed the axe suite ran "over every public route"
 * when it ran over seven of about thirty-one — and that gap is not
 * academic: 114 contrast failures accumulated on the routes it did not
 * visit, found by the M26 sweep and fixed there. What is not measured is
 * not fixed.
 *
 * The division of labour, so neither instrument gets mistaken for the
 * other:
 *
 * - **This list** is the CI gate. It runs on every push, has to stay
 *   fast, and covers the surfaces a broken deploy would embarrass you on
 *   first.
 * - **`e2e/sweep.mjs`** is the real coverage: all 87 routes × 4 roles × 2
 *   viewports, axe included, screenshots written. It is slower and run
 *   deliberately — before calling a visual change done, per `CLAUDE.md`.
 *
 * Adding a public route means adding it here *and* to the sweep's own
 * list. If you only do one, do the sweep.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/shop',
  '/snacks',
  '/gifts',
  '/hamper',
  '/collections',
  '/about',
  '/meal-plans',
] as const;
