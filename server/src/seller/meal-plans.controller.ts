import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerMealPlansService } from './meal-plans.service';
import { CreateMealPlanDto, UpdateMealPlanDto } from './dto/meal-plan.dto';

/**
 * Subscription plans a HomeKrafter offers, and the meals they owe.
 *
 * Every route resolves the caller through `SellerService.resolveHomeKrafter`
 * — the single supply role, no per-type 403s — and is scoped to their own
 * `sellerId`.
 */
@Controller('seller/meal-plans')
@Roles('seller')
export class SellerMealPlansController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly mealPlans: SellerMealPlansService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.mealPlans.list(seller.id);
  }

  /** The cook's work queue: every meal owed in the next `days`, soonest first. */
  @Get('deliveries')
  async deliveries(@CurrentUser() user: RequestUser, @Query('days') days?: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    const parsed = Number(days);
    return this.mealPlans.deliveries(
      seller.id,
      Number.isFinite(parsed) && parsed > 0 && parsed <= 60 ? parsed : 14,
    );
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateMealPlanDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.mealPlans.create(seller.id, seller.vendorId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateMealPlanDto,
  ) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.mealPlans.update(seller.id, id, dto);
  }

  @Patch('deliveries/:deliveryId/delivered')
  async markDelivered(@CurrentUser() user: RequestUser, @Param('deliveryId') deliveryId: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.mealPlans.markDelivered(seller.id, deliveryId);
  }

  /**
   * Closes the plan to new subscribers. Existing cycles are untouched —
   * people paid for those meals, and a kitchen changing its mind cannot
   * cancel a prepaid commitment.
   */
  @Delete(':id')
  async close(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.mealPlans.close(seller.id, id);
  }
}
