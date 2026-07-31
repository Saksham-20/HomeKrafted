import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { OrdersService } from './orders.service';

/**
 * Owner-scoped (auth) — every method resolves `userId` from
 * `@CurrentUser()`, never from a route/body param. Static routes
 * (`list`, `history`) are declared before the dynamic `:id` one, same
 * reasoning as `UsersController`'s `me*` routes, so `GET /orders/history`
 * never gets swallowed by `GET /orders/:id`.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: ListOrdersQueryDto) {
    return this.ordersService.list(user.userId, query);
  }

  @Get('history')
  history(@CurrentUser() user: RequestUser) {
    return this.ordersService.history(user.userId);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ordersService.getById(user.userId, id);
  }

  /** Puts a past order back in the cart, line by line against today's catalogue — see `OrdersService.reorder`. */
  @Post(':id/reorder')
  reorder(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ordersService.reorder(user.userId, id);
  }

  /**
   * M8.2 — completes the M8.1 `pending-payment` seam for `paymentMethod:
   * "wallet"` orders: debits the wallet for the order total, credits
   * cashback, transitions the order to `placed` — atomically. Supports
   * `Idempotency-Key` so a retried/double-submitted click can't double-pay.
   */
  @Post(':id/pay')
  payWithWallet(@CurrentUser() user: RequestUser, @Param('id') id: string, @IdempotencyKey() key?: string) {
    return this.ordersService.payWithWallet(user.userId, id, key);
  }

  /** Admin-only — credits the order owner's wallet for the order total and marks it refunded. */
  @Post(':id/refund')
  @Roles('admin')
  refund(@CurrentUser() user: RequestUser, @Param('id') id: string, @IdempotencyKey() key?: string) {
    return this.ordersService.refundOrder(user.userId, id, key);
  }
}
