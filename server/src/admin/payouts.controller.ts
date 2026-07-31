import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PayoutStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RejectPayoutDto, SettlePayoutDto } from './dto/settle-payout.dto';
import { AdminPayoutsService } from './payouts.service';

/**
 * The admin end of the payout loop (M15) — see `AdminPayoutsService` for
 * why "mark paid" records a settlement rather than performing one.
 */
@Controller('admin/payouts')
@Roles('admin')
export class AdminPayoutsController {
  constructor(private readonly payouts: AdminPayoutsService) {}

  @Get()
  list(@Query('status') status?: PayoutStatus) {
    return this.payouts.list(status);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.payouts.getById(id);
  }

  @Post(':id/pay')
  markPaid(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SettlePayoutDto) {
    return this.payouts.markPaid(user.userId, id, dto.reference, dto.note);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RejectPayoutDto) {
    return this.payouts.reject(user.userId, id, dto.note);
  }
}
