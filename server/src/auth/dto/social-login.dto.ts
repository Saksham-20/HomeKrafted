import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A provider-signed id-token, and nothing else that decides identity.
 *
 * **`providerAccountId` and `email` used to live here, and deleting them
 * is the fix, not a tidy-up.** Until M27 this endpoint trusted whatever
 * email the client posted: sending `{"email":"admin@…"}` returned a full
 * admin session. Every identity field now comes out of the verified token
 * payload (`SocialTokenVerifier`), so the old body is not merely ignored —
 * with the global pipe's `forbidNonWhitelisted`, it is a 400. That is
 * deliberate: an ignored field can be quietly re-read by a later change,
 * a rejected one cannot.
 *
 * `nonce` and `name` are the only client-supplied values left, and neither
 * can grant access — the nonce is *compared* against the token's own
 * claim, and the name is a display fallback for Apple, which returns a
 * name once, outside the token, on first authorization only.
 */
export class SocialLoginDto {
  /** The provider's id-token (a JWT). Length-capped so a junk body is cheap to reject. */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  idToken!: string;

  /**
   * The one-time value the browser generated for this sign-in attempt.
   *
   * When present it must equal the token's `nonce` claim. Without it a
   * captured id-token stays replayable for its whole lifetime; with it,
   * it is useless against any later attempt.
   */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  nonce?: string;

  /** Display name for a first-time Apple sign-in, which omits it from the token. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
