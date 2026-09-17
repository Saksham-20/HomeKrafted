import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';
import { CAMPUS_DROP_MAX_LENGTH } from '../../common/delivery/isb-campus';

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
  /**
   * Both recipient fields are optional since the product page's "Make it
   * a gift" block became real controls: a buyer may ask for a **message
   * card** on an order posted to their own address, to hand over
   * themselves. Present together or not at all — `recipientAddressId` is
   * what makes the order ship somewhere else, and it is still checked
   * against the caller's own addresses (`OrdersService.create`).
   *
   * Narrowing this back to required would silently drop the card on the
   * commonest gift there is.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientAddressId?: string;

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

  /**
   * How it reaches the buyer (2026-09-17). Optional, and absent means
   * `standard` — every client written before this keeps working
   * unchanged.
   *
   * `isb-campus` is hand-delivery onto the ISB campus: no delivery fee
   * whatever the platform charges, no courier booked, and **the server
   * writes the destination** (`common/delivery/isb-campus.ts`), ignoring
   * `defaultAddressId` and every per-item address. Taking the address
   * from the request would make free hand-delivery claimable for an
   * address in another state, where nothing would ever collect it.
   */
  @IsOptional()
  @IsIn(['standard', 'isb-campus'])
  deliveryMode?: 'standard' | 'isb-campus';

  /**
   * Where on campus to hand it over — "AC4, room 212", "Exec housing
   * block B".
   *
   * **Optional, and no longer asked for** (2026-09-17, owner). It was
   * required while checkout had a box for it; the spot depends on who is
   * carrying the parcel and what is open, neither knowable while somebody
   * is paying, so `Order.pickupSpot` carries it instead — written by an
   * admin at packing time and emailed to the buyer. Still accepted so a
   * native client that has not shipped the change is not refused, and
   * stored on the address when sent.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(CAMPUS_DROP_MAX_LENGTH)
  campusDrop?: string;

  /**
   * A number to ring on arrival, if it differs from the one on the
   * account. Optional: the account's own phone is used otherwise, and an
   * account with neither is refused with a sentence saying so rather than
   * a parcel nobody can deliver.
   */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  campusPhone?: string;
}
