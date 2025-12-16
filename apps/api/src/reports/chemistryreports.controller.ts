import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChemistryReportsService } from './chemistryreports.service';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { ChemistryReportStatus, FormType } from '@prisma/client';
import { withRequestContext } from 'src/common/request-context';

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

@UseGuards(JwtAuthGuard)
@Controller('chemistry-reports')
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
}
