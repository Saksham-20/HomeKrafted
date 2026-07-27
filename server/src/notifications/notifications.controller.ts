import { Body, Controller, Get, Param, ParseEnumPipe, Patch } from '@nestjs/common';
import { NotificationCategory } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { SetReadDto } from './dto/set-read.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  getPreferences(@CurrentUser() user: RequestUser) {
    return this.notificationsService.getPreferences(user.userId);
  }

  @Patch('preferences/:category')
  updatePreference(
    @CurrentUser() user: RequestUser,
    @Param('category', new ParseEnumPipe(NotificationCategory)) category: NotificationCategory,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationsService.updatePreference(user.userId, category, dto);
  }

  @Get()
  listInbox(@CurrentUser() user: RequestUser) {
    return this.notificationsService.listInbox(user.userId);
  }

  @Patch(':id/read')
  setRead(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SetReadDto) {
    return this.notificationsService.setRead(user.userId, id, dto.read ?? true);
  }
}
