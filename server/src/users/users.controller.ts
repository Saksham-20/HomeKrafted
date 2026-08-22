import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Address } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireAdminScope } from '../common/decorators/admin-scope.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { PublicUser } from '../auth/auth.service';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

/**
 * `users/me*` — the first real authed resource, proving the JWT +
 * ownership-scoping stack end to end. Every `me*` method resolves `userId`
 * from the verified `@CurrentUser()`, never from a route/body param, so
 * there's no way to read/write another account's data by guessing an id.
 *
 * The trailing `@Roles('admin') GET :id` is deliberately minimal — a real
 * admin user-management surface (list/suspend/etc.) is M8.3/M11 scope, not
 * this milestone's. It exists here to prove `RolesGuard` end to end (401
 * vs 403 vs allowed) against a real resource, per the M8.0 Definition of
 * Done, rather than adding a throwaway diagnostic route. Static `me*`
 * routes are declared before the dynamic `:id` one so they always match
 * first regardless of router matching order.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: RequestUser): Promise<PublicUser> {
    return this.usersService.getMe(user.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto): Promise<PublicUser> {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Get('me/addresses')
  listAddresses(@CurrentUser() user: RequestUser): Promise<Address[]> {
    return this.usersService.listAddresses(user.userId);
  }

  @Post('me/addresses')
  createAddress(@CurrentUser() user: RequestUser, @Body() dto: CreateAddressDto): Promise<Address> {
    return this.usersService.createAddress(user.userId, dto);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<Address> {
    return this.usersService.updateAddress(user.userId, id, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAddress(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    await this.usersService.deleteAddress(user.userId, id);
  }

  @Post('me/addresses/:id/default')
  setDefaultAddress(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<Address> {
    return this.usersService.setDefaultAddress(user.userId, id);
  }

  @Roles('admin')
  // M47 — reading any account is the `users` section's business.
  @RequireAdminScope('users')
  @Get(':id')
  getUserById(@Param('id') id: string): Promise<PublicUser> {
    return this.usersService.getMe(id);
  }
}
