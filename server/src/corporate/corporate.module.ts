import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CorporateController } from './corporate.controller';
import { CorporateService } from './corporate.service';
import { CorporateQuotesService } from './corporate-quotes.service';

/**
 * `CorporateQuotesService` is exported because `AdminModule` drives it —
 * building, sending and revoking a quote are admin actions, while reading
 * and accepting one are public. One service, two callers, rather than the
 * quote rules living in two places.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [CorporateController],
  providers: [CorporateService, CorporateQuotesService],
  exports: [CorporateQuotesService],
})
export class CorporateModule {}
