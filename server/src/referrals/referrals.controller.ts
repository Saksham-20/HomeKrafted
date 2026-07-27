import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('code')
  getCode(@CurrentUser() user: RequestUser) {
    return this.referralsService.getCode(user.userId);
  }

  @Get()
  listMine(@CurrentUser() user: RequestUser) {
    return this.referralsService.listMine(user.userId);
  }

  /** Once-only per referral id — see `ReferralsService.applyCredit`'s doc comment. */
  @Post(':id/apply-credit')
  applyCredit(@CurrentUser() user: RequestUser, @Param('id') id: string, @IdempotencyKey() key?: string) {
    return this.referralsService.applyCredit(user.userId, id, key);
  }
}
