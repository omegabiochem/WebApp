import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PrismaService } from 'prisma/prisma.service';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';

@Controller('forms')
@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
export class FormsController {
  constructor(private prisma: PrismaService) {}

  private async scope(req: any, requested?: string) {
    const id = req.user?.userId ?? req.user?.sub;
    if (!id) throw new ForbiddenException('Auth missing');
    const actor = await this.prisma.user.findUnique({ where: { id } });
    if (!actor?.active) throw new ForbiddenException('Account unavailable');
    if (actor.role === 'CLIENT') {
      if (!actor.clientCode)
        throw new ForbiddenException('Client code missing');
      return actor.clientCode;
    }
    if (
      ![
        'MICRO',
        'CHEMISTRY',
        'MC',
        'QA',
        'FRONTDESK',
        'ADMIN',
        'SYSTEMADMIN',
      ].includes(actor.role)
    )
      throw new ForbiddenException('Not allowed');
    if (!requested?.trim()) throw new ForbiddenException('clientCode required');
    return requested.trim();
  }

  private async items(clientCode: string, limit: number, query?: string) {
    const where = {
      clientCode,
      ...(query
        ? {
            OR: [
              { formNumber: { contains: query, mode: 'insensitive' as const } },
              {
                reportNumber: { contains: query, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };
    const select = {
      id: true,
      formType: true,
      formNumber: true,
      reportNumber: true,
      updatedAt: true,
    } as const;
    const [micro, chem] = await Promise.all([
      this.prisma.report.findMany({
        where,
        select,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.chemistryReport.findMany({
        where,
        select,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return {
      items: [
        ...micro.map((r) => ({
          formType: r.formType,
          formNumber: r.formNumber,
          reportNumber: r.reportNumber,
          reportId: r.id,
          updatedAt: r.updatedAt.toISOString(),
        })),
        ...chem.map((r) => ({
          formType: r.formType,
          formNumber: r.formNumber,
          reportNumber: r.reportNumber,
          chemistryId: r.id,
          updatedAt: r.updatedAt.toISOString(),
        })),
      ]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit),
    };
  }

  @Get('recent')
  async recent(
    @Req() req: any,
    @Query('limit') raw?: string,
    @Query('clientCode') code?: string,
  ) {
    const scope = await this.scope(req, code);
    const n = Number(raw ?? 5);
    return this.items(
      scope,
      Number.isFinite(n) ? Math.min(20, Math.max(1, Math.floor(n))) : 5,
    );
  }

  @Get('search')
  async search(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('clientCode') code?: string,
  ) {
    const scope = await this.scope(req, code);
    const query = (q ?? '').trim();
    return query ? this.items(scope, 20, query) : { items: [] };
  }
}
