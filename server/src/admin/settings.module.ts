import { Module } from '@nestjs/common';
import { AdminSettingsService } from './settings.service';
import { AdminAuditLogService } from './audit-log.service';

/**
 * Platform settings as their own module (M37), so feature modules — the
 * meals module's menu lock, seller payouts' commission — can read them
 * without importing the whole `AdminModule`. That import would cycle:
 * `AdminModule` imports `CatalogModule`, and `CatalogModule` imports
 * `MealsModule` since the blackout cascade.
 *
 * `AdminAuditLogService` is provided here as well (its only dependency
 * is the global `PrismaService`) so settings *writes* stay audited;
 * `AdminModule` still provides its own instance for everything else —
 * the service is stateless, so two instances differ in nothing.
 */
@Module({
  providers: [AdminSettingsService, AdminAuditLogService],
  exports: [AdminSettingsService],
})
export class SettingsModule {}
