import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { RETURN_TO_PARAM } from "@/lib/auth/return-to";

/**
 * Role-gate for the seller (M10a) and admin (M11, scaffolded) route
 * groups — see the plan's "Auth UX + seller dual-mode" section and
 * `lib/auth/AuthContext.tsx`'s file header for the full mock-vs-real
 * story. Reads the `hk_role` cookie `AuthContext` mirrors every sign-in/
 * sign-out into (real seller/consumer sessions included, since M8.5 —
 * `localStorage`/the JWT itself can't be read here, middleware runs on
 * the server/edge before any client JS executes) and redirects anyone
 * without the right role away from that surface.
 *
 * **The gate (M8.5): `/seller/*` requires `role === "seller"`; a seller
 * is never blocked from any consumer route** — this middleware's
 * `matcher` only covers `/seller/*`/`/admin/*`, so `/`, `/shop`, `/cart`,
 * etc. are never touched here regardless of role, which is exactly what
 * "a seller can also shop, same session" (the dual-mode requirement)
 * needs — there is nothing to gate on the consumer side. A signed-out
 * visitor hitting `/seller/*` is sent to the unified `/login?role=seller`
 * (M8.5 folded `/seller/login` into `/login`, see `LoginClient.tsx`); a
 * signed-in **consumer** is sent to `/sell` (a "become a seller" prompt,
 * not a login screen — they're already signed in, just not a seller
 * yet); a signed-in **admin** is sent back to their own `/admin` surface.
 * `/admin/*` is unchanged — admin-only, own login, never publicly
 * offered.
 *
 * **This is not real authorization.** The cookie is a plain, readable,
 * client-settable value — anyone can set `hk_role=seller` in devtools
 * and pass this check. It exists only to make the role model behave like
 * a real gate purely for routing/chrome purposes; the actual data (once
 * `/seller`'s `lib/api` swaps to real calls in M8.4b) is authorized
 * server-side off the real JWT, same as every other endpoint.
 */

const SELLER_LOGIN_PATH = "/login";
const BECOME_SELLER_PATH = "/sell";
const ADMIN_HOME_PATH = "/admin";
const ADMIN_LOGIN_PATH = "/admin/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get("hk_role")?.value;

  // **A signed-out prefetch of `/seller` is redirected, and cannot be
  // exempted here (measured M31).** `LoginClient` prefetches `/seller`
  // so a HomeKrafter's chunks are warm before they submit; the visitor
  // is signed out at that moment, so every one of those prefetches gets
  // the 307 below and the chunks arrive cold anyway. An exemption was
  // written and reverted: Next strips its own routing headers
  // (`next-router-prefetch`, `rsc`, `next-router-segment-prefetch`)
  // before middleware runs, so the check matched nothing and only
  // *looked* like it worked. `purpose: prefetch` does survive, but
  // Next's router never sends it — only `<link rel=prefetch>` does.
  // Don't re-add it without first proving, in a browser, that the header
  // you are testing actually reaches this function.
  if (pathname.startsWith("/seller") && pathname !== "/seller/login") {
    if (role === "seller") {
      // allowed
    } else if (role === "admin") {
      return NextResponse.redirect(new URL(ADMIN_HOME_PATH, request.url));
    } else if (role === "consumer") {
      return NextResponse.redirect(new URL(BECOME_SELLER_PATH, request.url));
    } else {
      const url = new URL(SELLER_LOGIN_PATH, request.url);
      url.searchParams.set("role", "seller");
      // Carry where they were trying to go. Without it, a HomeKrafter
      // whose session expired on an order they were part-way through
      // signs in and lands on the dashboard, with no route back to it.
      url.searchParams.set(RETURN_TO_PARAM, pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  // M11a: `/admin/*` routes now exist (`app/admin/**`) — this gate logic
  // was already reserved and mirrored the seller check exactly since
  // M10, so M11a built the routes + `/admin/login` + `signInAsAdmin()`
  // against it without touching this file. Admin stays internal-only —
  // not part of the M8.5 public role chooser, no equivalent "become an
  // admin" redirect for other roles.
  if (pathname.startsWith("/admin") && pathname !== ADMIN_LOGIN_PATH) {
    if (role !== "admin") {
      const url = new URL(ADMIN_LOGIN_PATH, request.url);
      url.searchParams.set(RETURN_TO_PARAM, pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/seller/:path*", "/admin/:path*"],
};
