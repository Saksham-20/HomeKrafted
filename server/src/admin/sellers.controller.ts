import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminSellersService } from './sellers.service';
import { SetSellerStatusDto } from './dto/set-seller-status.dto';
import { SetVerificationDto } from './dto/set-verification.dto';
import { AssignApplicationAreaDto } from './dto/assign-application-area.dto';
import { SetVendorCoordsDto } from './dto/set-vendor-coords.dto';
import { ListAdminSellersQueryDto } from './dto/list-admin-sellers.query.dto';

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

  /**
   * The way out of the `'other'` waitlist. Without it an out-of-area
   * applicant is accepted by the public form and then unapprovable
   * forever, because `approveApplication` refuses any unresolvable area.
   */
  @Patch('applications/:id/area')
  assignApplicationArea(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: AssignApplicationAreaDto,
  ) {
    return this.sellersService.assignApplicationArea(admin.userId, id, dto);
  }

  @Post('applications/:id/approve')
  approveApplication(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.sellersService.approveApplication(admin.userId, id);
  }

  /**
   * Sign-in details an admin can read out over the phone, for a kitchen
   * the invite email never reached. Returns the password **once** — it is
   * stored only as a hash, so a lost password is re-issued (which revokes
   * the old one), never re-read. The account must replace it at first
   * sign-in. See `AdminSellersService.issueTemporaryPassword`.
   */
  @HttpCode(HttpStatus.OK)
  @Post(':id/temp-password')
  issueTemporaryPassword(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.sellersService.issueTemporaryPassword(admin.userId, id);
  }

  /**
   * Re-send an approved HomeKrafter's sign-in link. Burns the previous
   * one. The remedy for "the approval email never arrived", which is
   * otherwise unfixable now that a duplicate application is correctly
   * refused.
   */
  @Post(':id/resend-invite')
  resendInvite(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.sellersService.resendInvite(admin.userId, id);
  }

  @Post('applications/:id/reject')
  rejectApplication(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.sellersService.rejectApplication(admin.userId, id);
  }

  @Get()
  list(@Query() query: ListAdminSellersQueryDto) {
    return this.sellersService.listSellers(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.sellersService.getSellerById(id);
  }

  /** The profile an admin has to read in order to verify it (M16) — includes the submitted FSSAI number, which the public storefront deliberately never publishes. */
  /** Everything about one HomeKrafter on one screen — contact, storefront, activity, and the application they were approved on (M32). */
  @Get(':id/detail')
  getDetail(@Param('id') id: string) {
    return this.sellersService.getSellerDetail(id);
  }

  @Get(':id/profile')
  getProfile(@Param('id') id: string) {
    return this.sellersService.getSellerProfile(id);
  }

  /** The only write path to the verification badge — see `SetVerificationDto`. */
  @Patch(':id/verification')
  setVerification(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetVerificationDto,
  ) {
    return this.sellersService.setVerification(admin.userId, id, dto);
  }

  @Patch(':id/status')
  setStatus(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: SetSellerStatusDto) {
    return this.sellersService.setSellerStatus(admin.userId, id, dto.status);
  }

  /**
   * Move a kitchen to its real coordinates — the correction step for a
   * pincode centroid that was not close enough. See `SetVendorCoordsDto`
   * for why this is admin-only and audited.
   */
  @Patch(':id/coords')
  setCoords(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetVendorCoordsDto,
  ) {
    return this.sellersService.setVendorCoords(admin.userId, id, dto);
  }
}
