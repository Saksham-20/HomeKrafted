import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderOnboardingService } from './rider.service';
import { UpdateRiderApplicationDto } from './dto/update-rider-application.dto';
import { RiderConsentsDto } from './dto/rider-consents.dto';

/**
 * The owner-scoped rider-portal API (R1's slice of it): the onboarding
 * form, consents and zone list. `POST /rider/documents/:kind`
 * (`rider-documents.controller.ts`) and everything from R2 onward
 * (duty, offers, jobs, cash, earnings, SOS) are separate controllers on
 * the same `@Roles('rider')` gate.
 *
 * Every handler resolves the caller through
 * `RiderOnboardingService.resolveRider` — never a `riderId` the client
 * supplies. A rider who is not yet `approved` may still use every route
 * here; only R2's duty/job/offer routes will need to check `approved`.
 */
@Controller('rider')
@Roles('rider')
export class RiderController {
  constructor(private readonly riders: RiderOnboardingService) {}

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.riders.me(user);
  }

  @Put('me/application')
  updateApplication(@CurrentUser() user: RequestUser, @Body() dto: UpdateRiderApplicationDto) {
    return this.riders.updateApplication(user, dto);
  }

  @Post('me/consents')
  recordConsents(@CurrentUser() user: RequestUser, @Body() dto: RiderConsentsDto) {
    return this.riders.recordConsents(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('me/submit')
  submit(@CurrentUser() user: RequestUser) {
    return this.riders.submit(user);
  }

  @Get('zones')
  zones() {
    return this.riders.listZones();
  }
}
