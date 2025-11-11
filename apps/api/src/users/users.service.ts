import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function randomTempPassword(len = 12) {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  return Array.from(
    { length: len },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

const USERID_RE = /^[a-z0-9._-]{4,20}$/;

@Injectable()
export class UsersService {
  // ✅ Admin must provide userId
  async createByAdmin(input: {
    email: string;
    name?: string;
    role: UserRole;
    userId: string;
    clientCode?: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const desiredUserId = (input.userId ?? '').trim().toLowerCase();

    // Validate required userId
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

    // Check email uniqueness
    const emailExists = await prisma.user.findUnique({ where: { email } });
    if (emailExists) throw new BadRequestException('Email already exists');

    // Check userId uniqueness
    const uidExists = await prisma.user.findFirst({
      where: { userId: desiredUserId },
    });
    if (uidExists) throw new BadRequestException('User ID already taken');

    // Generate temp password
    const temp = randomTempPassword();
    const passwordHash = await bcrypt.hash(temp, 12);

    const user = await prisma.user.create({
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

    return {
      ok: true,
      user,
      tempPassword: temp,
    };
  }

  async changeRole(userId: string, role: UserRole) {
    const found = await prisma.user.findUnique({ where: { id: userId } });
    if (!found) throw new NotFoundException('User not found');
    return prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async listAll() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        mustChangePassword: true,
        userId: true,
      },
    });
  }
}
