import { IsOptional, IsString } from 'class-validator';

/** `POST /admin/deliveries/:id/reassign` — a named rider direct-assigns the job; absent, it withdraws any live offer and returns the job to `unassigned` for the dispatcher to re-offer. */
export class ReassignDeliveryDto {
  @IsOptional()
  @IsString()
  riderId?: string;
}
