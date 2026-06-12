import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { ChemistryDashboardService } from './chemistry-dashboard.service';

@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
@Controller('chemistry-dashboard')
export class ChemistryDashboardController {
  constructor(private readonly svc: ChemistryDashboardService) {}

  @Get('reports')
  listReports(@Req() req: any, @Query() query: any) {
    return this.svc.listReports(req.user, query);
  }
}