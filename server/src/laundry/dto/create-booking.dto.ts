import { Type } from 'class-transformer';
import { IsArray, IsIn, IsISO8601, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

/**
 * Server-authoritative pricing: this DTO deliberately has no `price`/
 * `unitPrice`/`estimatedTotal` field — `LaundryService.rate` (read fresh
 * from the DB) × whichever quantity dimension matches the service's
 * `pricingModel` is the only source of truth for what a booking costs
 * (`LaundryService.create`). `ValidationPipe`'s `forbidNonWhitelisted`
 * (see `main.ts`) rejects any client-submitted amount field outright.
 */
export class SlotInputDto {
  @IsISO8601()
  date!: string;

  @IsString()
  @MinLength(1)
  slotId!: string;
}

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsOptional()
  @IsNumber()
  estimatedWeightKg?: number;

  @IsOptional()
  @IsNumber()
  itemCount?: number;

  @IsOptional()
  @IsNumber()
  estimatedHours?: number;

  @ValidateNested()
  @Type(() => SlotInputDto)
  pickupSlot!: SlotInputDto;

  @ValidateNested()
  @Type(() => SlotInputDto)
  deliverySlot!: SlotInputDto;

  @IsString()
  @MinLength(1)
  addressId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @IsIn(['wallet', 'razorpay', 'cod'])
  paymentMethod!: 'wallet' | 'razorpay' | 'cod';
}
