import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * A tricity sanity bound, not a real service-area fence — 29–32°N,
 * 75–78°E comfortably covers Chandigarh/Mohali/Panchkula/Kharar/Zirakpur
 * with room either side. It exists to catch a typo (a stray decimal
 * point puts a zone's centre in the ocean), not to prevent a zone
 * outside the tricity if the business ever expands there — raise the
 * bound then, deliberately.
 */
const LAT_MIN = 29;
const LAT_MAX = 32;
const LNG_MIN = 75;
const LNG_MAX = 78;

/** `POST /admin/riders/zones`. D5: a circle, centre + radius, 3–10 km (aggregator advice: 5–7 km; default 6). */
export class CreateZoneDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(60) city!: string;

  @IsLatitude() @Min(LAT_MIN) @Max(LAT_MAX) centerLat!: number;
  @IsLongitude() @Min(LNG_MIN) @Max(LNG_MAX) centerLng!: number;

  @IsOptional() @IsInt() @Min(3) @Max(10) radiusKm?: number;
}
