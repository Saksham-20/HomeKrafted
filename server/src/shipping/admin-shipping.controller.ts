import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireAdminScope } from '../common/decorators/admin-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { ShippingService } from './shipping.service';
import { AdminAuditLogService } from '../admin/audit-log.service';
import { CancelConsignmentDto, ListConsignmentsQueryDto } from './dto/shipping.dto';

/**
 * The despatch queue — the one screen that can do anything about a parcel
 * that did not book, a rider who never came, or a delivery the carrier
 * cannot complete.
 *
 * Scoped to `orders`, because that is the section of the panel an operator
 * chasing a parcel is already in (M47: a scope is a section, not a
 * permission). Both mutations are audited: a retry spends money with a
 * carrier and a cancellation stands a rider down.
 */
@Controller('admin/shipping')
@Roles('admin')
@RequireAdminScope('orders')
export class AdminShippingController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  @Get('consignments')
  list(@Query() query: ListConsignmentsQueryDto) {
    return this.shipping.list({
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }

  /**
   * Run the reconciliation poll now.
   *
   * Always available, whether or not the background poll is switched on —
   * this is the button an operator presses when a parcel's status looks
   * stale, and it is the only auto-update at all until the PUSH callback
   * URL is registered in Shadowfax's client portal.
   */
  @Post('reconcile')
  async reconcile(@CurrentUser() user: RequestUser) {
    const result = await this.shipping.reconcile();
    await this.auditLog.log({
      actorId: user.userId,
      action: 'consignment.reconcile',
      targetType: 'Consignment',
      metadata: result,
    });
    return result;
  }

  @Get('consignments/:id')
  getOne(@Param('id') id: string) {
    return this.shipping.getOne(id);
  }

  /** Re-attempt a booking whose cause an operator has fixed (an address added, a pincode corrected). */
  @Post('consignments/:id/book')
  async book(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const result = await this.shipping.retry(id);
    await this.auditLog.log({
      actorId: user.userId,
      action: 'consignment.book',
      targetType: 'Consignment',
      targetId: id,
      metadata: { awbNumber: result.awbNumber ?? null, status: result.status },
    });
    return result;
  }

  @Post('consignments/:id/cancel')
  async cancel(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CancelConsignmentDto) {
    const result = await this.shipping.cancel(id, dto.reason);
    await this.auditLog.log({
      actorId: user.userId,
      action: 'consignment.cancel',
      targetType: 'Consignment',
      targetId: id,
      metadata: { reason: dto.reason, status: result.status },
    });
    return result;
  }
}
