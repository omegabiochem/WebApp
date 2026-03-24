import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FormType } from '@prisma/client';
import type { Request } from 'express';
import { RemoveTemplateDto } from './dto/remove-template.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateTemplateDto) {
    const user = (req as any).user;
    return this.service.create(
      {
        userId: user.userId ?? user.sub,
        role: user.role,
        clientCode: user.clientCode,
      },
      dto,
    );
  }

  @Get()
  list(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('formType') formType?: FormType,
    @Query('clientCode') clientCode?: string,
    @Query('scope') scope?: 'CLIENT' | 'GLOBAL' | 'ALL',
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('sort') sort?: 'NEWEST' | 'OLDEST' | 'NAME_AZ' | 'NAME_ZA',
  ) {
    const user = (req as any).user;
    return this.service.list(
      {
        userId: user.userId ?? user.sub,
        role: user.role,
        clientCode: user.clientCode,
      },
      {
        q,
        formType,
        clientCode,
        scope,
        take: take ? Number(take) : undefined,
        skip: skip ? Number(skip) : undefined,
        sort,
      },
    );
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    return this.service.get(
      {
        userId: user.userId ?? user.sub,
        role: user.role,
        clientCode: user.clientCode,
      },
      id,
    );
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const user = (req as any).user;
    return this.service.update(
      {
        userId: user.userId ?? user.sub,
        role: user.role,
        clientCode: user.clientCode,
      },
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: RemoveTemplateDto,
  ) {
    const user = (req as any).user;
    return this.service.remove(
      {
        userId: user.userId ?? user.sub,
        role: user.role,
        clientCode: user.clientCode,
      },
      id,
      dto,
    );
  }

  @Post(':id/create-report')
  createFromTemplate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;

    return this.service.createReportFromTemplate(
      {
        userId: user.userId ?? user.sub,
        role: user.role,
        clientCode: user.clientCode,
      },
      id,
    );
  }
}
