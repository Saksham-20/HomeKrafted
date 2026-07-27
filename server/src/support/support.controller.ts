import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { AddSupportMessageDto } from './dto/add-support-message.dto';

@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSupportTicketDto) {
    return this.supportService.create(user.userId, dto);
  }

  @Get()
  listMine(@CurrentUser() user: RequestUser) {
    return this.supportService.listMine(user.userId);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.supportService.getById(user.userId, id);
  }

  @Post(':id/messages')
  addMessage(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AddSupportMessageDto) {
    return this.supportService.addMessage(user.userId, user.role, id, dto);
  }
}
