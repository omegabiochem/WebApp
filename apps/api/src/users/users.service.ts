// src/users/users.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ReportStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';

const USERID_RE = /^[a-z0-9._-]{4,20}$/;

function randomTempPassword(len = 12) {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  return Array.from(
    { length: len },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

const ACTIVE_REPORT_STATUSES: ReportStatus[] = [
  'DRAFT',
  'RECEIVED_BY_FRONTDESK',
  'FRONTDESK_ON_HOLD',
  'FRONTDESK_NEEDS_CORRECTION',
  'UNDER_PRELIMINARY_TESTING_REVIEW',
  'PRELIMINARY_TESTING_ON_HOLD',
  'PRELIMINARY_TESTING_NEEDS_CORRECTION',
  'PRELIMINARY_RESUBMISSION_BY_TESTING',
  'UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW',
  'PRELIMINARY_APPROVED',
  'UNDER_FINAL_TESTING_REVIEW',
  'FINAL_TESTING_ON_HOLD',
  'FINAL_TESTING_NEEDS_CORRECTION',
  'FINAL_RESUBMISSION_BY_TESTING',
  'UNDER_FINAL_RESUBMISSION_TESTING_REVIEW',
  'UNDER_QA_PRELIMINARY_REVIEW',
  'QA_NEEDS_PRELIMINARY_CORRECTION',
  'UNDER_QA_FINAL_REVIEW',
  'QA_NEEDS_FINAL_CORRECTION',
  'UNDER_ADMIN_REVIEW',
  'ADMIN_NEEDS_CORRECTION',
  'ADMIN_REJECTED',
  'UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW',
];

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // Admin must provide userId
  async createByAdmin(input: {
    email: string;
    name?: string;
    role: UserRole;
    userId: string;
    clientCode?: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const desiredUserId = (input.userId ?? '').trim().toLowerCase();

    if (!desiredUserId) throw new BadRequestException('User ID is required');
    if (!USERID_RE.test(desiredUserId)) {
      throw new BadRequestException(
        'Invalid User ID (4–20 chars, lowercase a–z, 0–9, dot, underscore, hyphen)',
      );
    }

    if (input.role === 'CLIENT') {
      if (!input.clientCode || !/^[A-Z]{3}$/.test(input.clientCode)) {
        throw new BadRequestException(
          'Client Code must be exactly 3 uppercase letters',
        );
      }
    }

    // const emailExists = await this.prisma.user.findUnique({ where: { email } });
    // if (emailExists) throw new BadRequestException('Email already exists');

    // Check userId uniqueness
    const uidExists = await this.prisma.user.findFirst({
      where: { userId: desiredUserId },
    });
    if (uidExists) throw new BadRequestException('User ID already taken');

    const temp = randomTempPassword();
    const passwordHash = await bcrypt.hash(temp, 12);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name ?? null,
        role: input.role,
        userId: desiredUserId,
        userIdSetAt: new Date(),
        passwordHash,
        mustChangePassword: true,
        active: true,
        passwordVersion: 1,
        clientCode: input.role === 'CLIENT' ? input.clientCode : null,
        tempPasswordExpiresAt: expiresAt,
        passwordUpdatedAt: new Date(),
      },
      // keep a safe selection (don’t leak passwordHash)
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mustChangePassword: true,
        userId: true,
        clientCode: true,
      },
    });

    try {
      await this.mail.sendCredentialsEmail({
        to: user.email,
        name: user.name,
        userId: user.userId!, // safe because admin always sets it
        tempPassword: temp,
        expiresAt,
      });
    } catch (e) {
      console.error('Email send failed:', e);
    }

    return { ok: true, user, tempPassword: temp };
  }

  async changeRole(userId: string, role: UserRole) {
    const found = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!found) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async listAllPaged(params: {
    q?: string;
    role?: UserRole | 'ALL';
    active?: 'ALL' | 'TRUE' | 'FALSE';
    page?: number;
    pageSize?: number;
  }) {
    const {
      q = '',
      role = 'ALL',
      active = 'ALL',
      page = 1,
      pageSize = 20,
    } = params ?? {};
    const where: any = {};
    if (role !== 'ALL') where.role = role;
    if (active !== 'ALL') where.active = active === 'TRUE';
    if (q)
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { userId: { contains: q, mode: 'insensitive' } },
      ];

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          mustChangePassword: true,
          userId: true,
          clientCode: true,
          lastLoginAt: true,
          lastActivityAt: true,
          createdAt: true,
        },
      }),
    ]);

    const userIds = items.map((u) => u.userId).filter(Boolean) as string[];
    let counts: Record<string, number> = {};
    if (userIds.length) {
      const perUser = await Promise.all(
        userIds.map(async (uid) => {
          const c = await this.prisma.report.count({
            where: {
              status: { in: ACTIVE_REPORT_STATUSES },
              OR: [
                { microMix: { is: { testedBy: uid } } },
                { microMixWater: { is: { testedBy: uid } } },
              ],
            },
          });
          return { uid, c };
        }),
      );
      counts = perUser.reduce(
        (acc, x) => ((acc[x.uid] = x.c), acc),
        {} as Record<string, number>,
      );
    }

    return {
      items: items.map((u) => ({
        ...u,
        activeReportCount: u.userId ? (counts[u.userId] ?? 0) : undefined,
      })),
      total,
      page,
      pageSize,
    };
  }

  async toggleActive(id: string, active: boolean) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id }, data: { active } });
    return { ok: true };
  }

  async updateClientCode(id: string, clientCode: string | null) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('User not found');
    if (clientCode && !/^[A-Z]{3}$/.test(clientCode)) {
      throw new BadRequestException(
        'Client Code must be exactly 3 uppercase letters',
      );
    }
    await this.prisma.user.update({
      where: { id },
      data: { clientCode: clientCode ?? null },
    });
    return { ok: true };
  }

  // async resetPasswordAdmin(id: string) {
  //   const u = await this.prisma.user.findUnique({ where: { id } });
  //   if (!u) throw new NotFoundException('User not found');
  //   const temp = randomTempPassword();
  //   const passwordHash = await bcrypt.hash(temp, 12);
  //   await this.prisma.user.update({
  //     where: { id },
  //     data: {
  //       passwordHash,
  //       mustChangePassword: true,
  //       passwordVersion: { increment: 1 },
  //       passwordUpdatedAt: new Date(),
  //     },
  //   });
  //   return { tempPassword: temp };
  // }

  async resetPasswordAdmin(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');

    const temp = randomTempPassword();
    const passwordHash = await bcrypt.hash(temp, 12);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordVersion: { increment: 1 },
        passwordUpdatedAt: new Date(),
        tempPasswordExpiresAt: expiresAt,
      },
    });

    try {
      await this.mail.sendCredentialsEmail({
        to: u.email,
        name: u.name,
        userId: u.userId ?? u.email, // fallback
        tempPassword: temp,
        expiresAt,
      });
    } catch (e) {
      console.error('Email send failed:', e);
    }

    return { tempPassword: temp };
  }

  async setPasswordAdmin(id: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordVersion: { increment: 1 },
        passwordUpdatedAt: new Date(),
      },
    });
    return { ok: true };
  }

  async forceSignout(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    await this.prisma.user.update({
      where: { id },
      data: { passwordVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  async checkUserIdAvailability(value: string) {
    if (!USERID_RE.test(value)) return { available: false, reason: 'INVALID' };
    const exists = await this.prisma.user.findFirst({
      where: { userId: value },
    });
    return { available: !exists };
  }
}
