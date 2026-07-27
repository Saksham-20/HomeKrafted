import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';
import { WishlistService } from './wishlist.service';

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.wishlistService.get(user.userId);
  }

  @Post('items')
  add(@CurrentUser() user: RequestUser, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.add(user.userId, dto.productId);
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param('productId') productId: string): Promise<void> {
    await this.wishlistService.remove(user.userId, productId);
  }
}
