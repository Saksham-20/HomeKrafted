# Browser tests

The layer the Jest suites cannot reach. `cd e2e && npm test`.

`docs/TESTS.md` describes the other three layers and why each exists; this
one exists because the 2026-08-07 audit found a whole class of defect that
**passed every one of them**:

- a Save button that did nothing and said nothing, on fifteen screens;
- Place order charging three times for three clicks in one second;
- product cards that were focusable and un-openable from a keyboard;
- two dialogs announcing `aria-modal` while trapping no focus at all;
- a location prompt opening over the admin login page and holding Tab
  while somebody tried to type a password.

None of those is visible without a rendered DOM, a real click, or a status
line.

## Running it

It needs the API and the web app already up, against a **seeded, throwaway**
database — the specs sign in as the demo accounts and one of them writes an
address. See `docs/TESTS.md` for the two commands, and never point it at a
database with real data in it.

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
npm test                 # both viewport projects
npm run test:headed      # watch it happen
npm run report           # open the last HTML report
```

`E2E_BASE_URL` (default `http://localhost:3100`) and `E2E_API_URL`
(default `http://localhost:4100/api/v1`) point it somewhere else.

## How it is laid out

| File | What it holds |
|---|---|
| `tests/auth.setup.ts` | Signs each role in once and caches the state. Also asserts `/admin/login` uses **what was typed** — it once called a hardcoded-credential helper and threw the inputs away. |
| `tests/focus-traps.spec.ts` | The two dialogs `docs/TESTS.md` names as owed: focus in, Tab trapped at both ends, focus restored. |
| `tests/audit-regressions.spec.ts` | One test per defect the audit found in a browser. |
| `fixtures/accounts.ts` | The demo accounts, overridable by environment. |
| `fixtures/location.ts` | Seeds "already asked" before navigation, so the first-visit prompt is not sitting over every click. |

## Two things that will bite

**`isVisible()` does not wait.** Calling it on a page that is still
hydrating returns `false`, and the usual next line is `test.skip()` — so
the test goes green having checked nothing. Both times that happened here
it looked exactly like a pass. Use `expect(...).toBeVisible()`.

**Every consumer page renders two `aria-modal` dialogs** — the mobile
drawer (present but hidden on desktop) and the location prompt. A
`[role="dialog"][aria-modal="true"]` locator matches both and trips strict
mode. `focus-traps.spec.ts` has named constants for each.
