# Error handling — what a user sees, what a developer can find

Written 2026-08-11, the day a user could not sign in and the only
diagnostic anybody had was a screenshot they took themselves.

This document is the standard for the whole project. It exists because the
incident below was not a coding mistake — every layer behaved exactly as
written — and it still cost real users their accounts for an unknown
number of days, invisibly.

---

## The incident, because every rule here comes from it

`www.homekrafted.in` served the entire application on a second origin (one
nginx vhost answered for both names; certbot's port-80 redirect used
`$host`). The browser bundle calls the API at `https://homekrafted.in/api/v1`
and the API's CORS allowlist is the apex. So for anybody who arrived on
`www`:

1. Every page rendered perfectly — SSR does not care about origins.
2. Every API call was blocked by the browser before it left.
3. `fetch` rejected with a `TypeError`, indistinguishable from being
   offline.
4. The UI said **"Can't reach Homekrafted right now. Check your connection
   and try again."**
5. Nothing was logged. A blocked request produces no access-log line, no
   Sentry event, no metric. Every dashboard was green.

Four separate failures, and only the first is a config bug:

| # | Failure | Rule it produced |
|---|---|---|
| 1 | Two origins served the app | **§1 One origin** |
| 2 | The client could not tell "you are offline" from "we are broken" | **§2 Classify, don't guess** |
| 3 | The message blamed the user for our fault | **§3 Whose fault is it** |
| 4 | Nothing on our side ever knew | **§4 A failure nobody hears about** |

---

## §1 One origin

Covered in `docs/DEPLOY.md` → "One origin, and only one", and guarded by
`scripts/healthcheck.sh` → `check_canonical_host`. The short version: `www`
301s to the apex and the app is served from exactly one origin. Re-check
after any `certbot --nginx` run, which rewrites the vhost.

## §2 Classify, don't guess — `client/lib/api/unreachable.ts`

A rejected `fetch` has no status and no body, so the cause has to be
inferred. **Infer it from evidence, not from optimism.**

When `fetch` rejects, the client asks whether the **page's own origin**
still answers (a `HEAD` on `/favicon.ico`, 2.5s budget). That single
question separates the two cases:

- **origin answers** → the network is fine, the fault is ours →
  `SERVER_UNREACHABLE`
- **origin does not answer** → genuinely offline → `NETWORK_ERROR`

`navigator.onLine` is recorded as a hint and never as the answer: it
reports link state, so it is `true` on a captive portal and on a laptop
attached to a router with no upstream.

## §3 Whose fault is it — copy rules

Error copy has to be right about **who is responsible**, because the
reader acts on it. "Check your connection" sent a user to restart a router
that was working.

- **Our fault** (5xx, `SERVER_UNREACHABLE`): say so. *"Something on our end
  isn't responding. This one is us, not you."* Never suggest a remedy on
  their side; there isn't one.
- **Their input** (400/409/422): name the field and the fix. This is the
  only class where telling them to change something is honest.
- **Their session** (401/403): say what to do — sign in, or that this
  account cannot reach this screen.
- **Genuinely offline** (`NETWORK_ERROR`): now that it is distinguished
  from §2, "check your connection" is finally true, and only here.
- **Rate limited** (429): say when to come back, not "too many requests".
  `rateLimitMessage()` reads `Retry-After`.

Two things never to do: never render a raw browser string
("Failed to fetch", "Load failed") — it reads as a refusal of what was
typed; and never render a machine sentinel. `NAME_REQUIRED:` is a
protocol token the login form branches on, and if that branch is ever
removed the user is shown the token.

## §4 A failure nobody hears about

**`client/app/api/client-errors/route.ts`** — a Next route handler, on the
page's own origin.

The origin matters more than anything else about it: the failures worth
reporting are the ones where the API is unreachable, so a beacon posted to
the API would be blocked by the fault it is reporting. This route is
served by the same process that served the page, so it is reachable
whenever the page rendered at all. Do not "tidy" it into `server/`.

It takes no auth (a signed-out visitor's failure is the one most worth
hearing about), writes one bounded, newline-stripped JSON line to the Next
process log, and is capped at three reports per page load. Read it with:

```bash
pm2 logs homekrafted-web --lines 500 | grep client-error
```

## §5 Every 5xx carries a reference

`server/src/common/filters/all-exceptions.filter.ts` puts an 8-hex id in
the body, in the `X-Request-Id` header, and in the log line with the
method and path. The client appends it to the message, so the nineteen
screens that render `err.message` directly show it without each having to
know about it; `ApiError.reference` carries it for anything that wants to
present it properly.

**5xx only, deliberately.** In production a 500's real message is replaced
with "Something went wrong" (Prisma errors name tables and constraints —
that is a schema dump for anyone who can make a query fail). Correct, and
it made every 500 report identical and unsearchable. A 400 already says
what to fix and a 404 is not an incident; a code shown on ordinary
validation messages is one nobody quotes when it finally matters.

---

## Checklist for any new surface

1. Every `await` that can fail has a `catch` that puts something on the
   screen. `client/lib/silent-failure.spec.ts` fails the build otherwise —
   it exists because fifteen screens' Save button did nothing and said
   nothing.
2. The copy names the right party (§3).
3. A mutation shows an in-flight state, so the fix for "nothing happened"
   is not clicking again.
4. Empty, loading and error are three different states. Loading strings
   come from `lib/kitchen-copy.ts`.
5. Nothing renders a raw browser string or a machine sentinel.

## Still open

Ranked, and none of it is blocking today.

- **Sentry browser SDK.** `@sentry/nestjs` ships; the web half does not
  (Next 16 + Turbopack, see `TODOS.md`). §4 is the version that works
  today and cost one file, but it has no stack traces, no release
  tracking, and no alerting — somebody has to read the log.
- **Nothing alerts.** `check_canonical_host` writes to a log file on the
  box. An external monitor (UptimeRobot, free) pointed at `/health` is
  still the outstanding item in `docs/LAUNCH-READINESS.md`.
- **The 19 raw-`err.message` screens** could use a shared error component
  that renders the reference as a copyable chip rather than as text
  appended to a sentence.
- **A request id on every request, not only failures**, would let a
  support conversation start from "what happened at 14:32" rather than
  from an error the user happened to screenshot.
