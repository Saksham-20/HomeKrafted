import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerMealPlansService } from './meal-plans.service';
import { CreateMealPlanDto, UpdateMealPlanDto } from './dto/meal-plan.dto';
import { MealPlanDayMenusService, parseDateParam } from '../meals/day-menus.service';
import { SetDayMenuDto } from '../meals/dto/set-day-menu.dto';

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
    private readonly dayMenus: MealPlanDayMenusService,
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
   * The next `days` dates' menus for one plan (M37): what is set, what
   * falls back to the weekly rotation, which dates are already locked,
   * and how many subscribers each date reaches.
   */
  @Get(':id/menus')
  async dayMenus_(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    const plan = await this.dayMenus.findOwnedPlan(seller.id, id);
    const parsed = Number(days);
    return this.dayMenus.getRange(
      plan,
      Number.isFinite(parsed) && parsed > 0 && parsed <= 30 ? parsed : 14,
      new Date(),
    );
  }

  /**
   * Set one date's menu (M37). `lines: []` clears it back to the
   * rotation. A locked date (past `menuLockTime` the evening before) is
   * refused — that is the admin override's job, because subscribers were
   * promised the menu they can see.
   */
  @Put(':id/menus/:date')
  async setDayMenu(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('date') dateParam: string,
    @Body() dto: SetDayMenuDto,
  ) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    const plan = await this.dayMenus.findOwnedPlan(seller.id, id);
    const date = parseDateParam(dateParam);
    if (!date) throw new BadRequestException('Date must look like 2026-08-20');
    return this.dayMenus.setDayMenu(plan, date, dto.lines, {
      enforceLock: true,
      now: new Date(),
    });
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
