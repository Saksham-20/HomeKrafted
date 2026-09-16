import { IsString, MinLength } from 'class-validator';

/** `POST /admin/deliveries` — manual despatch of one kitchen's parcel of one order. */
export class CreateDeliveryDto {
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsString()
  @MinLength(1)
  vendorId!: string;
}
