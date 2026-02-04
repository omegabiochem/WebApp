import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

type ListArgs = { q: string };

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports(args: ListArgs) {
    const qRaw = (args.q ?? '').trim();
    const q = qRaw.length ? qRaw : '';

    // keep it safe for admin page; adjust if you want paging later
    const take = 250;

    // -------------------------
    // MICRO / WATER reports
    // -------------------------
    const microWhere: any = q
      ? {
          OR: [
            { formNumber: { contains: q, mode: 'insensitive' } },
            { reportNumber: { contains: q, mode: 'insensitive' } },
            { clientCode: { contains: q, mode: 'insensitive' } },
            // allow searching client name inside details (optional)
            { microMix: { is: { client: { contains: q, mode: 'insensitive' } } } },
            { microMixWater: { is: { client: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {};

    const micro = await this.prisma.report.findMany({
      where: microWhere,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        status: true,
        clientCode: true,
        createdAt: true,
      },
    });

    // -------------------------
    // CHEM reports
    // -------------------------
    const chemWhere: any = q
      ? {
          OR: [
            { formNumber: { contains: q, mode: 'insensitive' } },
            { reportNumber: { contains: q, mode: 'insensitive' } },
            { clientCode: { contains: q, mode: 'insensitive' } },
            { chemistryMix: { is: { client: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {};

    const chem = await this.prisma.chemistryReport.findMany({
      where: chemWhere,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        status: true,
        clientCode: true,
        createdAt: true,
      },
    });

    // -------------------------
    // Normalize & merge
    // -------------------------
    const merged = [
      ...micro.map((r) => ({
        id: r.id,
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        status: String(r.status),
        clientCode: r.clientCode,
        createdAt: r.createdAt.toISOString(),
      })),
      ...chem.map((r) => ({
        id: r.id,
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        status: String(r.status),
        clientCode: r.clientCode,
        createdAt: r.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return merged;
  }

  async listClients(args: ListArgs) {
    const q = (args.q ?? '').trim().toUpperCase();

    // 1) CLIENT users aggregation (clientCode is required for CLIENT role in your createByAdmin)
    const userRows = await this.prisma.user.findMany({
      where: {
        role: 'CLIENT',
        ...(q ? { clientCode: { contains: q } } : {}),
      },
      select: {
        clientCode: true,
        active: true,
      },
    });

    // build map: clientCode -> totals
    const byCode: Record<
      string,
      { clientCode: string; totalUsers: number; activeUsers: number }
    > = {};

    for (const u of userRows) {
      const code = (u.clientCode ?? '').trim();
      if (!code) continue;
      if (!byCode[code]) {
        byCode[code] = { clientCode: code, totalUsers: 0, activeUsers: 0 };
      }
      byCode[code].totalUsers += 1;
      if (u.active) byCode[code].activeUsers += 1;
    }

    // 2) notification config + emails (your existing client-notifications uses these tables)
    // Adjust model names if your prisma schema uses different names.
    const notifConfigs = await this.prisma.clientNotificationConfig.findMany({
      where: q ? { clientCode: { contains: q } } : {},
      include: {
        emails: true, // expects relation: ClientNotificationEmail[]
      },
    });

    // merge notification info into same map (some clients may have notif config even with 0 CLIENT users)
    for (const c of notifConfigs) {
      const code = c.clientCode;
      if (!byCode[code]) {
        byCode[code] = { clientCode: code, totalUsers: 0, activeUsers: 0 };
      }
    }

    // final output
    const out = Object.values(byCode)
      .map((row) => {
        const cfg = notifConfigs.find((x) => x.clientCode === row.clientCode) ?? null;

        return {
          clientCode: row.clientCode,
          totalUsers: row.totalUsers,
          activeUsers: row.activeUsers,
          notificationsMode: cfg?.mode ?? undefined,
          customEmails: cfg?.emails?.length ?? 0,
        };
      })
      .sort((a, b) => a.clientCode.localeCompare(b.clientCode));

    return out;
  }
}
