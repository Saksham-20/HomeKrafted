import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `PATCH /admin/catalog/products/:id/moderate` — mirrors
 * `client/lib/api/admin.ts`'s `ProductModerationAction` union.
 *
 * **M22 added `approve`/`reject` and the `reason`.** Before it, the only
 * actions were the toggles below and the DTO carried *nothing else* — an
 * admin could hide a listing and the HomeKrafter was never told, and there
 * was nowhere to record why even if someone wanted to. `"takedown"` stays
 * a stronger-intent alias for `"hide"` (same `hidden` write) kept as its
 * own audit action string so the log distinguishes an ordinary hide from
 * an enforcement takedown.
 */
export class ModerateProductDto {
  @IsIn(['approve', 'reject', 'hide', 'unhide', 'flag', 'unflag', 'takedown', 'feature', 'unfeature'])
  action!: 'approve' | 'reject' | 'hide' | 'unhide' | 'flag' | 'unflag' | 'takedown' | 'feature' | 'unfeature';

  /**
   * Why, in the admin's own words — shown verbatim to the HomeKrafter.
   *
   * **Required on `reject`, `hide` and `takedown`**, enforced in the
   * service rather than here because it depends on `action`. A refusal
   * with no reason gives the person who has to fix it nothing to act on,
   * and "your listing was removed" with no more than that is how a
   * marketplace loses a supplier who did nothing wrong.
   *
   * The 10-character floor is deliberate: it is low enough not to be
   * bureaucratic and high enough that "no" and "bad" do not pass.
   */
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Give the HomeKrafter a reason they can act on — at least 10 characters' })
  @MaxLength(1000)
  reason?: string;
}
