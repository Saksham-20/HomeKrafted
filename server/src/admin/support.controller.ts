import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SupportTicketStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SetTicketStatusDto, SupportReplyDto } from './dto/support-reply.dto';
import { AdminSupportService } from './support.service';

/** Frontend statuses are hyphenated; the Prisma enum member can't be. */
function toDbStatus(status: string): SupportTicketStatus {
  return (status === 'in-progress' ? 'in_progress' : status) as SupportTicketStatus;
}

/**
 * The dispute queue (M15) — the missing reader for tickets the customer
 * support form has been writing since M7b. See `AdminSupportService`.
 */
@Controller('admin/support/tickets')
@Roles('admin')
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.support.list(status ? toDbStatus(status) : undefined);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.support.getById(id);
  }

  @Post(':id/messages')
  reply(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SupportReplyDto) {
    return this.support.reply(user.userId, id, dto.body);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetTicketStatusDto,
  ) {
    return this.support.setStatus(user.userId, id, toDbStatus(dto.status));
  }
}
