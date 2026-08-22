import {
  ArrayNotEmpty,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SellerApplicationCategory, SellerSpecialty } from '@prisma/client';
import { TRICITY_AREAS } from '../../common/geo';
import { ALL_SPECIALTIES } from '../specialty-taxonomy';

const CATEGORIES: SellerApplicationCategory[] = ['home_chef', 'maker', 'baker', 'artist', 'other'];

/**
 * `specialties` validates against `ALL_SPECIALTIES`
 * (`../specialty-taxonomy.ts`), which includes `laundry` and `cleaning`
 * even though M19 removed their chips from the `/sell` form.
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
 *
 * `PATCH /seller/specialties` is the one place that does refuse them, and
 * for a different reason — see `isWithdrawnSpecialty`. That endpoint is
 * new (M33), so it narrows nothing.
 */

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

/**
 * Six digits, and Indian pincodes never begin with zero.
 *
 * Shape only. Whether the pincode *exists* is checked in the service,
 * against the bundled India Post table, so the applicant gets "we don't
 * recognise that pincode" rather than a decorator's
 * `"pincode must match /^[1-9]\d{5}$/"`. Same rule the M32 fields follow:
 * on a public form the message is the product.
 */
const PINCODE_SHAPE = /^[1-9]\d{5}$/;

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

  /**
   * **Optional since M22 — the form no longer asks.**
   *
   * It only ever existed to pick a `VendorType`, and `VendorType` is
   * rendered nowhere: a question put to every applicant to fill a column
   * that feeds another column nobody reads. Both taxonomies were also
   * food-shaped — this enum's own schema comment said "the platform is
   * food-first", and a candle maker had to answer `other`.
   *
   * When absent it is derived from `specialties`
   * (`specialty-taxonomy.ts#categoryForSpecialties`). Still **accepted**,
   * because narrowing a request value a shipped native app may send is a
   * breaking change and this API has no versioning policy behind it.
   */
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: SellerApplicationCategory;

  /** What they make. Becomes `Seller.specialties` on approval — discovery only, never access. Now also the source of `category` and `Vendor.type`. */
  @ArrayNotEmpty()
  @IsIn(ALL_SPECIALTIES, { each: true })
  specialties!: SellerSpecialty[];

  /**
   * **Optional since M36, and it has to be.**
   *
   * The `/sell` form no longer asks for a city — it derives one from the
   * pincode lookup (`lookup.data?.district ?? ""`). So when our own
   * `GET /pincodes/:pincode` is unreachable, the form correctly tells the
   * applicant "you can still send your application" and then sends
   * `city: ""`, which a `@MinLength(1)` rejected. A valid applicant hit a
   * 400 on a field the form does not show them, caused entirely by our
   * own outage.
   *
   * Widening a request field is safe for the native clients that still
   * send one (the same reasoning `category` and `area` are kept for);
   * narrowing would not be. The service derives the real value — India
   * Post's district wins over anything typed — and refuses only when
   * neither source yields one.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  /**
   * **Legacy since M36, and still accepted.**
   *
   * A tricity area id, or `'other'`. The form no longer sends it — it was
   * a closed list of 21 curated areas, so everyone outside the tricity
   * answered `'other'`, and `'other'` was unapprovable. Kept optional
   * rather than removed for the reason `category` was (see above): this
   * API is shared with native apps and has no versioning policy, so
   * refusing a value a shipped client still sends is a breaking change.
   *
   * When both arrive, `pincode` wins — it is the field with resolution.
   */
  @IsOptional()
  @IsIn(AREA_IDS)
  area?: string;

  /**
   * Where they work from (M36). **Any valid Indian pincode**, which is
   * what makes the supply side national.
   *
   * Optional in the DTO only so a pre-M36 native client sending `area`
   * still validates; `SellerApplicationsService.create` requires one of
   * the two and refuses a request carrying neither. Making it required
   * here would 400 those clients on a field they have never heard of.
   */
  @IsOptional()
  @IsString()
  @Matches(PINCODE_SHAPE, { message: 'Enter a 6-digit pincode' })
  pincode?: string;

  // -------------------------------------------------------------------
  // Pickup address (M36b) — where a rider collects.
  //
  // **This is the applicant's home address, and the form promises it is
  // never shown to buyers.** That promise is kept in code: these land on
  // `VendorProfile.pickup*`, which no public mapper reads, and
  // `vendor-privacy.spec.ts` fails the build if one starts to.
  //
  // Required in practice — the service refuses an application without
  // `addressLine1` — but declared optional here so a pre-M36b native
  // client sending neither still gets the service's written message
  // instead of a decorator's.
  // -------------------------------------------------------------------

  /** House/flat number, building, street. The line a rider navigates by. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  /** Area, colony, sector. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  /** "Opposite the gurudwara" — India addresses by landmark, and it is often what actually finds the door. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  /** A second number for the rider, if the account's phone is not the one at the door. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pickupPhone?: string;

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

  // -------------------------------------------------------------------
  // M32 — the standardised form's extra questions.
  //
  // Every one is optional, and every one is *checked in the service*
  // rather than by a regex decorator, because the message is the product
  // on a public form (see `SellerApplicationsService.normalize`). The
  // decorators here only cap length, which is a storage concern.
  //
  // `businessName`/`contactName`/`phone` above keep their loose
  // decorators for the same reason: a `@Matches()` failure produces
  // "businessName must match /^.../", and a home cook on a phone can do
  // nothing with that.
  // -------------------------------------------------------------------

  /** Instagram handle or profile URL — `@kitchen`, `instagram.com/kitchen` and a full URL all work. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instagramUrl?: string;

  /** Their shop or portfolio, with or without a protocol. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  websiteUrl?: string;

  /**
   * FSSAI licence, asked only of applicants who make food and stored only
   * for them. Never a verification: the badge has exactly one write path
   * (`PATCH /admin/sellers/:id/verification`) and this is not it (M16).
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  fssaiNumber?: string;

  /** Years making this. Absent means "didn't say", which is not zero. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  yearsMaking?: number;

  /** Roughly how many orders a day they can take — becomes `VendorProfile.capacityPerDay`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacityPerDay?: number;
}
