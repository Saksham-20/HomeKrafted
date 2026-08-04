import {
  ArrayNotEmpty,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SellerApplicationCategory, SellerSpecialty } from '@prisma/client';
import { TRICITY_AREAS } from '../../common/geo';

const CATEGORIES: SellerApplicationCategory[] = ['home_chef', 'maker', 'baker', 'artist', 'other'];

/**
 * `laundry` and `cleaning` are **still accepted** even though M19 removed
 * their chips from the `/sell` form.
 *
 * The ask was to take them off the form, and this API is shared with the
 * native apps (see CLAUDE.md) with no versioning or deprecation policy
 * behind it — `docs/API.md` has neither. Narrowing an accepted request
 * value is a breaking change: a shipped client sending `laundry` would
 * start getting a 400 for a value it was told was valid. Removing them
 * from the UI achieves everything the ask wanted and breaks nobody.
 *
 * The Prisma `SellerSpecialty` enum keeps them too — seeded rows carry
 * them, and dropping enum members needs a destructive migration for
 * nothing a user sees.
 */
const SPECIALTIES: SellerSpecialty[] = [
  'homemade_food',
  'bakery',
  'pickles_preserves',
  'snacks',
  'sweets',
  'crafts',
  'laundry',
  'cleaning',
];

/**
 * A real tricity area, or the literal `'other'`.
 *
 * `'other'` exists so somebody outside the tricity can register interest
 * rather than being blocked at the form. It is **not** an approvable
 * value: `AdminSellersService#approveApplication` refuses any area that
 * doesn't resolve through `TRICITY_AREAS`, so an `'other'` application
 * sits as a waitlist entry until an admin assigns it a real area.
 */
export const OTHER_AREA = 'other';
const AREA_IDS = [...TRICITY_AREAS.map((a) => a.id), OTHER_AREA];

/** `POST /seller-applications` — the public `/sell` form submission (M9). */
export class CreateSellerApplicationDto {
  @IsString()
  @MinLength(1)
  businessName!: string;

  @IsString()
  @MinLength(1)
  contactName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsIn(CATEGORIES)
  category!: SellerApplicationCategory;

  /** What they'll offer. Becomes `Seller.specialties` on approval — discovery only, never access. */
  @ArrayNotEmpty()
  @IsIn(SPECIALTIES, { each: true })
  specialties!: SellerSpecialty[];

  @IsString()
  @MinLength(1)
  city!: string;

  /** Tricity area id, or `'other'` — decides where the kitchen sits for the buyer distance filter. */
  @IsIn(AREA_IDS)
  area!: string;

  /**
   * The locality they typed, required only when `area === 'other'`.
   *
   * **One `@ValidateIf`, not two.** Stacking a second one for the inverse
   * case (`area !== 'other'`) looks like "required here, forbidden there"
   * but does not work that way: class-validator skips the property when
   * *any* registered condition is false, and the two conditions can never
   * both hold — so validation was skipped unconditionally and an `'other'`
   * application with no locality sailed through with a 201.
   *
   * The "don't smuggle free text onto a normal application" half is
   * handled where it belongs, in the service, which writes `null` unless
   * the area is `'other'`. This is a `@Public()` endpoint whose output an
   * admin later reads, so the value stays length-capped and must always be
   * rendered as text, never as HTML.
   */
  @ValidateIf((o: CreateSellerApplicationDto) => o.area === OTHER_AREA)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  areaLabel?: string;

  /**
   * How far they'll deliver. Capped at 30km, which spans the whole tricity.
   *
   * Genuinely optional since M19 — **omit it and it stays NULL**, which is
   * what lets `PlatformSetting.defaultDeliveryRadiusKm` apply at approval.
   * Sending a number here is the applicant overriding that default.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  deliveryRadiusKm?: number;

  @IsString()
  @MinLength(1)
  description!: string;
}
