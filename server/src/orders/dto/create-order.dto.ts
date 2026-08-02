import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

export class OrderShipmentInputDto {
  @IsString()
  @MinLength(1)
  addressId!: string;

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;
}

/**
 * `recipientAddressId` must be one of the caller's own saved addresses
 * (checked in `OrdersService.create`) — "ship to someone else" means the
 * account's address book holds the recipient's address, same FK shape
 * `Order.giftRecipientAddressId` requires (`schema.prisma`). The mock
 * checkout's synthetic `"gift-recipient"` id (never a real `Address` row)
 * doesn't carry over — flagged for M8.4 in `docs/API.md`.
 */
export class OrderGiftInputDto {
  @IsString()
  @MinLength(1)
  recipientName!: string;

  @IsString()
  @MinLength(1)
  recipientAddressId!: string;

  @IsOptional()
  @BooleanField()
  hidePrice?: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}

export class CreateOrderDto {
  /** Fallback shipping address for any cart line that has no `addressId` assigned yet (via `POST /cart/items/:id/address`). Falls back further to the account's default address if omitted. */
  @IsOptional()
  @IsString()
  defaultAddressId?: string;

  /** One entry per distinct shipping address in play — supplies the per-address delivery date. An address used by a cart line but missing here ships with no `deliveryDate`. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderShipmentInputDto)
  shipments?: OrderShipmentInputDto[];

  /** Presence of this field (not a boolean flag) makes the order a gift order — ships every line to `recipientAddressId` regardless of any per-item address assignment, matching `CheckoutClient`'s "gift-to-recipient ships the whole order" model. */
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderGiftInputDto)
  gift?: OrderGiftInputDto;

  @IsIn(['wallet', 'razorpay', 'cod'])
  paymentMethod!: 'wallet' | 'razorpay' | 'cod';
}
