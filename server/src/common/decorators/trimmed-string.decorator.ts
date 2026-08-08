import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A text field that has to contain something a person can read.
 *
 * **Why this exists.** `@MinLength(1)` counts *characters*, and `"   "` is
 * three of them. So a name made entirely of spaces passed every check and
 * was stored verbatim — `POST /auth/register` with `{"name": "   "}`
 * returned 201, and the account then rendered as a blank in the admin user
 * list, the wallet liability table, the order rows that show
 * `customerName`, and as the `refereeName` on a referral. Found in a
 * browser during the 2026-08-07 audit: a row on `/admin/wallet` with no
 * name at all.
 *
 * The trim happens *before* validation and is kept, so the stored value is
 * the trimmed one — validating a trimmed copy and then storing the padded
 * original would pass the test and keep the bug.
 *
 * A non-string is passed through untouched so `@IsString()` can produce
 * the 400 rather than this throwing on `.trim()`.
 *
 * Use it for any human-readable name or title. It is not for free text
 * where interior whitespace is meaningful — a description or a message
 * body should keep its shape, and only its ends want trimming.
 */
export function TrimmedString(min: number, max: number): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)),
    IsString(),
    MinLength(min),
    MaxLength(max),
  );
}
