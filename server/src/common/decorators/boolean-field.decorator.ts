import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * A boolean request field that means what it says.
 *
 * **Why this exists.** The global `ValidationPipe` runs with
 * `transformOptions: { enableImplicitConversion: true }` — which query
 * DTOs need, so `?days=30` arrives as a number. For a field whose
 * reflected type is `Boolean`, that conversion is `Boolean(value)`, and
 * `Boolean('false')` is `true`. Every non-empty string therefore became
 * `true` before the validator ever saw it, so a request sending the
 * *string* `"false"` set the flag to **true** and returned 200.
 *
 * That is not a theoretical shape mismatch. `"false"` is exactly what an
 * HTML form field, a hand-written `curl`, or any client that stringifies
 * its state sends. The fields it reached include the verification badge
 * (`SetVerificationDto`), wallet auto-top-up, review moderation and a
 * HomeKrafter's "am I making this today" switch — and in every one of
 * them the coercion failed in the *enabling* direction, which is the
 * expensive one.
 *
 * The transform reads the **raw** value off the original payload
 * (`obj[key]`) rather than the already-converted `value`, accepts only
 * the four unambiguous spellings, and passes anything else through
 * untouched so the validator rejects it with a 400. Guessing at `"yes"`
 * or `"1"` would be re-introducing the same class of bug more politely.
 *
 * Use this for **every** boolean request field. A bare validator on its
 * own is the bug.
 */
export function BooleanField(): PropertyDecorator {
  return applyDecorators(
    Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
      const raw = obj?.[key];
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      // Includes `undefined`, which must stay `undefined` so `@IsOptional()`
      // still reads the field as absent rather than as `false`.
      return raw;
    }),
    IsBoolean(),
  );
}
