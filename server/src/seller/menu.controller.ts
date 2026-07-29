import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerMenuService } from './menu.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';

/**
 * Menu CRUD for a HomeKrafter, scoped to their own `sellerId`.
 *
 * Was snack-seller-only and 403'd everyone else. A cook listing today's
 * dishes for WhatsApp ordering uses these routes now, whatever their
 * specialties say.
 */
@Controller('seller/menu')
@Roles('seller')
export class SellerMenuController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly menuService: SellerMenuService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.menuService.list(seller.id);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.menuService.getOne(seller.id, id);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateMenuItemDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.menuService.create(seller.id, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.menuService.update(seller.id, id, dto);
  }

  /** Same "making this today" switch as listings, over a `Snack`. */
  @Patch(':id/availability')
  async setAvailability(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.menuService.setAvailability(seller.id, id, dto.isAvailable);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    await this.menuService.remove(seller.id, id);
  }
}
