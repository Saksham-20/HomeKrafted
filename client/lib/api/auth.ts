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

/** `POST /auth/otp/request` — issues a 6-digit code, stub-logged server-side (real SMS lands M9). */
export async function requestPhoneOtp(phone: string): Promise<void> {
  await http.post<{ message: string }>("/auth/otp/request", { phone }, { auth: false });
}

/** `POST /auth/otp/verify` — creates the account on first verify for an unseen phone. */
export async function verifyPhoneOtp(
  phone: string,
  code: string,
  name?: string,
): Promise<AuthResultDto> {
  return http.post<AuthResultDto>("/auth/otp/verify", { phone, code, name }, { auth: false });
}

/** `POST /auth/login` — email + password. */
export async function loginWithEmail(email: string, password: string): Promise<AuthResultDto> {
  return http.post<AuthResultDto>("/auth/login", { email, password }, { auth: false });
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

/**
 * `POST /auth/social/:provider` — **stub** (`server/src/auth/dto/social-login.dto.ts`):
 * trusts a client-submitted `{providerAccountId, email?, name?}` instead of
 * a verified OAuth token, since there's no real Google/Apple SDK wired up
 * yet. `AuthContext` generates + persists a stable per-provider
 * `providerAccountId` in `localStorage` so repeated "Continue with
 * Google/Apple" clicks in the same browser resolve to the same demo
 * account instead of minting a new one every time.
 */
export async function socialLogin(
  provider: "google" | "apple",
  input: { providerAccountId: string; email?: string; name?: string },
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
