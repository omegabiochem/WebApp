
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { QaDashboardService } from './qa-dashboard.service';

@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
@Controller('qa-dashboard')
export class QaDashboardController {
  constructor(private readonly svc: QaDashboardService) {}

  @Get('reports')
  listReports(@Req() req: any, @Query() query: any) {
    return this.svc.listReports(req.user, query);
  }
}