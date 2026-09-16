import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderOnboardingService } from './rider.service';
import { DispatchService } from './dispatch.service';

/** `GET /rider/offers/current` + accept/decline — D6's one-offer-at-a-time loop, from the rider's side. */
@Controller('rider/offers')
@Roles('rider')
export class RiderOffersController {
  constructor(
    private readonly riders: RiderOnboardingService,
    private readonly dispatch: DispatchService,
  ) {}

  @Get('current')
  async current(@CurrentUser() user: RequestUser) {
    const rider = await this.riders.resolveRider(user);
    return this.dispatch.currentOffer(rider);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/accept')
  async accept(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const rider = await this.riders.resolveRider(user);
    return this.dispatch.acceptOffer(rider, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/decline')
  async decline(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const rider = await this.riders.resolveRider(user);
    return this.dispatch.declineOffer(rider, id);
  }
}
