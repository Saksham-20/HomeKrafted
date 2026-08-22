import { IsOptional, IsString } from 'class-validator';
import { CreateListingDto } from '../../seller/dto/create-listing.dto';

/**
 * `POST /admin/catalog/products` (M44) — the seller listing payload plus
 * the one thing a HomeKrafter never gets to choose: whose storefront it
 * goes on.
 *
 * **Extends rather than duplicates.** Every validation rule about weight
 * tiers, SKUs, dietary tags and section flags is already stated once on
 * `CreateListingDto`, and a second copy is a second thing to keep in
 * step — the failure being two forms that accept different products.
 *
 * `vendorId` is optional and defaults to the platform's own storefront,
 * so the common case ("list this as Homekrafted") is the shortest
 * payload. Passing a HomeKrafter's `vendorId` is the assisted-onboarding
 * path: an operator types up a kitchen's products from the photographs
 * they sent, and the listing belongs to that kitchen — their storefront,
 * their reviews, their payout.
 */
export class CreateAdminProductDto extends CreateListingDto {
  @IsOptional()
  @IsString()
  vendorId?: string;
}
