import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ListMealPlansQueryDto } from './dto/list-meal-plans.query.dto';
import { MealPlansService } from './meal-plans.service';

/**
 * Browsing meal plans is anonymous. Subscribing is not — that lives on
 * `MealSubscriptionsController`, behind the global `JwtAuthGuard`.
 */
@Controller('meal-plans')
export class MealPlansController {
  constructor(private readonly mealPlansService: MealPlansService) {}

  @Public()
  @Get()
  list(@Query() query: ListMealPlansQueryDto) {
    return this.mealPlansService.list(query);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.mealPlansService.getBySlug(slug);
  }
}
