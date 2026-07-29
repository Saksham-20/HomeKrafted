import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';

/**
 * Listings CRUD for a HomeKrafter, scoped to their own `vendorId`.
 *
 * Was maker-only. Every HomeKrafter now has a storefront, so a cook adding
 * today's thali uses exactly this — same routes, no type check in front of
 * them.
 */
@Controller('seller/listings')
@Roles('seller')
export class SellerListingsController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly listingsService: SellerListingsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.listingsService.list(seller.vendorId);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.listingsService.getOne(seller.vendorId, id);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateListingDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.listingsService.create(seller.vendorId, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.listingsService.update(seller.vendorId, id, dto);
  }

  /**
   * The Availability switch on the portal's item list — "am I making this
   * today". Separate from `PATCH :id` so toggling one item doesn't submit
   * the whole edit form, and separate from admin moderation, which is a
   * different actor answering a different question.
   */
  @Patch(':id/availability')
  async setAvailability(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.listingsService.setAvailability(seller.vendorId, id, dto.isAvailable);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    await this.listingsService.remove(seller.vendorId, id);
  }
}
