import type { UserRole } from "@/lib/types";

/**
 * Where to send somebody after they sign in, when they did not choose to
 * be at the sign-in screen.
 *
 * Three paths lead here and all three used to throw the destination away:
 * the edge gate on `/seller/*` and `/admin/*`, and an access token
 * expiring mid-request (`lib/api/http.ts` redirects to `/login` when the
 * refresh fails). Signing in then landed on the role's home screen, so
 * anyone who had been ten minutes into a page came back to the top of a
 * dashboard with no route to where they were.
 *
 * **`next` is attacker-controlled, so it is validated, never trusted.**
 * An unchecked one is an open redirect: `/login?next=https://evil.example`
 * turns our own domain into the referrer for a credential-harvesting page,
 * and `//evil.example` is a protocol-relative URL that reads as a path.
 * The rule here is deliberately strict — one leading slash, no second
 * slash, no backslash, no scheme — rather than a blocklist of the tricks
 * known today.
 */

export const RETURN_TO_PARAM = "next";

/**
 * The requested path if it is a same-origin relative path, `undefined`
 * otherwise. Query and hash survive; anything that could leave the site
 * does not.
 */
export function safeReturnTo(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // A single leading slash and nothing that starts a host or a scheme.
  // `//host`, `/\host` (which some parsers read as `//host`) and
  // `https://host` are all rejected by this one condition.
  if (!raw.startsWith("/")) return undefined;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return undefined;
  // A control character can hide the rest of the string from a log or a
  // human reading the URL bar; it has no legitimate place in a path.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return undefined;
  return raw;
}

/**
 * A signed-in account may only be returned somewhere its role can
 * actually reach.
 *
 * Without this, a consumer whose session expired on `/seller/orders` is
 * sent back there after signing in, the edge gate bounces them to `/sell`,
 * and the round trip reads as the login having failed. The role's own home
 * screen is the honest answer in that case.
 */
export function returnToForRole(next: string | undefined, role: UserRole): string | undefined {
  if (!next) return undefined;
  if (role === "admin") return next;
  if (next.startsWith("/admin")) return undefined;
  if (role === "seller") return next;
  return next.startsWith("/seller") ? undefined : next;
}

/** Adds the current location to a sign-in URL, when there is one worth keeping. */
export function withReturnTo(loginPath: string, currentPathAndQuery: string): string {
  const next = safeReturnTo(currentPathAndQuery);
  if (!next) return loginPath;
  const separator = loginPath.includes("?") ? "&" : "?";
  return `${loginPath}${separator}${RETURN_TO_PARAM}=${encodeURIComponent(next)}`;
}
