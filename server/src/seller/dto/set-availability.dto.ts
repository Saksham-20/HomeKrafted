import { IsBoolean } from 'class-validator';

/**
 * `PATCH /seller/listings/:id/availability` and
 * `PATCH /seller/menu/:id/availability` — the HomeKrafter's own "am I
 * making this right now" switch.
 *
 * Deliberately not part of the item update DTOs: this fires from a toggle
 * in the item list, several times a day, and shouldn't drag a whole
 * product payload (and its validation) along with it.
 */
export class SetAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;
}
