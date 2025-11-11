// src/users/users.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ReportStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const USERID_RE = /^[a-z0-9._-]{4,20}$/;

function randomTempPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const ACTIVE_REPORT_STATUSES: ReportStatus[] = [
  'DRAFT','RECEIVED_BY_FRONTDESK','FRONTDESK_ON_HOLD','FRONTDESK_NEEDS_CORRECTION',
  'UNDER_PRELIMINARY_TESTING_REVIEW','PRELIMINARY_TESTING_ON_HOLD','PRELIMINARY_TESTING_NEEDS_CORRECTION',
  'PRELIMINARY_RESUBMISSION_BY_TESTING','UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW','PRELIMINARY_APPROVED',
  'UNDER_FINAL_TESTING_REVIEW','FINAL_TESTING_ON_HOLD','FINAL_TESTING_NEEDS_CORRECTION',
  'FINAL_RESUBMISSION_BY_TESTING','UNDER_FINAL_RESUBMISSION_TESTING_REVIEW',
  'UNDER_QA_REVIEW','QA_NEEDS_CORRECTION','UNDER_ADMIN_REVIEW','ADMIN_NEEDS_CORRECTION',
  'ADMIN_REJECTED','UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW'
];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createByAdmin(input: { email: string; name?: string; role: UserRole; userId: string; clientCode?: string }) {
    const email = input.email.trim().toLowerCase();
    const desiredUserId = (input.userId ?? '').trim().toLowerCase();

    if (!desiredUserId) throw new BadRequestException('User ID is required');
    if (!USERID_RE.test(desiredUserId)) throw new BadRequestException('Invalid User ID (4–20 chars, lowercase a–z, 0–9, . _ -)');
    if (input.role === 'CLIENT') {
      if (!input.clientCode || !/^[A-Z]{3}$/.test(input.clientCode)) {
        throw new BadRequestException('Client Code must be exactly 3 uppercase letters');
      }
    }

    const emailExists = await this.prisma.user.findUnique({ where: { email } });
    if (emailExists) throw new BadRequestException('Email already exists');

    const uidExists = await this.prisma.user.findFirst({ where: { userId: desiredUserId } });
    if (uidExists) throw new BadRequestException('User ID already taken');

    const temp = randomTempPassword();
    const passwordHash = await bcrypt.hash(temp, 12);

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
      },
      select: { id: true, email: true, name: true, role: true, mustChangePassword: true, userId: true, clientCode: true },
    });

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

  // New: paged/filtered
  async listAllPaged(params: { q?: string; role?: UserRole|'ALL'; active?: 'ALL'|'TRUE'|'FALSE'; page?: number; pageSize?: number; }) {
    const { q='', role='ALL', active='ALL', page=1, pageSize=20 } = params ?? {};
    const where: any = {};
    if (role !== 'ALL') where.role = role;
    if (active !== 'ALL') where.active = active === 'TRUE';
    if (q) where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { userId: { contains: q, mode: 'insensitive' } },
    ];

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page-1)*pageSize,
        take: pageSize,
        select: {
          id: true, email: true, name: true, role: true, active: true,
          mustChangePassword: true, userId: true, clientCode: true,
          lastLoginAt: true, lastActivityAt: true, createdAt: true,
        }
      })
    ]);

    // Optional workload count (cheap approximation)
    const userIds = items.map(u => u.userId).filter(Boolean) as string[];
    let counts: Record<string, number> = {};
    if (userIds.length) {
      const perUser = await Promise.all(userIds.map(async uid => {
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
      }));
      counts = perUser.reduce((acc, x) => (acc[x.uid] = x.c, acc), {} as Record<string, number>);
    }

    return {
      items: items.map(u => ({ ...u, activeReportCount: u.userId ? counts[u.userId] ?? 0 : undefined })),
      total, page, pageSize
    };
  }

  // Toggle active
  async toggleActive(id: string, active: boolean) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id }, data: { active } });
    return { ok: true };
  }

  // Update client code
  async updateClientCode(id: string, clientCode: string | null) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('User not found');
    if (clientCode && !/^[A-Z]{3}$/.test(clientCode)) {
      throw new BadRequestException('Client Code must be exactly 3 uppercase letters');
    }
    await this.prisma.user.update({ where: { id }, data: { clientCode: clientCode ?? null } });
    return { ok: true };
  }

  // Reset password (returns temp)
  async resetPasswordAdmin(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    const temp = randomTempPassword();
    const passwordHash = await bcrypt.hash(temp, 12);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordVersion: { increment: 1 },
        passwordUpdatedAt: new Date(),
      },
    });
    return { tempPassword: temp };
  }

  // Admin sets password directly
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

  // Force sign-out (invalidate tokens)
  async forceSignout(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    await this.prisma.user.update({
      where: { id },
      data: { passwordVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  // Optional: UI username availability
  async checkUserIdAvailability(value: string) {
    if (!USERID_RE.test(value)) return { available: false, reason: 'INVALID' };
    const exists = await this.prisma.user.findFirst({ where: { userId: value } });
    return { available: !exists };
  }
}



// import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
// import { PrismaClient, UserRole } from '@prisma/client';
// import * as bcrypt from 'bcrypt';
// const prisma = new PrismaClient();

// function randomTempPassword(len = 12) {
//   const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
//   return Array.from({ length: len }, () => chars[Math.floor(Math.random()*chars.length)]).join('');
// }

// @Injectable()
// export class UsersService {
//   async createByAdmin(input: { email: string; name?: string; role: UserRole;userId?:string }) {
//     const exists = await prisma.user.findUnique({ where: { email: input.email } });
//     if (exists) throw new BadRequestException('Email already exists');

//     const temp = randomTempPassword();
//     const passwordHash = await bcrypt.hash(temp, 10);

//     const user = await prisma.user.create({
//       data: {
//         email: input.email.toLowerCase(),
//         name: input.name ?? null,
//         role: input.role,
//         passwordHash,
//         mustChangePassword: true,
//         active: true,
//         passwordVersion: 1, // or another default value as required
//         inviteToken: '', // or generate a token if needed
//       },
//       select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
//     });

//     // In production, email the temp password. For now, return it to the admin UI.
//     return { user, tempPassword: temp };
//   }

//   async changeRole(userId: string, role: UserRole) {
//     const found = await prisma.user.findUnique({ where: { id: userId } });
//     if (!found) throw new NotFoundException('User not found');
//     const user = await prisma.user.update({
//       where: { id: userId },
//       data: { role },
//       select: { id: true, email: true, name: true, role: true },
//     });
//     return user;
//   }

//   async listAll() {
//     return prisma.user.findMany({
//       orderBy: { createdAt: 'desc' },
//       select: { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true },
//     });
//   }
// }
