import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  PICKUP_SPOT_MAX_LENGTH,
  PICKUP_SPOT_MIN_LENGTH,
} from '../../common/delivery/isb-campus';

/**
 * `PATCH /admin/orders/marketplace/:id/pickup-spot` — where to collect an
 * ISB campus order, in the operator's own words (2026-09-17, owner).
 *
 * Checkout no longer asks the buyer where on campus to hand it over: the
 * spot depends on who is carrying the parcel and what is open, neither of
 * which is knowable while somebody is paying. Checkout promises a message
 * instead, and this is the route that keeps that promise — writing it
 * notifies the buyer, **email included**.
 *
 * Trimmed before the length check, not after, or a message of spaces
 * passes a `MinLength` and arrives blank. The floor is deliberate: "ok"
 * is not a pickup spot, and these words are the only thing telling
 * somebody where to walk (the M22 moderation-reason rule, set lower here
 * because "Gate 1" is a legitimate answer).
 */
export class OrderPickupSpotDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(PICKUP_SPOT_MIN_LENGTH, {
    message: 'Say where to collect it — "Gate 1 reception" is enough',
  })
  @MaxLength(PICKUP_SPOT_MAX_LENGTH)
  message!: string;
}
