import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ReturnOrderDto } from './dto/return-order.dto';
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
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrderDto,
    @IdempotencyKey() key?: string,
  ) {
    return this.ordersService.create(user.userId, dto, key);
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
   * Buyer-initiated cancellation (M15) — allowed up to `confirmed`;
   * restocks, and refunds to the wallet if money was actually taken.
   */
  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancelOrder(user.userId, id, dto.reason);
  }

  /**
   * Buyer-initiated return request (M15) — records the claim and moves no
   * money; an admin resolves it. See `OrdersService.requestReturn`.
   */
  @Post(':id/return')
  requestReturn(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReturnOrderDto) {
    return this.ordersService.requestReturn(user.userId, id, dto.reason);
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
