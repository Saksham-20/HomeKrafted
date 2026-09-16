import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAdminScope } from '../../common/decorators/admin-scope.decorator';
import { RequestUser } from '../../common/types/jwt-payload.type';
import { AdminDeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReassignDeliveryDto } from './dto/reassign-delivery.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries.query.dto';
import { ReasonDto } from './dto/reason.dto';

/**
 * `/admin/deliveries` — the despatch queue. Scoped `riders` at the
 * controller, the same section every other rider-fleet admin surface
 * lives in (`/admin/riders/*`).
 */
@Controller('admin/deliveries')
@Roles('admin')
@RequireAdminScope('riders')
export class AdminDeliveriesController {
  constructor(private readonly deliveries: AdminDeliveriesService) {}

  /**
   * **Handler-level override to `orders`, not `riders`.** Dispatching a
   * parcel for an existing order is an orders-desk action — an operator
   * working the order queue needs to be able to do this without also
   * holding the rider-fleet review section, and a `riders`-scoped admin
   * reviewing rider applications has no business minting delivery jobs
   * for orders they've never looked at. The R2 brief names this scope
   * explicitly, separate from the rest of this controller.
   */
  @Post()
  @RequireAdminScope('orders')
  create(@CurrentUser() admin: RequestUser, @Body() dto: CreateDeliveryDto) {
    return this.deliveries.create(admin.userId, dto);
  }

  @Get()
  list(@Query() query: ListDeliveriesQueryDto) {
    return this.deliveries.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.deliveries.detail(id);
  }

  @Post(':id/reassign')
  reassign(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ReassignDeliveryDto) {
    return this.deliveries.reassign(admin.userId, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.deliveries.cancel(admin.userId, id, dto.reason);
  }

  @Post(':id/override-deliver')
  overrideDeliver(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.deliveries.overrideDeliver(admin.userId, id, dto.reason);
  }
}
