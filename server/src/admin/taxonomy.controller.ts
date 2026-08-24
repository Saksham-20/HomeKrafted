import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TaxonomySuggestionStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireAdminScope } from '../common/decorators/admin-scope.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { TaxonomySuggestionsService } from './taxonomy-suggestions.service';
import {
  ApproveTaxonomySuggestionDto,
  RejectTaxonomySuggestionDto,
} from './dto/decide-taxonomy-suggestion.dto';

const STATUSES: TaxonomySuggestionStatus[] = ['pending', 'approved', 'rejected'];

/**
 * The queue of shelves and occasions people have asked for (M50).
 *
 * `catalog` scope: a shelf is part of the catalogue, and the operator who
 * reviews listings is the one who knows whether "Achaar" is a real gap or
 * the pickles shelf under another name.
 *
 * Approving is what mints the real `Category`/`Occasion` row. That is the
 * whole design — see `TaxonomySuggestionsService`.
 */
@Controller('admin/taxonomy-suggestions')
@Roles('admin')
@RequireAdminScope('catalog')
export class AdminTaxonomyController {
  constructor(private readonly suggestions: TaxonomySuggestionsService) {}

  @Get()
  list(@Query('status') status?: string) {
    // Parsed rather than trusted: it is a query string, so it comes from
    // anybody. An unrecognised value reads as "no filter", which shows
    // more rather than fewer — the safe direction for a queue.
    const parsed = STATUSES.includes(status as TaxonomySuggestionStatus)
      ? (status as TaxonomySuggestionStatus)
      : undefined;
    return this.suggestions.listForAdmin(parsed);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: ApproveTaxonomySuggestionDto,
  ) {
    return this.suggestions.approve(admin.userId, id, dto);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: RejectTaxonomySuggestionDto,
  ) {
    return this.suggestions.reject(admin.userId, id, dto);
  }
}
