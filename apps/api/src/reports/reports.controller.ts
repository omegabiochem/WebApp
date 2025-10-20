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
import { ReportStatus, Prisma, FormType } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  setRequestContext,
  withRequestContext,
} from 'src/common/request-context';

type CreateCorrectionsDto = {
  items: { fieldKey: string; message: string }[];
  targetStatus?: ReportStatus;
  reason?: string;
};

type ResolveCorrectionDto = { resolutionNote?: string };

type CreateAttachmentDto = {
  pages?: string;
  checksum?: string;
  source?: string;
  createdBy?: string;
  kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
};

// --- helpers ---
const slugToFormType = (slug: string): FormType | null => {
  switch (slug) {
    case 'micro-mix':
      return 'MICRO_MIX';
    case 'micro-mix-water':
      return 'MICRO_MIX_WATER';
    case 'micro-general':
      return 'MICRO_GENERAL';
    case 'micro-general-water':
      return 'MICRO_GENERAL_WATER';
    default:
      return null;
  }
};

export class ChangeStatusDto {
  status!: ReportStatus;
  reason?: string;
  eSignPassword?: string;
  force?: boolean;
  deptRoleForSeq?: 'MICRO' | 'CHEMISTRY';
}

// Accept both the old base path and the new generic one
@UseGuards(JwtAuthGuard)
@Controller(['reports', 'reports/micro-mix'])
export class ReportsController {
  constructor(private svc: ReportsService) {}

  // Option A: create with a path param, e.g. POST /reports
  @Post(':formType')
  createWithParam(
    @Req() req: any,
    @Param('formType') formTypeSlug: string,
    @Body() body: any,
  ) {
    const formType = slugToFormType(formTypeSlug);
    if (!formType)
      throw new BadRequestException(`Unknown form type: ${formTypeSlug}`);
    return this.svc.createDraft(req.user, { ...body, formType });
  }

  // Option B: create with body.formType, and default to MICRO_MIX for legacy /reports POST
  @Post()
  create(@Req() req: any, @Body() body: any) {
    const formType: FormType | undefined = body?.formType;
    return this.svc.createDraft(req.user, {
      ...body,
      formType: formType ?? 'MICRO_MIX',
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  patch(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const reasonFromHeader = req.headers['x-change-reason'] as
      | string
      | undefined;
    const eSignFromHeader = req.headers['x-esign-password'] as
      | string
      | undefined;

    setRequestContext({
      userId: req.user?.userId,
      role: req.user?.role,
      ip: req.ip,
      reason: body?.reason ?? reasonFromHeader ?? null,
      eSignPassword: body?.eSignPassword ?? eSignFromHeader,
    });

    return this.svc.update(req.user, id, body);
  }

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: { status: ReportStatus; reason?: string; eSignPassword?: string },
  ) {
    const reasonFromHeader = req.headers['x-change-reason'] as
      | string
      | undefined;
    const eSignFromHeader = req.headers['x-esign-password'] as
      | string
      | undefined;

    setRequestContext({
      userId: req.user?.userId,
      role: req.user?.role,
      ip: req.ip,
      reason: body?.reason ?? reasonFromHeader ?? undefined,
      eSignPassword: body?.eSignPassword ?? eSignFromHeader,
    });

    // forward full body so service can pick up status + reason/eSign via ctx
    return this.svc.update(req.user, id, body);
  }

  @Patch(':id/change-status')
  async changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return withRequestContext(
      {
        userId: req.user.userId,
        role: req.user.role,
        ip: req.ip,
        reason: dto.reason,
        eSignPassword: dto.eSignPassword,
      },
      () => this.svc.changeStatus(req.user, id, dto),
    );
  }

  // Corrections
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
  @UseInterceptors(FileInterceptor('file'))
  async addAttachment(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.svc.addAttachment(req.user, id, file, body);
  }
}
