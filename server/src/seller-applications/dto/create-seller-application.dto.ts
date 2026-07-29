import { ArrayNotEmpty, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { SellerApplicationCategory, SellerSpecialty } from '@prisma/client';
import { TRICITY_AREAS } from '../../common/geo';

const CATEGORIES: SellerApplicationCategory[] = ['maker', 'baker', 'artist', 'other'];

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

/** Only real tricity areas are accepted — the value becomes the kitchen's coordinates. */
const AREA_IDS = TRICITY_AREAS.map((a) => a.id);

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

  /** Tricity area id — decides where the kitchen sits for the buyer distance filter. */
  @IsIn(AREA_IDS)
  area!: string;

  /** How far they'll deliver. Capped at 30km, which spans the whole tricity. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  deliveryRadiusKm?: number;

  @IsString()
  @MinLength(1)
  description!: string;
}
