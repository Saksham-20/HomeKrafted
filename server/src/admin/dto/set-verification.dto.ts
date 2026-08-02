import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * The badge, and the only place it can be set (M16). A HomeKrafter can
 * submit an FSSAI number through `PATCH /seller/profile`; nothing on that
 * surface can flip these three flags. Every field is optional so an admin
 * can verify identity today and the licence next week without clearing
 * what they already checked.
 */
export class SetVerificationDto {
  @IsOptional() @BooleanField() identityVerified?: boolean;
  @IsOptional() @BooleanField() addressVerified?: boolean;
  @IsOptional() @BooleanField() fssaiVerified?: boolean;

  /** When the licence lapses. Recorded so a lapsed licence is a thing someone can find, not a badge that stays up forever. */
  @IsOptional() @IsISO8601() fssaiExpiry?: string;

  /** Shown to the HomeKrafter. A refused verification with no reason is a support ticket waiting to happen. */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
