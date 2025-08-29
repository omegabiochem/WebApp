import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function randomTempPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const USERID_RE = /^[a-z0-9._-]{4,20}$/;

@Injectable()
export class UsersService {
  // ✅ Admin must provide userId
  async createByAdmin(input: { email: string; name?: string; role: UserRole; userId: string }) {
    const email = input.email.trim().toLowerCase();
    const desiredUserId = (input.userId ?? '').trim().toLowerCase();

    // Validate required userId
    if (!desiredUserId) throw new BadRequestException('User ID is required');
    if (!USERID_RE.test(desiredUserId)) {
      throw new BadRequestException('Invalid User ID (4–20 chars, lowercase a–z, 0–9, dot, underscore, hyphen)');
    }

    // Check email uniqueness
    const emailExists = await prisma.user.findUnique({ where: { email } });
    if (emailExists) throw new BadRequestException('Email already exists');

    // Check userId uniqueness
    const uidExists = await prisma.user.findFirst({ where: { userId: desiredUserId } });
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
      },
      select: { id: true, email: true, name: true, role: true, mustChangePassword: true, userId: true },
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
