import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { ClientDashboardService } from './client-dashboard.service';

@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
@Controller('client-dashboard')
export class ClientDashboardController {
  constructor(private readonly svc: ClientDashboardService) {}

  @Get('reports')
  listReports(@Req() req: any, @Query() query: any) {
    return this.svc.listReports(req.user, query);
  }
}