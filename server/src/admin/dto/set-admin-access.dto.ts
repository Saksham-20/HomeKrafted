import { AdminScope } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * `PATCH /admin/users/:id/admin-access` (M47) — make somebody a sub-admin,
 * change which sections they cover, or take it away.
 *
 * One route rather than two, because the two decisions are the same
 * decision: an admin with no sections can reach nothing, so "is an admin"
 * without "which sections" is an account that looks powerful and does
 * nothing. Sending both together means the screen cannot produce that
 * state by accident.
 *
 * `@BooleanField()` rather than a bare `@IsBoolean()` — the global pipe's
 * `enableImplicitConversion` turns every non-empty string into `true`, so
 * `"false"` would read as `true` on the field that grants admin access.
 * See `common/decorators/boolean-field.decorator.ts`.
 */
export class SetAdminAccessDto {
  @BooleanField()
  isAdmin!: boolean;

  /**
   * The sections they cover. Ignored when `isAdmin` is false.
   *
   * An empty array on an admin is accepted by validation and refused by
   * the service with a sentence, rather than silently stored: it is a
   * legal shape that produces a useless account, and the person doing it
   * needs to be told which of the two things they meant.
   */
  @IsArray()
  @ArrayUnique()
  @IsEnum(AdminScope, { each: true })
  scopes!: AdminScope[];
}
