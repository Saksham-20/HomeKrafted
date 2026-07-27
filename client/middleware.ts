import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Role-gate for the seller (M10a) and admin (M11, scaffolded) route
 * groups — see the plan's "Role surfaces & multi-role auth" section and
 * `lib/auth/AuthContext.tsx`'s file header for the full mock-vs-real
 * story. Reads the `hk_role` cookie `AuthContext` mirrors every sign-in/
 * sign-out into (mock: `localStorage` can't be read here, middleware
 * runs on the server/edge before any client JS executes) and redirects
 * anyone without the right role to that surface's login.
 *
 * **This is not real authorization.** The cookie is a plain, readable,
 * client-settable value — anyone can set `hk_role=seller` in devtools
 * and pass this check. It exists only to make the mock role model behave
 * like a real gate during frontend-first development (M10a/M10b/M11).
 * M8 swaps this for a signed/httpOnly Auth.js session cookie verified
 * here the same way — same `redirect` shape, same matcher, real trust.
 */

const SELLER_LOGIN_PATH = "/seller/login";
const ADMIN_LOGIN_PATH = "/admin/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get("hk_role")?.value;

  if (pathname.startsWith("/seller") && pathname !== SELLER_LOGIN_PATH) {
    if (role !== "seller") {
      return NextResponse.redirect(new URL(SELLER_LOGIN_PATH, request.url));
    }
  }

  // M11a: `/admin/*` routes now exist (`app/admin/**`) — this gate logic
  // was already reserved and mirrored the seller check exactly since
  // M10, so M11a built the routes + `/admin/login` + `signInAsAdmin()`
  // against it without touching this file.
  if (pathname.startsWith("/admin") && pathname !== ADMIN_LOGIN_PATH) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/seller/:path*", "/admin/:path*"],
};
