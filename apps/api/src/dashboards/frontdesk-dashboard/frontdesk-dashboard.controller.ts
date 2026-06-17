import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { FrontdeskDashboardService } from './frontdesk-dashboard.service';

@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
@Controller('frontdesk-dashboard')
export class FrontdeskDashboardController {
  constructor(private readonly svc: FrontdeskDashboardService) {}

  @Get('reports')
  listReports(@Req() req: any, @Query() query: any) {
    return this.svc.listReports(req.user, query);
  }
}