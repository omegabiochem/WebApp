import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { FormType, UserRole } from '@prisma/client';
import { NotificationGateway } from './notification.gateway';

type Viewer = {
  userId: string;
  role: UserRole;
  clientCode?: string | null;
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  async createForUser(args: {
    userId: string;
    kind: string;
    title: string;
    body: string;
    severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    entityType?: string;
    entityId?: string;
    formType?: FormType;
    formNumber?: string;
    reportUrl?: string;
    status?: string;
    meta?: any;
  }) {
    const row = await this.prisma.notification.create({
      data: {
        userId: args.userId,
        kind: args.kind,
        title: args.title,
        body: args.body,
        severity: args.severity ?? 'INFO',
        entityType: args.entityType,
        entityId: args.entityId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl: args.reportUrl,
        status: args.status,
        meta: args.meta,
      },
    });

    this.gateway.emitToUser(args.userId, row);
    return row;
  }

  async createForRole(args: {
    role: UserRole;
    kind: string;
    title: string;
    body: string;
    severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    entityType?: string;
    entityId?: string;
    formType?: FormType;
    formNumber?: string;
    reportUrl?: string;
    status?: string;
    meta?: any;
  }) {
    const row = await this.prisma.notification.create({
      data: {
        role: args.role,
        kind: args.kind,
        title: args.title,
        body: args.body,
        severity: args.severity ?? 'INFO',
        entityType: args.entityType,
        entityId: args.entityId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl: args.reportUrl,
        status: args.status,
        meta: args.meta,
      },
    });

    this.gateway.emitToRole(args.role, row);
    return row;
  }

  async createForRoles(args: {
  roles: UserRole[];
  kind: string;
  title: string;
  body: string;
  severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  entityType?: string;
  entityId?: string;
  formType?: FormType;
  formNumber?: string;
  reportUrl?: string;
  status?: string;
  meta?: any;
}) {
  const roles = [...new Set(args.roles)].filter(Boolean);

  const rows = await Promise.all(
    roles.map(async (role) => {
      const row = await this.prisma.notification.create({
        data: {
          role,
          kind: args.kind,
          title: args.title,
          body: args.body,
          severity: args.severity ?? 'INFO',
          entityType: args.entityType,
          entityId: args.entityId,
          formType: args.formType,
          formNumber: args.formNumber,
          reportUrl: args.reportUrl,
          status: args.status,
          meta: args.meta,
        },
      });

      this.gateway.emitToRole(role, row);
      return row;
    }),
  );

  return rows;
}

  async createForClientCode(args: {
    clientCode: string;
    kind: string;
    title: string;
    body: string;
    severity?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    entityType?: string;
    entityId?: string;
    formType?: FormType;
    formNumber?: string;
    reportUrl?: string;
    status?: string;
    meta?: any;
  }) {
    const row = await this.prisma.notification.create({
      data: {
        clientCode: args.clientCode,
        kind: args.kind,
        title: args.title,
        body: args.body,
        severity: args.severity ?? 'INFO',
        entityType: args.entityType,
        entityId: args.entityId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl: args.reportUrl,
        status: args.status,
        meta: args.meta,
      },
    });

    this.gateway.emitToClientCode(args.clientCode, row);
    return row;
  }

  async listForViewer(viewer: Viewer) {
    return this.prisma.notification.findMany({
      where: {
        OR: [
          { userId: viewer.userId },
          { role: viewer.role },
          ...(viewer.clientCode ? [{ clientCode: viewer.clientCode }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(viewer: Viewer) {
    return this.prisma.notification.count({
      where: {
        readAt: null,
        OR: [
          { userId: viewer.userId },
          { role: viewer.role },
          ...(viewer.clientCode ? [{ clientCode: viewer.clientCode }] : []),
        ],
      },
    });
  }

  async markRead(viewer: Viewer, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: {
        id,
        OR: [
          { userId: viewer.userId },
          { role: viewer.role },
          ...(viewer.clientCode ? [{ clientCode: viewer.clientCode }] : []),
        ],
      },
    });

    if (!row) return { ok: false };

    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return { ok: true };
  }

  async markAllRead(viewer: Viewer) {
    const res = await this.prisma.notification.updateMany({
      where: {
        readAt: null,
        OR: [
          { userId: viewer.userId },
          { role: viewer.role },
          ...(viewer.clientCode ? [{ clientCode: viewer.clientCode }] : []),
        ],
      },
      data: { readAt: new Date() },
    });

    return { ok: true, count: res.count };
  }
}