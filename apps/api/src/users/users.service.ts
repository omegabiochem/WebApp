import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();

function randomTempPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}

@Injectable()
export class UsersService {
  async createByAdmin(input: { email: string; name?: string; role: UserRole }) {
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new BadRequestException('Email already exists');

    const temp = randomTempPassword();
    const passwordHash = await bcrypt.hash(temp, 10);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        role: input.role,
        passwordHash,
        mustChangePassword: true,
        active: true,
      },
      select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
    });

    // In production, email the temp password. For now, return it to the admin UI.
    return { user, tempPassword: temp };
  }

  async changeRole(userId: string, role: UserRole) {
    const found = await prisma.user.findUnique({ where: { id: userId } });
    if (!found) throw new NotFoundException('User not found');
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  }

  async listAll() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true },
    });
  }
}
