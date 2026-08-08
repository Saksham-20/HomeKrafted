import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import {
  CreateQuoteDto,
  SetInquiryStatusDto,
  UpdateInquiryNotesDto,
  UpdateQuoteDto,
} from '../corporate/dto/quote.dto';
import { AdminCorporateService } from './corporate.service';
import { ListAdminInquiriesQueryDto } from './dto/list-admin-inquiries.query.dto';

/**
 * `admin/corporate-inquiries`, naming the resource in full like every
 * other admin sibling (`admin/support/tickets`, `admin/sellers`,
 * `admin/payouts`) and matching the public `corporate-inquiries`.
 *
 * Quotes hang off an inquiry rather than living at their own top-level
 * path: a quote without one is not a thing.
 */
@Controller('admin/corporate-inquiries')
@Roles('admin')
export class AdminCorporateController {
  constructor(private readonly corporate: AdminCorporateService) {}

  @Get()
  list(@Query('status') status: string | undefined, @Query() query: ListAdminInquiriesQueryDto) {
    return this.corporate.list(status, query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.corporate.getById(id);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetInquiryStatusDto,
  ) {
    return this.corporate.setStatus(user.userId, id, dto.status);
  }

  @Patch(':id/notes')
  setNotes(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateInquiryNotesDto,
  ) {
    return this.corporate.setNotes(user.userId, id, dto.internalNotes);
  }

  @Post(':id/quotes')
  createQuote(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateQuoteDto,
  ) {
    return this.corporate.createQuote(user.userId, id, dto);
  }

  /** Drafts only. A sent quote is withdrawn and re-raised, never silently repriced. */
  @Patch('quotes/:quoteId')
  updateQuote(
    @CurrentUser() user: RequestUser,
    @Param('quoteId') quoteId: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.corporate.updateQuote(user.userId, quoteId, dto);
  }

  /** Mints the accept link and emails it. Re-sending rotates the token, killing the old link. */
  @Post('quotes/:quoteId/send')
  sendQuote(@CurrentUser() user: RequestUser, @Param('quoteId') quoteId: string) {
    return this.corporate.sendQuote(user.userId, quoteId);
  }

  /** Kills the link. The quote survives as the record of what was offered. */
  @Delete('quotes/:quoteId/link')
  revokeQuote(@CurrentUser() user: RequestUser, @Param('quoteId') quoteId: string) {
    return this.corporate.revokeQuote(user.userId, quoteId);
  }
}
