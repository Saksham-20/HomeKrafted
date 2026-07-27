import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { AddHamperItemDto } from './dto/add-hamper-item.dto';
import { AssignAddressDto } from './dto/assign-address.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: RequestUser) {
    return this.cartService.getCart(user.userId);
  }

  @Post('items')
  addItem(@CurrentUser() user: RequestUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.userId, dto);
  }

  @Post('hamper-items')
  addHamperItem(@CurrentUser() user: RequestUser, @Body() dto: AddHamperItemDto) {
    return this.cartService.addHamperItem(user.userId, dto);
  }

  @Patch('items/:id')
  updateQuantity(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateQuantity(user.userId, id, dto.quantity);
  }

  @Delete('items/:id')
  removeItem(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cartService.removeItem(user.userId, id);
  }

  @Post('items/:id/address')
  assignAddress(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AssignAddressDto) {
    return this.cartService.assignAddress(user.userId, id, dto.addressId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentUser() user: RequestUser): Promise<void> {
    await this.cartService.clear(user.userId);
  }
}
