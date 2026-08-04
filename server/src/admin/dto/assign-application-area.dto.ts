import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TRICITY_AREAS } from '../../common/geo';

/** Only a **real** area — `'other'` is the value this endpoint exists to resolve, so it is not accepted as a target. */
const AREA_IDS = TRICITY_AREAS.map((a) => a.id);

/**
 * `PATCH /admin/sellers/applications/:id/area` (M19).
 *
 * Without this endpoint the `'other'` waitlist is a dead end: the apply
 * form accepts an out-of-area applicant, `approveApplication` refuses any
 * area that doesn't resolve, and nothing anywhere could change it — so a
 * real kitchen would sit unapprovable forever.
 */
export class AssignApplicationAreaDto {
  /** A tricity area id from `server/src/common/geo.ts#TRICITY_AREAS`. */
  @IsIn(AREA_IDS)
  area!: string;

  /** Optional note for the audit trail — why this area was chosen. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
