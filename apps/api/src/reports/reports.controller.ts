import { Body, Controller, Get, Param, Patch, Post, UseGuards, Req } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.svc.create(req.user, body);
  }

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id/header')
  updateHeader(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateHeader(req.user, id, body);
  }

  @Patch(':id/micro')
  updateMicro(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateMicroChem(req.user, id, body);
  }

  @Post(':id/qa-approve')
  qaApprove(@Req() req: any, @Param('id') id: string) {
    return this.svc.qaApprove(req.user, id);
  }

  @Post(':id/lock')
  lock(@Req() req: any, @Param('id') id: string) {
    return this.svc.lock(req.user, id);
  }
}
