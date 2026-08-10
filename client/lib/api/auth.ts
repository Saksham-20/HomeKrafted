/**
 * Real auth wire calls (M8.4a) — thin wrappers over `POST /auth/*` +
 * `GET/PATCH /users/me` (`docs/API.md` "Auth model" / "Users & addresses").
 * Consumed by `lib/auth/AuthContext.tsx`, which owns the session
 * lifecycle (token storage, hydration, the demo-consumer auto-sign-in
 * fallback) — this module only ever makes the actual HTTP calls.
 */

import { http } from "./http";
import type { SessionUser } from "@/lib/auth/session";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResultDto extends AuthTokens {
  user: SessionUser;
}

/**
 * `POST /auth/otp/request` — issues a code to a mobile number **or** an
 * email address (M25). The server parses `identifier` and picks the
 * channel; nothing here needs to know which.
 */
export async function requestOtpCode(identifier: string): Promise<void> {
  await http.post<{ message: string }>("/auth/otp/request", { identifier }, { auth: false });
}

/** `POST /auth/otp/verify` — creates the account on first verify for an unseen identifier. */
export async function verifyOtpCode(
  identifier: string,
  code: string,
  name?: string,
): Promise<AuthResultDto> {
  return http.post<AuthResultDto>("/auth/otp/verify", { identifier, code, name }, { auth: false });
}

export interface ContinueResultDto extends AuthResultDto {
  /** True when this call created the account rather than signing in to one. */
  created: boolean;
  kind: "email" | "phone";
}

/**
 * `POST /auth/continue` — the single-field form's one call (M25).
 *
 * Signs in if the identifier is known and the password matches, creates
 * the account if it isn't. Three failures the caller has to tell apart,
 * and they are distinguished by **status**, not by message text:
 *
 * - **400** with `NAME_REQUIRED:` — new identifier, no name sent yet. Show
 *   the name field and resubmit. (Matched on the prefix because the error
 *   envelope derives `code` from the HTTP status alone, so every 400
 *   arrives as `BAD_REQUEST` — see `server/src/common/filters`.)
 * - **409** — the account exists but has no password. An approved
 *   HomeKrafter is exactly this, on their first ever visit. Offer the
 *   code route.
 * - **401** — wrong password.
 */
export async function continueWithPassword(input: {
  identifier: string;
  password: string;
  name?: string;
  referredByCode?: string;
}): Promise<ContinueResultDto> {
  return http.post<ContinueResultDto>("/auth/continue", input, { auth: false });
}

/** `POST /auth/login` — email + password. */
export async function loginWithEmail(email: string, password: string): Promise<AuthResultDto> {
  return http.post<AuthResultDto>("/auth/login", { email, password }, { auth: false });
}

/**
 * `POST /auth/password/forgot` — emails a single-use reset link.
 *
 * Resolves whether or not the address is registered, and the returned
 * message says "if an account exists" rather than "sent". That is
 * deliberate on the server side (an endpoint that answered differently
 * would tell anyone who asks whether a given person shops here), so the UI
 * must not try to be more helpful than the API and infer a result.
 */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return http.post<{ message: string }>("/auth/password/forgot", { email }, { auth: false });
}

/** `POST /auth/password/reset` — consumes the token from the emailed link. */
export async function resetPassword(
  token: string,
  password: string,
): Promise<{ message: string }> {
  return http.post<{ message: string }>(
    "/auth/password/reset",
    { token, password },
    { auth: false },
  );
}

/** `POST /auth/register` — email + password sign-up. */
export async function registerWithEmail(
  name: string,
  email: string,
  password: string,
  referredByCode?: string,
): Promise<AuthResultDto> {
  return http.post<AuthResultDto>(
    "/auth/register",
    { name, email, password, referredByCode },
    { auth: false },
  );
}

/** One provider's availability, as reported by `GET /auth/social/config`. */
export type SocialProviderConfig = {
  enabled: boolean;
  /** Public OAuth client id, for initialising the provider SDK. `null` when disabled. */
  clientId: string | null;
};

export type SocialConfig = {
  google: SocialProviderConfig;
  apple: SocialProviderConfig;
};

/** Every provider off — what a config fetch failure resolves to. */
export const SOCIAL_CONFIG_OFF: SocialConfig = {
  google: { enabled: false, clientId: null },
  apple: { enabled: false, clientId: null },
};

/**
 * `GET /auth/social/config` — which providers are actually usable.
 *
 * Read **server-side** by `app/login/page.tsx` and handed down, not
 * fetched from the browser: the auth routes are throttled per-IP, and a
 * whole office behind one NAT would otherwise burn that budget just
 * loading the sign-in page, making buttons vanish for reasons nothing
 * reports.
 *
 * The client id comes from here rather than a `NEXT_PUBLIC_*` inline so
 * server and browser cannot disagree — a half-configured pair renders a
 * button that can only fail.
 *
 * Fails **closed**: an unreachable API means no social buttons, which is
 * correct. The password and one-time-code paths are unaffected.
 */
export async function getSocialConfig(): Promise<SocialConfig> {
  try {
    return await http.get<SocialConfig>("/auth/social/config", { auth: false });
  } catch {
    return SOCIAL_CONFIG_OFF;
  }
}

/**
 * `POST /auth/social/:provider` — exchange a **provider-signed id-token**
 * for a Homekrafted session.
 *
 * Until M27 this posted a client-chosen `{providerAccountId, email}` and
 * the server trusted it, which made any account reachable by anyone who
 * knew its email address. Identity now comes only from the verified token
 * payload; the old fields are gone from the DTO and a body carrying them
 * is refused outright.
 *
 * `nonce` is minted per attempt by the caller and must match the token's
 * own claim, so a captured token cannot be replayed later. `name` is a
 * display fallback for Apple's first authorization, which returns a name
 * outside the token.
 */
export async function socialLogin(
  provider: "google" | "apple",
  input: { idToken: string; nonce?: string; name?: string },
): Promise<AuthResultDto> {
  return http.post<AuthResultDto>(`/auth/social/${provider}`, input, { auth: false });
}

/** `POST /auth/refresh` — rotating refresh; the presented token is revoked and replaced in the same call. */
export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  return http.post<AuthTokens>("/auth/refresh", { refreshToken }, { auth: false });
}

/** `POST /auth/logout` — revokes the refresh token server-side. */
export async function logoutSession(refreshToken: string): Promise<void> {
  await http.post<void>("/auth/logout", { refreshToken }, { auth: false });
}

/** `GET /users/me` — used both on session-hydrate (to catch a `suspended` flip) and by `AuthContext.refreshUser()`. */
export async function getMe(): Promise<SessionUser> {
  return http.get<SessionUser>("/users/me");
}

export interface UpdateMeInput {
  name?: string;
  email?: string;
  phone?: string;
}

/** `PATCH /users/me` — Profile screen's save action. */
export async function updateMe(patch: UpdateMeInput): Promise<SessionUser> {
  return http.patch<SessionUser>("/users/me", patch);
}
