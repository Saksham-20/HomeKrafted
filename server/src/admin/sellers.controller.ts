import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminSellersService } from './sellers.service';
import { SetSellerStatusDto } from './dto/set-seller-status.dto';

/**
 * Unscoped seller directory + the onboarding approval queue — closes the
 * `/sell` -> admin -> seller-access loop. Static `applications*` routes
 * are declared before the dynamic `:id` ones (same reasoning as
 * `OrdersController`'s doc comment) so `GET /admin/sellers/applications`
 * never gets swallowed by `GET /admin/sellers/:id`.
 */
@Controller('admin/sellers')
@Roles('admin')
export class AdminSellersController {
  constructor(private readonly sellersService: AdminSellersService) {}

  @Get('applications')
  listApplications(@Query('status') status?: string) {
    if (status === 'pending') return this.sellersService.listPendingApplications();
    return this.sellersService.listApplications(status);
  }

  @Post('applications/:id/approve')
  approveApplication(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.sellersService.approveApplication(admin.userId, id);
  }

  @Post('applications/:id/reject')
  rejectApplication(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.sellersService.rejectApplication(admin.userId, id);
  }

  @Get()
  list() {
    return this.sellersService.listSellers();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.sellersService.getSellerById(id);
  }

  @Patch(':id/status')
  setStatus(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: SetSellerStatusDto) {
    return this.sellersService.setSellerStatus(admin.userId, id, dto.status);
  }
}
