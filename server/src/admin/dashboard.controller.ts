import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireAdminScope } from '../common/decorators/admin-scope.decorator';
import { AdminDashboardService } from './dashboard.service';

@Controller('admin')
@Roles('admin')
@RequireAdminScope('analytics')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboardService.getDashboard();
  }

  /** `?days=` (M16, M5) — the chart was pinned at 14 days with no way to ask for a quarter. Clamped to 1–365 server-side. */
  @Get('analytics')
  getAnalytics(@Query('days') days?: string) {
    return this.dashboardService.getAnalytics(days ? Number(days) : undefined);
  }
}
