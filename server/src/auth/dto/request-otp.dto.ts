import { IsPhoneNumber } from 'class-validator';

export class RequestOtpDto {
  @IsPhoneNumber(undefined, { message: 'Provide a valid phone number in E.164 format, e.g. +919845012345' })
  phone!: string;
}
