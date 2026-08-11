import { NextResponse } from "next/server";

/**
 * Where a browser-side failure goes so a human finds out.
 *
 * **Why this exists.** On 2026-08-11 a user could not sign in. `www` was
 * serving the whole app on a second origin, so every API call from those
 * pages was blocked by CORS; `fetch` rejected, and the UI told them to
 * check their connection. Nothing was logged anywhere on our side, because
 * **the request never reached the server** — a blocked request produces no
 * access log line, no Sentry event, no metric. The site looked perfectly
 * healthy from every angle we could see. The detector was a customer
 * sending a screenshot.
 *
 * **Why it is a Next route handler and not a Nest endpoint.** This is the
 * whole point, and it is easy to undo by "tidying" it into `server/`. The
 * failures worth reporting are exactly the ones where the API is
 * unreachable — wrong origin, CORS, DNS, the API down, a captive portal.
 * A beacon posted to the API would be blocked by the same fault it is
 * trying to report. This route is served by the same Next process that
 * served the page, on the page's own origin, so it is reachable whenever
 * the page itself rendered. It has no CORS to fail and no cross-origin CSP
 * to satisfy.
 *
 * **It is deliberately small.** No auth (a signed-out visitor's failure is
 * the one most worth hearing about, and a token would not survive the
 * fault anyway), no database, no dependency on the API being up. It writes
 * a structured line to the Next process log, which pm2 captures — see
 * `docs/DEPLOY.md`. Sentry's browser SDK would be the richer answer and is
 * still open (`TODOS.md`); this is the version that works today and costs
 * one file.
 *
 * **Trust nothing in the body.** It is an unauthenticated public endpoint,
 * so everything is bounded and clipped before it is logged: an attacker
 * can otherwise write arbitrary volume into our logs, or forge log lines
 * with embedded newlines. Nothing here is ever rendered back to anybody.
 */

/** Hard caps. A log line is not a place to put an unbounded string. */
const MAX_FIELD = 300;
const MAX_BODY_BYTES = 4_000;

/** One-line, newline-free, bounded. */
function clean(value: unknown, max = MAX_FIELD): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  // Newlines would let a caller forge additional log lines.
  return value.replace(/[\r\n\t]+/g, " ").slice(0, max);
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;

  const entry = {
    at: new Date().toISOString(),
    kind: clean(b.kind, 40) ?? "unknown",
    message: clean(b.message),
    // The page the visitor was on, and the request that failed. In the
    // incident above these two differing in *origin* was the entire bug,
    // so both are recorded rather than just the failing URL.
    page: clean(b.page),
    target: clean(b.target),
    apiBase: clean(b.apiBase),
    online: typeof b.online === "boolean" ? b.online : undefined,
    // Whether the app's own origin was reachable at the moment the API
    // call failed. `true` here with a failed API call is the signature of
    // a configuration fault rather than a visitor's bad connection — it is
    // the difference between "they are on a train" and "we are broken".
    selfReachable: typeof b.selfReachable === "boolean" ? b.selfReachable : undefined,
    ua: clean(request.headers.get("user-agent"), 200),
  };

  // One line, machine-greppable, on stderr so it is visible at pm2's
  // default log level and never mixed into request logging.
  console.error(`[client-error] ${JSON.stringify(entry)}`);

  // 204: the browser is not waiting on this and there is nothing to say.
  return new NextResponse(null, { status: 204 });
}

/**
 * A GET is almost certainly a person or a crawler poking at the path.
 * Answering 405 rather than 404 says the route exists and takes POST,
 * which is the useful thing to know when you are checking whether the
 * beacon is deployed at all.
 */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true, accepts: "POST" }, { status: 405 });
}
