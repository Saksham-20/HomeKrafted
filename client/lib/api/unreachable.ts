/**
 * Telling "your connection is down" apart from "we are broken".
 *
 * **The incident this comes from.** On 2026-08-11 a user could not sign in
 * and was shown *"Can't reach Homekrafted right now. Check your connection
 * and try again."* Their connection was fine. `www.homekrafted.in` was
 * serving the whole app on a second origin, so every API call from those
 * pages was blocked by CORS. A CORS block rejects `fetch` with exactly the
 * same `TypeError` as a dead network, so the client could not tell the two
 * apart and guessed the charitable-sounding one — which happened to blame
 * the visitor for our misconfiguration, and sent them off to restart their
 * router.
 *
 * Two things follow, and this module is both of them.
 *
 * **1. Distinguish, don't guess.** When `fetch` rejects we ask a question
 * the browser can actually answer: is the *page's own origin* still
 * reachable? If it is, the network is up and the fault is ours — different
 * copy, and no advice about their wifi. `navigator.onLine` alone is not
 * enough: it reports link state, so it is `true` on a captive portal and
 * on a laptop connected to a router with no upstream. It is recorded as a
 * hint, never as the answer.
 *
 * **2. Tell somebody.** The report goes to `/api/client-errors`, a Next
 * route handler on the page's own origin — deliberately not the API, which
 * is by definition the thing that just failed. See that file for why.
 *
 * Nothing here throws or blocks: a diagnostic that breaks the error path
 * makes an outage worse. Every call is bounded and every failure is
 * swallowed.
 */

/** How long the reachability probe may take. Short: a person is waiting. */
const PROBE_TIMEOUT_MS = 2500;

/** Don't beacon the same fault over and over from one page. */
const MAX_REPORTS_PER_PAGE = 3;
let reportsSent = 0;

export type Reachability = "offline" | "server-unreachable" | "unknown";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Is our own origin answering?
 *
 * Deliberately fetches a **same-origin** URL. If this succeeds while an API
 * call just failed, the visitor's network is working and the problem is on
 * our side — the exact signature of the origin/CORS fault above.
 *
 * `cache: "no-store"` so a service worker or the HTTP cache cannot answer
 * for a server that is actually gone.
 */
async function selfOriginReachable(): Promise<boolean> {
  if (!isBrowser()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // The favicon is static, tiny, always present, and served by the same
    // process that served the page. A dedicated endpoint would be one more
    // thing that can be missing in exactly the situation being diagnosed.
    await fetch(`/favicon.ico?probe=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify a rejected `fetch`, and report it when the fault looks like
 * ours. Returns the classification so the caller can choose its wording.
 */
export async function classifyAndReport(target: string): Promise<Reachability> {
  if (!isBrowser()) return "unknown";

  const online = typeof navigator !== "undefined" ? navigator.onLine : undefined;
  const reachable = await selfOriginReachable();

  // Our own origin answers, so the network is up and something on our side
  // ate the API call: wrong origin, CORS, a dead API, a bad proxy rule.
  const kind: Reachability = reachable ? "server-unreachable" : "offline";

  // Only report the case that is actionable for us. A genuinely offline
  // visitor generates no useful signal and could not deliver it anyway.
  if (kind === "server-unreachable") {
    void report({
      kind: "api-unreachable",
      message: "fetch rejected while the app's own origin was reachable",
      target,
      online,
      selfReachable: reachable,
    });
  }

  return kind;
}

export interface ClientErrorReport {
  kind: string;
  message?: string;
  target?: string;
  online?: boolean;
  selfReachable?: boolean;
}

/**
 * Fire-and-forget beacon. Never throws, never awaited by a render path.
 *
 * `keepalive` so a report survives the visitor navigating away or closing
 * the tab immediately after the failure — which is exactly what somebody
 * does when a page looks broken.
 */
export async function report(entry: ClientErrorReport): Promise<void> {
  if (!isBrowser()) return;
  if (reportsSent >= MAX_REPORTS_PER_PAGE) return;
  reportsSent += 1;

  const body = JSON.stringify({
    ...entry,
    page: window.location.href,
    // The origin mismatch between `page` and `apiBase` *was* the bug, so
    // both travel together and neither is inferred at the other end.
    apiBase: process.env.NEXT_PUBLIC_API_URL ?? "(unset)",
  });

  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // Nothing sensible to do. The diagnostic must never become the fault.
  }
}
