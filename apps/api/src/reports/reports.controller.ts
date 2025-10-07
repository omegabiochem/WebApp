import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AttachmentKind, ReportStatus } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { setRequestContext } from 'src/common/request-context';

type CreateCorrectionsDto = {
  items: { fieldKey: string; message: string }[];
  targetStatus?: ReportStatus;   // optional: move to *_NEEDS_CORRECTION in same call
  reason?: string;               // optional audit reason
};

type ResolveCorrectionDto = {
  resolutionNote?: string;       // optional
};

type CreateAttachmentDto = {
  pages?: string;
  checksum?: string;
  source?: string;
  createdBy?: string;
 kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
};

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

     const reasonFromHeader =
    req.headers['x-change-reason'] || req.headers['X-Change-Reason'];
  setRequestContext({
    userId: req.user?.userId,
    role: req.user?.role,
    ip: req.ip,
    reason: body?.reason ?? (reasonFromHeader as string) ?? null,
    eSignPassword: req.headers['x-esign-password'] as string | undefined,
  });
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

  const reasonFromHeader =
    req.headers['x-change-reason'] || req.headers['X-Change-Reason'];

    const eSignFromHeader = req.headers['x-esign-password'];

  setRequestContext({
    userId: req.user?.userId,     // ✅ fixed
    role: req.user?.role,
    ip: req.ip,
    reason: body?.reason ?? (reasonFromHeader as string) ?? null,
  });
  
  return this.svc.update(req.user, id, body); // send full body including reason
}

 // ✅ Corrections API
  @Post(':id/corrections')
  createCorrections(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateCorrectionsDto,
  ) {
    return this.svc.createCorrections(req.user, id, body);
  }

  @Get(':id/corrections')
  listCorrections(@Param('id') id: string) {
    return this.svc.listCorrections(id);
  }

  @Patch(':id/corrections/:cid')
  resolveCorrection(
    @Req() req: any,
    @Param('id') id: string,
    @Param('cid') cid: string,
    @Body() body: ResolveCorrectionDto,
  ) {
    return this.svc.resolveCorrection(req.user, id, cid, body);
  }



  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file')) // expects field name "file"
  async addAttachment(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    // Throws NotFoundException if report not visible to this user/org
    return this.svc.addAttachment(req.user, id, file, body);
  }

  


}
