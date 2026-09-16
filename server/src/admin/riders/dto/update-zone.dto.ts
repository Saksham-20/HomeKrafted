import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BooleanField } from '../../../common/decorators/boolean-field.decorator';

const LAT_MIN = 29;
const LAT_MAX = 32;
const LNG_MIN = 75;
const LNG_MAX = 78;

/** `PATCH /admin/riders/zones/:id`. `isActive: false` is how a zone is closed — never a delete, since real riders and jobs may already point at it. */
export class UpdateZoneDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;

  @IsOptional() @IsLatitude() @Min(LAT_MIN) @Max(LAT_MAX) centerLat?: number;
  @IsOptional() @IsLongitude() @Min(LNG_MIN) @Max(LNG_MAX) centerLng?: number;

  @IsOptional() @IsInt() @Min(3) @Max(10) radiusKm?: number;
  @IsOptional() @BooleanField() isActive?: boolean;
}
