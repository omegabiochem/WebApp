import { Controller, Get, Param, Res, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { Response } from 'express';

@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  // ✅ NEW: list all (with optional filters)
  @Get()
  async listAll(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string, // ISO date/time, e.g. 2025-09-18 or 2025-09-18T00:00:00Z
    @Query('to') to?: string,
  ) {
    return this.audit.listAll({ entity, entityId, userId, action, from, to });
  }

  // ✅ existing per-entity route (kept)
  @Get(':entity/:id')
  async list(@Param('entity') entity: string, @Param('id') id: string) {
    return this.audit.listForEntity(entity, id);
  }

  // ✅ NEW: export ALL as CSV (same optional filters)
  @Get('export.csv')
  async exportAllCSV(
    @Res() res: Response,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csv = await this.audit.exportAllCSV({ entity, entityId, userId, action, from, to });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_all.csv"`);
    res.send(csv);
  }

  // ✅ existing per-entity CSV (kept)
  @Get(':entity/:id/export.csv')
  async exportCSV(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const csv = await this.audit.exportCSV(entity, id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_${entity}_${id}.csv"`);
    res.send(csv);
  }
}
