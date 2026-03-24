import { Controller, Get, Param, Res, Query, Post, Body } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { Response } from 'express';
import { PrismaService } from 'prisma/prisma.service';
import { getRequestContext } from 'src/common/request-context';
import { FormType, UserRole } from '@prisma/client';

@Controller('audit')
export class AuditController {
  constructor(
    private audit: AuditService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async listAll(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('role') role?: UserRole,
    @Query('formNumber') formNumber?: string,
    @Query('reportNumber') reportNumber?: string,
    @Query('clientCode') clientCode?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('order') order: 'asc' | 'desc' = 'desc',
  ) {
    const ctx = getRequestContext() || {};
    const requesterRole = (ctx as any).role as UserRole | undefined;
    const requesterClientCode = (ctx as any).clientCode as string | undefined;

    const isClient = requesterRole === UserRole.CLIENT;

    return this.audit.listAllPaged({
      entity,
      entityId,
      userId: isClient ? undefined : userId,
      action,
      from,
      to,
      role: isClient ? undefined : role,
      page: Number(page),
      pageSize: Number(pageSize),
      order,
      formNumber,
      reportNumber,
      clientCode: isClient ? requesterClientCode : clientCode,
    });
  }

@Get(':entity/:id')
async list(@Param('entity') entity: string, @Param('id') id: string) {
  const ctx = getRequestContext() || {};
  const requesterRole = (ctx as any).role as UserRole | undefined;
  const requesterClientCode = (ctx as any).clientCode as string | undefined;

  return this.audit.listForEntity(
    entity,
    id,
    requesterRole === UserRole.CLIENT ? requesterClientCode : undefined,
  );
}
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
    @Query('role') role?: UserRole,
    @Query('formNumber') formNumber?: string,
    @Query('reportNumber') reportNumber?: string,
    @Query('clientCode') clientCode?: string,
  ) {
    const ctx = getRequestContext() || {};
    const requesterRole = (ctx as any).role as UserRole | undefined;
    const requesterClientCode = (ctx as any).clientCode as string | undefined;

    const isClient = requesterRole === UserRole.CLIENT;

    const csv = await this.audit.exportAllCSV({
      entity,
      entityId,
      userId: isClient ? undefined : userId,
      action,
      from,
      to,
      order,
     role: isClient ? undefined : role,
      formNumber,
      reportNumber,
      clientCode: isClient ? requesterClientCode : clientCode,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit_all.csv"`,
    );
    res.send(csv);
  }

 @Get(':entity/:id/export.csv')
async exportCSV(
  @Param('entity') entity: string,
  @Param('id') id: string,
  @Res() res: Response,
) {
  const ctx = getRequestContext() || {};
  const requesterRole = (ctx as any).role as UserRole | undefined;
  const requesterClientCode = (ctx as any).clientCode as string | undefined;

  const csv = await this.audit.exportCSV(
    entity,
    id,
    requesterRole === UserRole.CLIENT ? requesterClientCode : undefined,
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="audit_${entity}_${id}.csv"`,
  );
  res.send(csv);
}

  @Post('ui')
  async logUi(@Body() body: any) {
    const ctx = getRequestContext() || {};

    const action = String(body?.action || 'UI_EVENT').toUpperCase();
    const entity = String(body?.entity || 'UI');
    const entityId = body?.entityId ? String(body.entityId) : null;

    const details = String(body?.details || '');
    const meta = body?.meta;

    const formNumber = body?.formNumber ? String(body.formNumber) : null;
    const reportNumber = body?.reportNumber ? String(body.reportNumber) : null;
    const requesterRole = (ctx as any).role as UserRole | undefined;
    const requesterClientCode = (ctx as any).clientCode as string | undefined;

    const clientCode =
      requesterRole === 'CLIENT'
        ? (requesterClientCode ?? null)
        : body?.clientCode
          ? String(body.clientCode)
          : null;
    const formType = body?.formType
      ? (String(body.formType) as FormType)
      : null;

    await this.prisma.auditTrail.create({
      data: {
        action,
        entity,
        entityId,
        details,

        ...(meta !== undefined && meta !== null ? { changes: { meta } } : {}),

        formNumber,
        reportNumber,
        clientCode,
        formType,

        userId: (ctx as any).userId ?? null,
        role: (ctx as any).role ?? null,
        ipAddress: (ctx as any).ip ?? null,
      },
    });

    return { ok: true };
  }
}

// // audit.controller.ts
// import { Controller, Get, Param, Res, Query, Post, Body } from '@nestjs/common';
// import { AuditService } from './audit.service';
// import type { Response } from 'express';
// import { PrismaService } from 'prisma/prisma.service';
// import { getRequestContext } from 'src/common/request-context';
// import { UserRole } from '@prisma/client';

// @Controller('audit')
// export class AuditController {
//   constructor(
//     private audit: AuditService,
//     private prisma: PrismaService,
//   ) {}

//   @Get()
//   async listAll(
//     @Query('entity') entity?: string,
//     @Query('entityId') entityId?: string,
//     @Query('userId') userId?: string,
//     @Query('action') action?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,

//     @Query('role') role?: UserRole,
//     @Query('formNumber') formNumber?: string,
//     @Query('reportNumber') reportNumber?: string,

//     // ✅ pagination
//     @Query('page') page = '1',
//     @Query('pageSize') pageSize = '20',

//     // ✅ sorting
//     @Query('order') order: 'asc' | 'desc' = 'desc',
//   ) {
//     const ctx = getRequestContext() || {};
//     const requesterRole = (ctx as any).role as UserRole | undefined;

//     const effectiveRole = requesterRole === 'CLIENT' ? 'CLIENT' : role;
//     return this.audit.listAllPaged({
//       entity,
//       entityId,
//       userId,
//       action,
//       from,
//       to,
//       role: effectiveRole,
//       page: Number(page),
//       pageSize: Number(pageSize),
//       order,
//       formNumber,
//       reportNumber,
//     });
//   }

//   // kept
//   @Get(':entity/:id')
//   async list(@Param('entity') entity: string, @Param('id') id: string) {
//     return this.audit.listForEntity(entity, id);
//   }

//   // kept (export should NOT paginate)
//   @Get('export.csv')
//   async exportAllCSV(
//     @Res() res: Response,
//     @Query('entity') entity?: string,
//     @Query('entityId') entityId?: string,
//     @Query('userId') userId?: string,
//     @Query('action') action?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//     @Query('order') order: 'asc' | 'desc' = 'desc',

//     @Query('role') role?: UserRole,
//     @Query('formNumber') formNumber?: string,
//     @Query('reportNumber') reportNumber?: string,
//   ) {
//     const ctx = getRequestContext() || {};
//     const requesterRole = (ctx as any).role as UserRole | undefined;
//     const effectiveRole = requesterRole === 'CLIENT' ? 'CLIENT' : role;

//     const csv = await this.audit.exportAllCSV({
//       entity,
//       entityId,
//       userId,
//       action,
//       from,
//       to,
//       order,
//       role: effectiveRole,
//       formNumber,
//       reportNumber,
//     });
//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader(
//       'Content-Disposition',
//       `attachment; filename="audit_all.csv"`,
//     );
//     res.send(csv);
//   }

//   // kept
//   @Get(':entity/:id/export.csv')
//   async exportCSV(
//     @Param('entity') entity: string,
//     @Param('id') id: string,
//     @Res() res: Response,
//   ) {
//     const csv = await this.audit.exportCSV(entity, id);
//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader(
//       'Content-Disposition',
//       `attachment; filename="audit_${entity}_${id}.csv"`,
//     );
//     res.send(csv);
//   }

//   @Post('ui')
//   async logUi(@Body() body: any) {
//     const ctx = getRequestContext() || {};

//     const action = String(body?.action || 'UI_EVENT').toUpperCase();
//     const entity = String(body?.entity || 'UI');
//     const entityId = body?.entityId ? String(body.entityId) : null;

//     const details = String(body?.details || '');
//     const meta = body?.meta;

//     await this.prisma.auditTrail.create({
//       data: {
//         action,
//         entity,
//         entityId,
//         details,

//         ...(meta !== undefined && meta !== null ? { changes: { meta } } : {}),

//         userId: (ctx as any).userId ?? null,
//         role: (ctx as any).role ?? null,
//         ipAddress: (ctx as any).ip ?? null,
//       },
//     });

//     return { ok: true };
//   }
// }
