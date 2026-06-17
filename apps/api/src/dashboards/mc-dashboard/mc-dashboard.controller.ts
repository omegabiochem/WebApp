import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { McDashboardService } from './mc-dashboard.service';

@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
@Controller('mc-dashboard')
export class McDashboardController {
  constructor(private readonly svc: McDashboardService) {}

  @Get('reports')
  listReports(@Req() req: any, @Query() query: any) {
    return this.svc.listReports(req.user, query);
  }
}