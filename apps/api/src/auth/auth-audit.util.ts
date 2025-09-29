import { PrismaService } from 'prisma/prisma.service';

export type AuthAuditPayload = {
  prisma: PrismaService;
  action: 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'PASSWORD_CHANGE';
  userId?: string | null;           // known on success; null/unknown on failures
  role?: string | null;
  ip?: string | null;
  entityId?: string | null;         // usually userId (or attempted username on failure)
  details?: string;                 // free text summary
  meta?: Record<string, any>;       // goes into `changes` JSON (userAgent, jti, mfa, reason, etc.)
};

export async function logAuthEvent(p: AuthAuditPayload) {
  await p.prisma.auditTrail.create({
    data: {
      action: p.action,
      entity: 'Auth',
      entityId: p.entityId ?? p.userId ?? null,
      details: p.details ?? '',
      changes: p.meta ?? {},
      userId: p.userId ?? null,
      role: (p.role as any) ?? null,
      ipAddress: p.ip ?? null,
    },
  });
}
