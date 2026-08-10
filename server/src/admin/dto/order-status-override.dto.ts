import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `PATCH /admin/orders/:type/:id/status` — a manual status override,
 * distinct from a seller's step-by-step `advance` (`SellerOrdersService`/
 * `SellerBookingsService`/`SellerSnackOrdersService`): an admin can jump
 * straight to any valid status for the given `type`, not just the next one
 * in the pipeline. The frontend-hyphenated status string (e.g.
 * `"out-for-delivery"`) — validated + mapped to the right Prisma enum
 * per `type` in `AdminOrdersService.overrideStatus`, since each of the 3
 * order kinds has its own status enum.
 */
export class OrderStatusOverrideDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  status!: string;

  /**
   * The status the operator's screen was showing when they chose.
   *
   * Optional, so existing callers keep working, but the admin UI always
   * sends it: without it two admins holding the same order both write and
   * both notify the buyer, and the second one wins with nothing recording
   * that the first ever happened. Supplied and stale ⇒ 409, and the
   * screen reloads rather than guessing.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  expectedStatus?: string;
}
