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
}
