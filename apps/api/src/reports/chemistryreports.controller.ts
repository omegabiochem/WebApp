import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ChemistryReportsService } from './chemistryreports.service';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { ChemistryReportStatus, FormType } from '@prisma/client';
import { withRequestContext } from 'src/common/request-context';
import { FileInterceptor } from '@nestjs/platform-express';

const slugToFormType = (slug: string): FormType | null => {
  switch (slug) {
    case 'chemistry-mix':
      return 'CHEMISTRY_MIX';
    default:
      return null;
  }
};

export class ChangeStatusDto {
  status!: ChemistryReportStatus;
  reason?: string;
  eSignPassword?: string;
  force?: boolean;
  deptRoleForSeq?: 'MICRO' | 'CHEMISTRY';
}

type CreateAttachmentDto = {
  pages?: string;
  checksum?: string;
  source?: string;
  createdBy?: string;
  kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
};

@UseGuards(JwtAuthGuard)
@Controller(['chemistry-reports', 'chemistry-reports/chemistry-mix'])
export class ChemistryReportsController {
  // Controller methods would go here
  constructor(private svc: ChemistryReportsService) {}

  @Post(':formType')
  createWithParam(
    @Req() req: any,
    @Param('formType') formTypeSlug: string,
    @Body() body: any,
  ) {
    const formType = slugToFormType(formTypeSlug);
    if (!formType)
      throw new BadRequestException(`Unknown form type: ${formTypeSlug}`);
    return this.svc.createChemistryReportDraft(req.user, { ...body, formType });
  }

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user, id, body);
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: { status: ChemistryReportStatus },
  ) {
    return this.svc.updateStatus(req.user, id, body.status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
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
