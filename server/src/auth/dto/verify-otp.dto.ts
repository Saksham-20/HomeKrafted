import { IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsPhoneNumber(undefined, { message: 'Provide a valid phone number in E.164 format, e.g. +919845012345' })
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  /** Optional — lets a first-time OTP signup capture a display name. */
  @IsOptional()
  @IsString()
  name?: string;
}
