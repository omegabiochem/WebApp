import { PrismaService } from 'prisma/prisma.service';
import { FormType, UserRole } from '@prisma/client';

type CreateAuditLogArgs = {
  action: string;
  details: string;
  changes?: any;

  entity: string;
  entityId?: string | null;

  userId?: string | null;
  role?: UserRole | null;
  ipAddress?: string | null;

  clientCode?: string | null;
  formNumber?: string | null;
  reportNumber?: string | null;
  formType?: FormType | null;
};

export async function createAuditLog(
  prisma: PrismaService,
  args: CreateAuditLogArgs,
) {
  return prisma.auditTrail.create({
    data: {
      action: args.action,
      details: args.details,
      changes: args.changes ?? undefined,

      entity: args.entity,
      entityId: args.entityId ?? undefined,

      userId: args.userId ?? undefined,
      role: args.role ?? undefined,
      ipAddress: args.ipAddress ?? undefined,

      clientCode: args.clientCode ?? undefined,
      formNumber: args.formNumber ?? undefined,
      reportNumber: args.reportNumber ?? undefined,
      formType: args.formType ?? undefined,
    },
  });
}