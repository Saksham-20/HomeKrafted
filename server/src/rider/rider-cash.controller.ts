import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderCashService } from './rider-cash.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { SetSettlementModeDto } from './dto/set-settlement-mode.dto';
import { ListEarningsQueryDto } from './dto/list-earnings.query.dto';
import { ListCashEntriesQueryDto } from './dto/list-cash-entries.query.dto';

/** §2.4's cash & payouts screens — `GET /rider/cash`, `POST /rider/cash/deposits`, `PUT /rider/settlement-mode`, `GET /rider/earnings`. */
@Controller('rider')
@Roles('rider')
export class RiderCashController {
  constructor(private readonly cash: RiderCashService) {}

  @Get('cash')
  getCash(@CurrentUser() user: RequestUser, @Query() query: ListCashEntriesQueryDto) {
    return this.cash.getCash(user, query);
  }

  @Post('cash/deposits')
  createDeposit(@CurrentUser() user: RequestUser, @Body() dto: CreateDepositDto) {
    return this.cash.createDeposit(user, dto);
  }

  @Put('settlement-mode')
  setSettlementMode(@CurrentUser() user: RequestUser, @Body() dto: SetSettlementModeDto) {
    return this.cash.setSettlementMode(user, dto);
  }

  @Get('earnings')
  earnings(@CurrentUser() user: RequestUser, @Query() query: ListEarningsQueryDto) {
    return this.cash.earnings(user, query);
  }
}
