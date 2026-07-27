import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

/** Maker-only listings CRUD, scoped to the caller's own `vendorId`. */
@Controller('seller/listings')
@Roles('seller')
export class SellerListingsController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly listingsService: SellerListingsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveMaker(user);
    return this.listingsService.list(seller.vendorId);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveMaker(user);
    return this.listingsService.getOne(seller.vendorId, id);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateListingDto) {
    const seller = await this.sellerService.resolveMaker(user);
    return this.listingsService.create(seller.vendorId, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    const seller = await this.sellerService.resolveMaker(user);
    return this.listingsService.update(seller.vendorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    const seller = await this.sellerService.resolveMaker(user);
    await this.listingsService.remove(seller.vendorId, id);
  }
}
