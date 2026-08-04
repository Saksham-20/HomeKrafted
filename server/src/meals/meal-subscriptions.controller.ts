import { Body, Controller, Delete, Get, Param, Post, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateMealSubscriptionDto } from './dto/create-meal-subscription.dto';
import { MealSubscriptionsService } from './meal-subscriptions.service';

/**
 * Every route here is owner-scoped: the subscription id in the path is only
 * ever resolved together with the caller's `userId`, so somebody else's id
 * returns 404 rather than acting on their meals.
 *
 * `POST /` is the only money-moving route. It debits the whole cycle from
 * the wallet in one go — supply an `Idempotency-Key` header and a retry
 * cannot charge twice.
 */
@Controller('meal-subscriptions')
export class MealSubscriptionsController {
  constructor(private readonly subscriptions: MealSubscriptionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.subscriptions.list(user.userId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.subscriptions.getOne(user.userId, id);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateMealSubscriptionDto,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    return this.subscriptions.create(user.userId, dto, idempotencyKey);
  }

  @Patch(':id/pause')
  pause(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.subscriptions.pause(user.userId, id);
  }

  @Patch(':id/resume')
  resume(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.subscriptions.resume(user.userId, id);
  }

  @Patch(':id/deliveries/:deliveryId/skip')
  skip(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.subscriptions.skip(user.userId, id, deliveryId);
  }

  /**
   * Cancelling moves no money — see the service. It is a `DELETE` because it
   * is terminal, but the row stays: a buyer's history has to keep explaining
   * itself after they leave.
   */
  @Delete(':id')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.subscriptions.cancel(user.userId, id);
  }
}
