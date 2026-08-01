import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerProfileService } from './profile.service';
import { UpdateSellerProfileDto } from './dto/update-profile.dto';
import {
  AddVendorPhotoDto,
  ReorderVendorPhotosDto,
  UpdateVendorPhotoDto,
} from './dto/vendor-photo.dto';
import { AddBlackoutDto } from './dto/blackout.dto';
import { VendorAvailabilityService } from '../catalog/vendor-availability.service';

/**
 * `/seller/profile` (M16) — the rich profile behind the storefront.
 * Separate from `/seller/storefront`, which stays what it was: the four
 * catalogue-facing fields (bio, location, avatar, banner) that appear on
 * every product card. This is the page a buyer reads before deciding to
 * trust a kitchen.
 *
 * `resolveHomeKrafter` on every method, so the `vendorId` is always the
 * caller's own — no route here takes one.
 */
@Controller('seller/profile')
@Roles('seller')
export class SellerProfileController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly profileService: SellerProfileService,
    private readonly availabilityService: VendorAvailabilityService,
  ) {}

  @Get()
  async get(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.profileService.get(seller.vendorId);
  }

  @Patch()
  async update(@CurrentUser() user: RequestUser, @Body() dto: UpdateSellerProfileDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.profileService.updateOwn(seller.vendorId, dto);
  }

  @Get('photos')
  async listPhotos(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.profileService.listPhotos(seller.vendorId);
  }

  @Post('photos')
  async addPhoto(@CurrentUser() user: RequestUser, @Body() dto: AddVendorPhotoDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.profileService.addPhoto(seller.vendorId, dto);
  }

  /** Declared above `:id` — otherwise `/photos/order` resolves to a photo with the id "order". */
  @Put('photos/order')
  async reorderPhotos(@CurrentUser() user: RequestUser, @Body() dto: ReorderVendorPhotosDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.profileService.reorderPhotos(seller.vendorId, dto);
  }

  @Patch('photos/:id')
  async updatePhoto(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateVendorPhotoDto,
  ) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.profileService.updatePhoto(seller.vendorId, id, dto);
  }

  @Delete('photos/:id')
  async removePhoto(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.profileService.removePhoto(seller.vendorId, id);
  }

  // -------------------------------------------------------------------
  // Days off (M16, M2). Every buyer-facing pre-order picker reads these
  // through `GET /vendors/:slug/availability`, so a kitchen closing for a
  // festival stops being offered slots it cannot cook.
  // -------------------------------------------------------------------

  @Get('blackouts')
  async listBlackouts(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.availabilityService.listBlackouts(seller.vendorId);
  }

  @Post('blackouts')
  async addBlackout(@CurrentUser() user: RequestUser, @Body() dto: AddBlackoutDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.availabilityService.addBlackout(seller.vendorId, dto.date, dto.reason);
  }

  @Delete('blackouts/:id')
  async removeBlackout(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.availabilityService.removeBlackout(seller.vendorId, id);
  }
}
