import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { MicroDashboardService } from './micro-dashboard.service';

@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
@Controller('micro-dashboard')
export class MicroDashboardController {
  constructor(private readonly svc: MicroDashboardService) {}

  @Get('reports')
  listReports(@Req() req: any, @Query() query: any) {
    return this.svc.listReports(req.user, query);
  }
}