import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
@Controller('admin-dashboard')
export class AdminDashboardController {
  constructor(private readonly svc: AdminDashboardService) {}

  @Get('reports')
  listReports(@Req() req: any, @Query() query: any) {
    return this.svc.listReports(req.user, query);
  }

  // Run once after migration/deploy to fill DashboardReport table.
  // You can remove this endpoint after successful rebuild.
  @Post('rebuild')
  rebuild(@Req() req: any) {
    return this.svc.rebuildDashboardReports(req.user);
  }
}