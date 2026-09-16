import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderDutyService } from './rider-duty.service';
import { SetDutyDto } from './dto/set-duty.dto';
import { RecordLocationDto } from './dto/record-location.dto';

/** `POST /rider/duty` + `POST /rider/location` — §2.2/§4. Both are state changes, not resource creation, so `200` (not the POST default `201`) — same shape as `rider.controller.ts`'s `submit`. */
@Controller('rider')
@Roles('rider')
export class RiderDutyController {
  constructor(private readonly duty: RiderDutyService) {}

  @HttpCode(HttpStatus.OK)
  @Post('duty')
  setDuty(@CurrentUser() user: RequestUser, @Body() dto: SetDutyDto) {
    return this.duty.setDuty(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('location')
  recordLocation(@CurrentUser() user: RequestUser, @Body() dto: RecordLocationDto) {
    return this.duty.recordLocation(user, dto);
  }
}
