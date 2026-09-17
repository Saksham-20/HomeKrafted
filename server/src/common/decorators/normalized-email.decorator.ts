import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

/**
 * An email field that is stored and looked up in one canonical form.
 *
 * **Why this exists.** `identifier.util.ts#parseIdentifier` lowercases an
 * email before it ever touches the database, and every path built on it
 * (`continueWithPassword`, `verifyOtp`, `socialLogin`) reads and writes that
 * canonical lowercase form. The legacy `/auth/register`, `/auth/login` and
 * `/auth/password/forgot` DTOs predate that helper and carried a bare
 * `@IsEmail()`, so `Person@Example.com` and `person@example.com` are two
 * different rows against a plain `String @unique` column
 * (`User.email` — not `citext`) — a duplicate account on register, and a
 * login/reset that can't find the account it just registered.
 *
 * The lowercase happens *before* validation and is kept, so the stored
 * value is the canonical one — validating a lowercased copy and then
 * storing the original as typed would pass the check and keep the bug.
 *
 * A non-string is passed through untouched so `@IsEmail()` can produce the
 * 400 rather than this throwing on `.toLowerCase()`.
 */
export function NormalizedEmail(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    IsEmail(),
  );
}
