import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminDashboardService } from './dashboard.service';

@Controller('admin')
@Roles('admin')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboardService.getDashboard();
  }

  @Get('analytics')
  getAnalytics() {
    return this.dashboardService.getAnalytics();
  }
}
