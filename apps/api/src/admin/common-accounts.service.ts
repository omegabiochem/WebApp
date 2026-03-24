import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class CommonAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCommonAccounts() {
    const rows = await this.prisma.commonAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      label: r.label,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      membersCount: r._count.members,
    }));
  }

  async createCommonAccount(body: {
    label: string;
    userId: string;
    password: string;
  }) {
    const label = (body.label ?? '').trim();
    const userId = (body.userId ?? '').trim().toLowerCase();
    const password = (body.password ?? '').trim();

    if (!label || !userId || !password) {
      throw new BadRequestException('label, userId, and password are required');
    }

    if (!/^[a-z0-9._-]{4,30}$/.test(userId)) {
      throw new BadRequestException(
        'userId must be 4–30 chars and contain only lowercase a-z, 0-9, dot, underscore, hyphen',
      );
    }

    const exists = await this.prisma.commonAccount.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('Common account userId already exists');
    }

    const collidesWithUser = await this.prisma.user.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (collidesWithUser) {
      throw new BadRequestException(
        'This userId is already used by a normal user account',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const row = await this.prisma.commonAccount.create({
      data: {
        label,
        userId,
        passwordHash,
        active: true,
      },
    });

    return {
      id: row.id,
      userId: row.userId,
      label: row.label,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      membersCount: 0,
    };
  }

  async updateCommonAccount(
    id: string,
    body: { active?: boolean; label?: string; password?: string },
  ) {
    const existing = await this.prisma.commonAccount.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Common account not found');
    }

    const data: any = {};

    if (typeof body.active === 'boolean') {
      data.active = body.active;
    }

    if (typeof body.label === 'string') {
      const label = body.label.trim();
      if (!label) throw new BadRequestException('Label cannot be empty');
      data.label = label;
    }

    if (typeof body.password === 'string' && body.password.trim()) {
      data.passwordHash = await bcrypt.hash(body.password.trim(), 12);
    }

    const row = await this.prisma.commonAccount.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return {
      id: row.id,
      userId: row.userId,
      label: row.label,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      membersCount: row._count.members,
    };
  }

  async listMembers(commonAccountId: string) {
    const exists = await this.prisma.commonAccount.findUnique({
      where: { id: commonAccountId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Common account not found');
    }

    const rows = await this.prisma.commonAccountMember.findMany({
      where: { commonAccountId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      active: r.active,
      allowedRoles: r.allowedRoles,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        role: r.user.role,
        active: r.user.active,
      },
    }));
  }

  async addMember(
    commonAccountId: string,
    body: {
      userId: string;
      allowedRoles: UserRole[];
      active?: boolean;
    },
  ) {
    const userId = (body.userId ?? '').trim();
    const allowedRoles = Array.isArray(body.allowedRoles)
      ? body.allowedRoles
      : [];
    const active = typeof body.active === 'boolean' ? body.active : true;

    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    if (!allowedRoles.length) {
      throw new BadRequestException('At least one allowed role is required');
    }

    const common = await this.prisma.commonAccount.findUnique({
      where: { id: commonAccountId },
      select: { id: true },
    });

    if (!common) {
      throw new NotFoundException('Common account not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const exists = await this.prisma.commonAccountMember.findFirst({
      where: { commonAccountId, userId },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('User is already added to this common account');
    }

    const row = await this.prisma.commonAccountMember.create({
      data: {
        commonAccountId,
        userId,
        allowedRoles,
        active,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
        },
      },
    });

    return {
      id: row.id,
      userId: row.userId,
      active: row.active,
      allowedRoles: row.allowedRoles,
      user: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        role: row.user.role,
        active: row.user.active,
      },
    };
  }

  async updateMember(
    commonAccountId: string,
    memberId: string,
    body: { active?: boolean; allowedRoles?: UserRole[] },
  ) {
    const existing = await this.prisma.commonAccountMember.findFirst({
      where: {
        id: memberId,
        commonAccountId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Member not found');
    }

    const data: any = {};

    if (typeof body.active === 'boolean') {
      data.active = body.active;
    }

    if (Array.isArray(body.allowedRoles)) {
      if (body.allowedRoles.length === 0) {
        throw new BadRequestException('At least one allowed role is required');
      }
      data.allowedRoles = body.allowedRoles;
    }

    const row = await this.prisma.commonAccountMember.update({
      where: { id: memberId },
      data,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
        },
      },
    });

    return {
      id: row.id,
      userId: row.userId,
      active: row.active,
      allowedRoles: row.allowedRoles,
      user: {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        role: row.user.role,
        active: row.user.active,
      },
    };
  }

  async removeMember(commonAccountId: string, memberId: string) {
    const existing = await this.prisma.commonAccountMember.findFirst({
      where: {
        id: memberId,
        commonAccountId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.commonAccountMember.delete({
      where: { id: memberId },
    });

    return { ok: true };
  }
}