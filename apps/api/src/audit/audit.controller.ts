// audit.controller.ts
import { Controller, Get, Param, Res, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { Response } from 'express';

@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  async listAll(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,

    // ✅ pagination
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',

    // ✅ sorting
    @Query('order') order: 'asc' | 'desc' = 'desc',
  ) {
    return this.audit.listAllPaged({
      entity,
      entityId,
      userId,
      action,
      from,
      to,
      page: Number(page),
      pageSize: Number(pageSize),
      order,
    });
  }

  // kept
  @Get(':entity/:id')
  async list(@Param('entity') entity: string, @Param('id') id: string) {
    return this.audit.listForEntity(entity, id);
  }

  // kept (export should NOT paginate)
  @Get('export.csv')
  async exportAllCSV(
    @Res() res: Response,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('order') order: 'asc' | 'desc' = 'desc',
  ) {
    const csv = await this.audit.exportAllCSV({ entity, entityId, userId, action, from, to, order });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_all.csv"`);
    res.send(csv);
  }

  // kept
  @Get(':entity/:id/export.csv')
  async exportCSV(@Param('entity') entity: string, @Param('id') id: string, @Res() res: Response) {
    const csv = await this.audit.exportCSV(entity, id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_${entity}_${id}.csv"`);
    res.send(csv);
  }
}
