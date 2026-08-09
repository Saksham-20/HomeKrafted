# M26 — QA sweep ledger

Findings, appended live. The plan is `docs/M26-QA-PLAN.md`; the severity
predicates are its §2 and the judgement criteria are its §7.1 and §7.2.

**Coverage does not live here.** A clean route produces zero rows, which is
indistinguishable from a route nobody opened — so "what is left" is
`docs/route-inventory.tsv`, not this file:

```bash
grep -c '	—	' docs/route-inventory.tsv     # routes still unswept
grep -c '^M26-' docs/M26-QA-LEDGER.md         # findings against the 80 budget
```

**Single writer.** A second sweeper files into `docs/M26-QA-LEDGER-<name>.md`
and prefixes their IDs (`B-001`), merged at wave close. Two sessions
appending to one markdown file is a merge conflict on every row.

**Severity is written before the fix is estimated** (plan §2), so a cheap
fix cannot inflate its own priority. P0 money/data/security/dead-end · P1
blocked with no workaround · P2 wrong or confusing, with a workaround ·
P3 polish. A design defect that prevents the primary action being found or
performed is P1; one that merely makes the screen worse is a capped Q1
proposal, filed in that wave's proposals section rather than here.

**A finding is closed by a diff or by a written deferral**, never by an
opinion. The Fix column records the command that reproduces the failure on
the parent commit — stash the fix, run the new spec, paste the red output.

---

| ID | Wave | Route/flow | Persona | Viewport | Sev | Rule | What happened | Expected | Evidence | Dupe-of | Fix / deferred + why |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M26-001 | 0 | `e2e/` browser layer | — | both | **P1** | plan §11 (a rule with no test is a preference) | `auth.setup.ts` drove the two-tab login form M25 deleted; two of three setup steps timed out and every dependent test **skipped**, so the reporter printed "0 failed". CI could not catch it either — the browser job set `JWT_SECRET` where `env.validation.ts` requires `JWT_ACCESS_SECRET`, so its API never booted. | The suite runs, and a broken fixture fails loudly rather than skipping. | parent commit: 2 failed / 30.4s; fixed: 129 passed / 22.8s | — | **Fixed** `eefc155`. Selectors moved to `e2e/fixtures/sign-in.ts` (one place — the duplication across the setup and six blocks of `error-paths.spec.ts` is why it drifted), anchored on the placeholder because the label relabels itself as you type, throwing a named diagnosis instead of timing out. |
| M26-002 | 0 | `/shop` filters | any | 390 | P2 | `e2e/README.md` (isVisible does not wait) | `openFilters` probed with `isVisible()`, an instant check that answers false mid-hydration. The click never happened and the failure surfaced 30s later at the checkbox. Product verified fine at 390px first — this was the test. | The helper waits for whichever shape the viewport renders. | 3 mobile tests, all green after | — | **Fixed** `eefc155`. Mobile-only because desktop has no toggle to miss. |
| M26-003 | 0 | `/admin/orders` | admin | both | P2 | — | The "search reaches an order not on the first page" test can never pass against the documented dataset: 21 rows across orders, laundry bookings and snack orders, against `DEFAULT_ORDER_PAGE_SIZE` 25. It waited for a "Next" that was correctly absent. | A precondition the seed can actually produce. | — | — | **Fixed** `eefc155` — `prisma/seed-browser-orders.ts`, browser-stack only, kept out of `seed.ts` so 20 filler orders stay out of every tester's history. |
| M26-004 | 0 | `/account/orders` | first-time buyer | both | P2 | plan §7.1 (no live copy names a withdrawn module) | The subtitle read "Marketplace orders and laundry bookings, in one place", the empty state read "bookings made on **Laundry** will show up here", and a Laundry filter chip sat above both. Laundry was withdrawn in M19 and `/laundry` 404s — so the first screen a new account saw pointed three times at a module that does not exist. | Copy that names only what this buyer can still do. | `OrdersListClient.tsx:49,70` + the chip at `:18`; verified in a browser on both a fresh account and one with bookings | — | **Fixed.** All three are now conditional on the account actually having a booking — deleting the word outright would have lost six real bookings their only filter. The empty state also gained its third part (a way out). Spec: `e2e/tests/withdrawn-modules.spec.ts`; red against the parent (`git stash push -- client/components/account/OrdersListClient.tsx`), green after. |
| M26-005 | 0 | docs | — | — | P3 | `CLAUDE.md` docs upkeep | `PRODUCTION-AUDIT.md` L3 says `/gallery` is "publicly routable in production". `client/app/gallery/page.tsx:57` calls `notFound()` when `NODE_ENV === "production"`. `DESIGN-SYSTEM.md` is right; the audit is stale. | Docs that do not contradict the source. | — | — | **Open**, Wave 0.7. Deletes a Wave 1 decision — there is nothing to gate. |
| M26-006 | 0 | docs | — | — | P3 | `CLAUDE.md` docs upkeep | `CLAUDE.md` and `PRODUCTION-AUDIT.md` M3 both say the axe suite runs "over every public route at both viewports". It runs over 7 of ~31, and `presentation.spec.ts` has a *different* list of 8 (it has `/hamper`, a11y does not). | One derived list, and docs that describe it accurately. | `e2e/tests/a11y.spec.ts:23`, `presentation.spec.ts:14` | — | **Open**, Wave 0.8 / T4. |
| M26-007 | 0 | `CHANGELOG.md` | — | — | P3 | `CLAUDE.md` docs upkeep | No M22, M23 or M24 entry; the newest-but-one heading is `[M21] … (in progress)` holding what `CLAUDE.md` calls M23. | A ledger that names what shipped. | — | — | **Open**, Wave 0.7. |

---

## Wave 0 — proposals (max 5)

*None yet. Q1/Q3 improvements go here as proposals with a screenshot and a
one-line counter-proposal — not as work.*
