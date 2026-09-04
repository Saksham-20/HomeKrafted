import { IsEmail, IsOptional, IsPhoneNumber, IsString, MaxLength, ValidateIf } from 'class-validator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

export class UpdateProfileDto {
  @IsOptional()
  @TrimmedString(1, 120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /**
   * `'IN'` for the same reason as `CreateAddressDto.phone`: the
   * region-less form demands strict E.164, so this used to refuse a plain
   * `9845012345` and accept only `+919845012345` — and, since the profile
   * form swallowed the server's refusal entirely until the 2026-08-07
   * audit, that read as "Save doesn't work".
   */
  @IsOptional()
  @IsPhoneNumber('IN', { message: 'Enter a valid phone number, e.g. 98450 12345' })
  phone?: string;

  @IsOptional()
  @IsString()
  avatarPlaceholder?: string;

  /**
   * The shopper's own picture (2026-09-04): the URL
   * `POST /uploads?purpose=profile` returned, or one of the committed
   * chef-character paths. Stored as given — the same column shape as
   * `Vendor.avatarSrc`, so nothing downstream branches on which it is.
   *
   * An empty string clears it, which is why `ValidateIf` lets one
   * through: "use no picture" has to be expressible, and `undefined`
   * already means "not part of this edit".
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsString()
  @MaxLength(500)
  avatarSrc?: string;
}
