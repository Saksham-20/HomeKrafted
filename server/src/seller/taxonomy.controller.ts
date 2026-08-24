import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { TaxonomySuggestionsService } from '../admin/taxonomy-suggestions.service';
import { CreateTaxonomySuggestionDto } from '../admin/dto/create-taxonomy-suggestion.dto';

/**
 * `/seller/taxonomy-suggestions` (M50) — where a HomeKrafter says "there
 * is no shelf for what I make".
 *
 * **This controller writes neither `Category` nor `Occasion`.** It files
 * an ask; an admin mints the row. That is not permissions hygiene: those
 * two tables are a shared vocabulary the whole catalogue browses by, and
 * one anybody can append to stops being one — "Pickles", "Pickle" and
 * "Achaar" as three half-empty shelves, unmergeable. The invariant is
 * pinned by `test/unit/occasion-admin-only.spec.ts`.
 *
 * `resolveHomeKrafter` for the `vendorId` only, so the admin queue can see
 * which kitchen is asking. It is not a gate on top of `@Roles('seller')` —
 * every HomeKrafter has a vendor.
 */
@Controller('seller/taxonomy-suggestions')
@Roles('seller')
export class SellerTaxonomyController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly suggestions: TaxonomySuggestionsService,
  ) {}

  @Get()
  async listMine(@CurrentUser() user: RequestUser) {
    return this.suggestions.listMine(user.userId);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateTaxonomySuggestionDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.suggestions.create(user.userId, seller.vendorId, dto);
  }
}
