import { IsString, MaxLength, MinLength } from 'class-validator';

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
}
