import { Body, Controller, Get, Header, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAdminScope } from '../../common/decorators/admin-scope.decorator';
import { RequestUser } from '../../common/types/jwt-payload.type';
import { AdminRidersService } from './riders.service';
import { ListRidersQueryDto } from './dto/list-riders.query.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { ReasonDto } from './dto/reason.dto';
import { SetCashLimitDto } from './dto/set-cash-limit.dto';
import { CashAdjustmentDto } from './dto/cash-adjustment.dto';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';

/**
 * The rider onboarding review queue. `/admin/riders/zones`
 * (`zones.controller.ts`) and R2's `/admin/deliveries`,
 * `/admin/rider-deposits`, `/admin/rider-payouts` share the same
 * `riders` scope but are separate controllers, the same split
 * `AdminSellersController`/`AdminOrdersController`/etc. use across the
 * rest of the panel.
 */
@Controller('admin/riders')
@Roles('admin')
@RequireAdminScope('riders')
export class AdminRidersController {
  constructor(private readonly riders: AdminRidersService) {}

  @Get()
  list(@Query() query: ListRidersQueryDto) {
    return this.riders.list(query);
  }

  @Get(':id')
  detail(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Query('reveal') reveal?: string) {
    return this.riders.detail(admin.userId, id, reveal === 'bank');
  }

  /**
   * The bytes, not a URL — `RiderDocumentsService`'s doc comment on why.
   * `no-store` so a shared proxy or the browser's own disk cache never
   * keeps a copy of somebody's Aadhaar photo.
   */
  @Get(':id/documents/:kind/file')
  @Header('Cache-Control', 'no-store')
  async streamDocument(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Res() res: Response,
  ) {
    const { buffer, mime } = await this.riders.readDocumentFile(admin.userId, id, kind);
    res.setHeader('Content-Type', mime);
    res.send(buffer);
  }

  @Patch(':id/documents/:kind')
  reviewDocument(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.riders.reviewDocument(admin.userId, id, kind, dto);
  }

  @Post(':id/approve')
  approve(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.riders.approve(admin.userId, id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.riders.reject(admin.userId, id, dto);
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.riders.suspend(admin.userId, id, dto);
  }

  @Post(':id/reinstate')
  reinstate(@CurrentUser() admin: RequestUser, @Param('id') id: string) {
    return this.riders.reinstate(admin.userId, id);
  }

  @Patch(':id/cash-limit')
  setCashLimit(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: SetCashLimitDto) {
    return this.riders.setCashLimit(admin.userId, id, dto);
  }

  /**
   * `PUT /admin/riders/:id/cash-adjustment` — R3's escape hatch for
   * fixing a mistake in the ledger. **`finance`, not `riders`** — this
   * is a direct write to the cash ledger, the same section every other
   * money-moving rider route (`/admin/rider-deposits`,
   * `/admin/rider-payouts`) sits under; the class-level `riders` scope
   * above governs the onboarding queue this controller otherwise is.
   * `RequireAdminScope`'s own doc comment names exactly this shape as
   * the intended use of a handler-level override.
   */
  @Put(':id/cash-adjustment')
  @RequireAdminScope('finance')
  cashAdjustment(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: CashAdjustmentDto,
    @IdempotencyKey() key?: string,
  ) {
    return this.riders.cashAdjustment(admin.userId, id, dto, key);
  }
}
