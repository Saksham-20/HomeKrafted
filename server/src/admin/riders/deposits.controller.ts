import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireAdminScope } from '../../common/decorators/admin-scope.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { RequestUser } from '../../common/types/jwt-payload.type';
import { AdminRiderDepositsService } from './deposits.service';
import { ListDepositsQueryDto } from './dto/list-deposits.query.dto';
import { ReasonDto } from './dto/reason.dto';

/** R3's `/admin/rider-deposits` — the UTR-and-verify queue (D10). `finance` scope, not `riders` — this is money moving. */
@Controller('admin/rider-deposits')
@Roles('admin')
@RequireAdminScope('finance')
export class AdminRiderDepositsController {
  constructor(private readonly deposits: AdminRiderDepositsService) {}

  @Get()
  list(@Query() query: ListDepositsQueryDto) {
    return this.deposits.list(query);
  }

  @Post(':id/verify')
  verify(@CurrentUser() admin: RequestUser, @Param('id') id: string, @IdempotencyKey() key?: string) {
    return this.deposits.verify(admin.userId, id, key);
  }

  @Post(':id/reject')
  reject(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.deposits.reject(admin.userId, id, dto);
  }
}
