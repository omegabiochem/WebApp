import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChemistryReportsService } from './chemistryreports.service';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { FormType } from '@prisma/client';

const slugToFormType = (slug: string): FormType | null => {
  switch (slug) {
    case 'chemistry-mix':
      return 'CHEMISTRY_MIX';
    default:
      return null;
  }
};

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
}
