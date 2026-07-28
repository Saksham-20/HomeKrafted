import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { SellerApplicationCategory } from '@prisma/client';

const CATEGORIES: SellerApplicationCategory[] = ['maker', 'baker', 'artist', 'other'];

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

  @IsString()
  @MinLength(1)
  city!: string;

  @IsString()
  @MinLength(1)
  description!: string;
}
