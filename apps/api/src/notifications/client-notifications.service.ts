// apps/api/src/notifications/client-notifications.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ClientNotifyMode } from '@prisma/client';

function normalizeEmail(e: string) {
  return (e ?? '').trim().toLowerCase();
}

@Injectable()
export class ClientNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(clientCode: string) {
    const code = (clientCode ?? '').trim();
    if (!code) throw new BadRequestException('clientCode is required');

    const cfg = await this.prisma.clientNotificationConfig.upsert({
      where: { clientCode: code },
      update: {},
      create: { clientCode: code, mode: 'USERS_PLUS_CUSTOM' },
      select: { clientCode: true, mode: true, createdAt: true, updatedAt: true },
    });

    const emails = await this.prisma.clientNotificationEmail.findMany({
      where: { clientCode: code },
      orderBy: [{ active: 'desc' }, { email: 'asc' }],
      select: { id: true, email: true, label: true, active: true, createdAt: true, updatedAt: true },
    });

    return { ...cfg, emails };
  }

  async setMode(clientCode: string, mode: ClientNotifyMode) {
    const code = (clientCode ?? '').trim();
    if (!code) throw new BadRequestException('clientCode is required');

    return this.prisma.clientNotificationConfig.upsert({
      where: { clientCode: code },
      update: { mode },
      create: { clientCode: code, mode },
      select: { clientCode: true, mode: true, updatedAt: true },
    });
  }

  async addEmail(clientCode: string, email: string, label?: string) {
    const code = (clientCode ?? '').trim();
    const e = normalizeEmail(email);

    if (!code) throw new BadRequestException('clientCode is required');
    if (!e || !e.includes('@')) throw new BadRequestException('Valid email is required');

    // ensure config exists
    await this.prisma.clientNotificationConfig.upsert({
      where: { clientCode: code },
      update: {},
      create: { clientCode: code },
    });

    return this.prisma.clientNotificationEmail.upsert({
      where: { clientCode_email: { clientCode: code, email: e } },
      update: { label: label ?? undefined, active: true },
      create: { clientCode: code, email: e, label: label ?? null, active: true },
      select: { id: true, email: true, label: true, active: true },
    });
  }

  async toggleEmail(clientCode: string, id: string, active: boolean) {
    const code = (clientCode ?? '').trim();
    if (!code) throw new BadRequestException('clientCode is required');
    if (!id) throw new BadRequestException('id is required');

    const row = await this.prisma.clientNotificationEmail.findFirst({
      where: { id, clientCode: code },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Email not found for this client');

    return this.prisma.clientNotificationEmail.update({
      where: { id },
      data: { active: !!active },
      select: { id: true, email: true, label: true, active: true },
    });
  }

  async removeEmail(clientCode: string, id: string) {
    const code = (clientCode ?? '').trim();
    if (!code) throw new BadRequestException('clientCode is required');

    const row = await this.prisma.clientNotificationEmail.findFirst({
      where: { id, clientCode: code },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Email not found for this client');

    await this.prisma.clientNotificationEmail.delete({ where: { id } });
    return { ok: true };
  }

  //   // ✅ NEW: list all configs
  // async listAll(q?: string) {
  //   const where = q?.trim()
  //     ? {
  //         clientCode: {
  //           contains: q.trim().toUpperCase(),
  //           mode: 'insensitive' as const,
  //         },
  //       }
  //     : undefined;

  //   const rows = await this.prisma.clientNotificationConfig.findMany({
  //     where,
  //     orderBy: { clientCode: 'asc' },
  //     include: {
  //       emails: { orderBy: { email: 'asc' } },
  //     },
  //   });

  //   return rows.map((r) => ({
  //     clientCode: r.clientCode,
  //     mode: r.mode,
  //     emails: r.emails.map((e) => ({
  //       id: e.id,
  //       email: e.email,
  //       label: e.label,
  //       active: e.active,
  //     })),
  //   }));
  // }


  // ✅ list ALL clients from ClientSequence, and ensure config exists
  async listAllFromClientSequence(q?: string) {
    const search = (q ?? '').trim().toUpperCase();

    // 1) Fetch all client codes (source of truth)
    const seq = await this.prisma.clientSequence.findMany({
      where: search
        ? { clientCode: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { clientCode: 'asc' },
      select: { clientCode: true },
    });

    const clientCodes = seq.map((s) => s.clientCode);

    if (clientCodes.length === 0) return [];

    // 2) Ensure every client has a config row (auto-create missing)
    await this.prisma.clientNotificationConfig.createMany({
      data: clientCodes.map((clientCode) => ({
        clientCode,
        mode: ClientNotifyMode.USERS_PLUS_CUSTOM,
      })),
      skipDuplicates: true,
    });

    // 3) Return configs + emails
    const configs = await this.prisma.clientNotificationConfig.findMany({
      where: { clientCode: { in: clientCodes } },
      orderBy: { clientCode: 'asc' },
      include: {
        emails: { orderBy: { email: 'asc' } },
      },
    });

    return configs.map((c) => ({
      clientCode: c.clientCode,
      mode: c.mode,
      emails: c.emails.map((e) => ({
        id: e.id,
        email: e.email,
        label: e.label,
        active: e.active,
      })),
    }));
  }
}
