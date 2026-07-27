import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { ReferralsService } from './referrals.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get()
  getAccount(@CurrentUser() user: RequestUser) {
    return this.referralsService.getLoyaltyAccount(user.userId);
  }
}
