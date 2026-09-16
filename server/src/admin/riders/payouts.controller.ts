import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAdminScope } from '../../common/decorators/admin-scope.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { RequestUser } from '../../common/types/jwt-payload.type';
import { AdminRiderPayoutsService } from './payouts.service';
import { ListPayoutsQueryDto } from './dto/list-payouts.query.dto';
import { GeneratePayoutsDto } from './dto/generate-payouts.dto';
import { PayPayoutDto } from './dto/pay-payout.dto';
import { ReasonDto } from './dto/reason.dto';

/** R3's `/admin/rider-payouts` — §2.4's weekly settlement. `finance` scope. */
@Controller('admin/rider-payouts')
@Roles('admin')
@RequireAdminScope('finance')
export class AdminRiderPayoutsController {
  constructor(private readonly payouts: AdminRiderPayoutsService) {}

  @Get()
  list(@Query() query: ListPayoutsQueryDto) {
    return this.payouts.list(query);
  }

  @Post('generate')
  generate(@CurrentUser() admin: RequestUser, @Body() dto: GeneratePayoutsDto, @IdempotencyKey() key?: string) {
    return this.payouts.generate(admin.userId, dto, key);
  }

  @Post(':id/pay')
  pay(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: PayPayoutDto, @IdempotencyKey() key?: string) {
    return this.payouts.pay(admin.userId, id, dto, key);
  }

  @Post(':id/reject')
  reject(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.payouts.reject(admin.userId, id, dto);
  }
}
