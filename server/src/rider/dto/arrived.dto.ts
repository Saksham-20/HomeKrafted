import { IsLatitude, IsLongitude } from 'class-validator';

/** `POST /rider/jobs/:id/arrived-pickup` and `.../arrived-drop` — the rider's own GPS fix, checked against the geofence server-side. */
export class ArrivedDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
