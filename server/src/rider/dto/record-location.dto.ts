import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class LocationPingDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  speedMps?: number;

  @IsDateString()
  recordedAt!: string;

  /** Present while the rider is on a job — absent between jobs (idle pings while waiting for an offer). */
  @IsOptional()
  @IsString()
  jobId?: string;
}

/**
 * `POST /rider/location` — a batch of GPS fixes from the foreground
 * service, at most 50 (§4). `RiderDutyService` drops anything older than
 * 10 minutes or with accuracy worse than 100m before storing the rest —
 * see its own doc comment for why that check lives there and not here:
 * "older than 10 minutes" is relative to the request's arrival time, not
 * a fact this DTO alone can validate.
 */
export class RecordLocationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LocationPingDto)
  pings!: LocationPingDto[];
}
