import { IsOptional, IsString } from 'class-validator';

/** Omit/`null` `addressId` to unassign the line (falls back to the default address at order time). */
export class AssignAddressDto {
  @IsOptional()
  @IsString()
  addressId?: string;
}
