import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminOrdersService, AdminOrderType } from './orders.service';
import { OrderStatusOverrideDto } from './dto/order-status-override.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders.query.dto';

const VALID_TYPES: AdminOrderType[] = ['marketplace', 'laundry', 'snack'];

function parseType(type: string): AdminOrderType {
  if (!VALID_TYPES.includes(type as AdminOrderType)) {
    throw new BadRequestException(`Invalid order type "${type}" — expected one of ${VALID_TYPES.join(', ')}`);
  }
  return type as AdminOrderType;
}

/** Unscoped orders oversight — every marketplace `Order`, `LaundryBooking`, and `SnackOrder`, unified. */
@Controller('admin/orders')
@Roles('admin')
export class AdminOrdersController {
  constructor(private readonly ordersService: AdminOrdersService) {}

  @Get()
  list(@Query() query: ListAdminOrdersQueryDto) {
    return this.ordersService.listUnified(query);
  }

  @Get(':type/:id')
  getDetail(@Param('type') type: string, @Param('id') id: string) {
    return this.ordersService.getDetail(parseType(type), id);
  }

  /** The unified list row for one order — the detail screen's header. Separate from the record above because the row carries names (customer, HomeKrafter) the source table does not. */
  @Get(':type/:id/summary')
  getSummary(@Param('type') type: string, @Param('id') id: string) {
    return this.ordersService.getSummary(parseType(type), id);
  }

  /** Refunds the order/booking owner's wallet via `WalletService`'s ledger (idempotent) — `400` for a snack order (no linked wallet). */
  @Post(':type/:id/refund')
  refund(
    @CurrentUser() admin: RequestUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @IdempotencyKey() key?: string,
  ) {
    return this.ordersService.refund(admin.userId, parseType(type), id, key);
  }

  /**
   * Manual status override — jumps straight to any status the kind
   * permits, distinct from a seller's one-step-at-a-time `advance`.
   *
   * **It records a status; it does not move money.** `cancelled` and
   * `returned` are refused with a message naming the path that does — see
   * `OVERRIDE_FORBIDDEN`. Send `expectedStatus` to make it a
   * compare-and-set (409 when another admin got there first).
   */
  @Patch(':type/:id/status')
  overrideStatus(
    @CurrentUser() admin: RequestUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: OrderStatusOverrideDto,
  ) {
    return this.ordersService.overrideStatus(
      admin.userId,
      parseType(type),
      id,
      dto.status,
      dto.expectedStatus,
    );
  }
}
