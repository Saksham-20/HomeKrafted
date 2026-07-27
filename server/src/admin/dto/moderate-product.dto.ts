import { IsIn } from 'class-validator';

/**
 * `PATCH /admin/catalog/products/:id/moderate` — mirrors
 * `client/lib/api/admin.ts`'s `ProductModerationAction` union, split into
 * its 7 explicit toggle values (the mock's `"approve"` here is `"unhide"` —
 * restoring a hidden/flagged listing back to `active`). `"takedown"` is a
 * stronger-intent alias for `"hide"` (same `moderationStatus: "hidden"`
 * write — `ProductModerationStatus` has no separate "taken down" state,
 * see `prisma/schema.prisma`) kept as its own audit-log action string so
 * the log distinguishes an ordinary hide from an enforcement takedown.
 */
export class ModerateProductDto {
  @IsIn(['hide', 'unhide', 'flag', 'unflag', 'takedown', 'feature', 'unfeature'])
  action!: 'hide' | 'unhide' | 'flag' | 'unflag' | 'takedown' | 'feature' | 'unfeature';
}
