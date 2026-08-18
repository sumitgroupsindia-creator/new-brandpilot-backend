import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { NotificationEventKey } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

class NotificationPreferenceDto {
  eventKey!: NotificationEventKey;
  email?: boolean;
  push?: boolean;
  inApp?: boolean;
}

class NotificationPreferencesUpdateDto {
  preferences!: NotificationPreferenceDto[];
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  getPreferences(@CurrentUser('sub') userId: string) {
    return this.notificationsService.getPreferences(userId);
  }

  @Post('preferences')
  updatePreferences(
    @CurrentUser('sub') userId: string,
    @Body() dto: NotificationPreferencesUpdateDto,
  ) {
    return this.notificationsService.upsertPreferences(userId, dto.preferences ?? []);
  }

  @Get('events')
  getEvents(@CurrentUser('sub') userId: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 30;
    return this.notificationsService.listEvents(userId, Number.isFinite(parsedLimit) ? parsedLimit : 30);
  }
}
