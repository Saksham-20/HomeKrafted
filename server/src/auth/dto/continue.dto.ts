import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

/**
 * The single-field sign-in / sign-up form (M25).
 *
 * `identifier` is whatever was typed into the one box — an email address
 * or a mobile number — and the server decides which
 * (`identifier.util.ts`). It is **not** validated as either shape here:
 * `@IsEmail()` would reject every phone number and `@IsPhoneNumber()`
 * every address, and a DTO cannot express "one or the other" without
 * duplicating the parser. It is length-bounded and parsed in the service,
 * which returns a 400 with a message naming what was wrong.
 *
 * `name` is only read when the identifier turns out to be new. The client
 * sends it on the second attempt, after the first comes back asking for
 * it — see `AuthService.continueWithPassword`.
 */
export class ContinueDto {
  @TrimmedString(1, 254)
  identifier!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @TrimmedString(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  referredByCode?: string;
}
