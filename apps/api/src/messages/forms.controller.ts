import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PrismaService } from 'prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Controller('forms')
@UseGuards(JwtAuthGuard)
export class FormsController {
  constructor(private prisma: PrismaService) {}

  @Get('recent')
  async recent(@Req() req: any, @Query('limit') limitStr?: string) {
    const limit = Math.min(Math.max(Number(limitStr || 5), 1), 20);
    const user = req.user as { role: UserRole; clientCode?: string | null };

    // CLIENT can only see their own
    const clientFilter =
      user.role === 'CLIENT'
        ? { clientCode: user.clientCode ?? undefined }
        : {};

    // Micro reports
    const micro = await this.prisma.report.findMany({
      where: { ...clientFilter },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        updatedAt: true,
      },
    });

    // Chemistry reports
    const chem = await this.prisma.chemistryReport.findMany({
      where:
        user.role === 'CLIENT'
          ? { clientCode: user.clientCode ?? undefined }
          : {},
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        updatedAt: true,
      },
    });

    const items = [
      ...micro.map((r) => ({
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        reportId: r.id,
        chemistryId: undefined,
        updatedAt: r.updatedAt.toISOString(),
      })),
      ...chem.map((r) => ({
        formType: 'CHEMISTRY_MIX',
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        reportId: undefined,
        chemistryId: r.id,
        updatedAt: r.updatedAt.toISOString(),
      })),
    ]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, limit);

    return { items };
  }

  @Get('search')
  async search(@Req() req: any, @Query('q') q?: string) {
    const user = req.user as { role: UserRole; clientCode?: string | null };
    const query = (q || '').trim();
    if (!query) return { items: [] };

    const clientFilter =
      user.role === 'CLIENT'
        ? { clientCode: user.clientCode ?? undefined }
        : {};

    const micro = await this.prisma.report.findMany({
      where: {
        ...clientFilter,
        OR: [
          { formNumber: { contains: query, mode: 'insensitive' } },
          { reportNumber: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        updatedAt: true,
      },
    });

    const chem = await this.prisma.chemistryReport.findMany({
      where:
        user.role === 'CLIENT'
          ? {
              clientCode: user.clientCode ?? undefined,
              OR: [
                { formNumber: { contains: query, mode: 'insensitive' } },
                { reportNumber: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {
              OR: [
                { formNumber: { contains: query, mode: 'insensitive' } },
                { reportNumber: { contains: query, mode: 'insensitive' } },
              ],
            },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        updatedAt: true,
      },
    });

    const items = [
      ...micro.map((r) => ({
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        reportId: r.id,
        chemistryId: undefined,
        updatedAt: r.updatedAt.toISOString(),
      })),
      ...chem.map((r) => ({
        formType: 'CHEMISTRY_MIX',
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        reportId: undefined,
        chemistryId: r.id,
        updatedAt: r.updatedAt.toISOString(),
      })),
    ].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    return { items };
  }
}
