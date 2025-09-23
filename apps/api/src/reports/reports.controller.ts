import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { ReportStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('reports/micro-mix')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.svc.createDraft(req.user, body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  patch(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user, id, body);
  }

  @Get()
  findAll() {
    return this.svc.findAll();
  }

//   // ✅ Correct path + correct service reference
//   @Patch(':id/status')
// async updateStatus(
//   @Req() req: any,
//   @Param('id') id: string,
//   @Body('status') status: ReportStatus,
// ) {
//   return this.svc.updateStatus(req.user, id, status);
// }


@Patch(':id/status')
async updateStatus(
  @Req() req: any,
  @Param('id') id: string,
  @Body() body: { status: ReportStatus; reason?: string },
) {
  return this.svc.update(req.user, id, body); // send full body including reason
}


}
