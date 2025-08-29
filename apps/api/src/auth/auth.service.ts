import {
  Injectable, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const USERID_RE = /^[a-z0-9._-]{4,20}$/;

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) { }

  // ---------------------------
  // Admin invite flow
  // ---------------------------
  async adminInvite(emailRaw: string, role?: string) {
    const email = emailRaw.trim().toLowerCase();
    if (!email.includes('@')) throw new BadRequestException('Invalid email');

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const inviteToken = randomBytes(24).toString('base64url');
    const inviteTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 3 days
    const tempPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);    // 24 hours

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        inviteToken,
        inviteTokenExpiresAt,
        tempPasswordExpiresAt,
        mustChangePassword: true,
        ...(role ? { role: role as any } : {}),
        active: true,
      },
      create: {
        email,
        passwordHash,
        inviteToken,
        inviteTokenExpiresAt,
        tempPasswordExpiresAt,
        mustChangePassword: true,
        ...(role ? { role: role as any } : {}),
        active: true,
        passwordVersion: 1, // Add this line to satisfy UserCreateInput
      },
      select: { id: true, email: true, role: true, mustChangePassword: true, inviteToken: true },
    });

    // TODO: send email to user with either:
    //  1) temp password + link to /first-login (user will enter token we show in link)
    //  2) or just invite link containing inviteToken (strongly recommended)
    // e.g. https://app.example.com/auth/first-login?token=INVITE_TOKEN

    // Return whichever you prefer to display in Admin UI:
    return {
      ok: true,
      email: user.email,
      tempPassword, // remove if you only use invite links
      inviteLinkToken: user.inviteToken,
    };
  }

  // ---------------------------
  // First login: set userId + new password using inviteToken
  // ---------------------------
  async firstSetCredentials(body: { inviteToken: string; userId: string; newPassword: string }) {
    const { inviteToken } = body;
    const desiredUserId = body.userId.trim().toLowerCase();
    const newPassword = body.newPassword;

    if (!inviteToken) throw new BadRequestException('Missing invite token');
    if (!USERID_RE.test(desiredUserId)) {
      throw new BadRequestException('Invalid userId format (4–20 chars, a–z 0–9 . _ -)');
    }
    if (!this.passwordOk(newPassword)) {
      throw new BadRequestException('Password does not meet policy (min 8 chars)');
    }

    const user = await prisma.user.findFirst({ where: { inviteToken } });
    if (!user) throw new NotFoundException('Invalid invite token');

    if (!user.mustChangePassword) {
      throw new ForbiddenException('Invite already completed');
    }
    if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw new ForbiddenException('Invite token expired');
    }

    // enforce case-insensitive uniqueness (we also have a DB functional index)
    const existingUid = await prisma.user.findFirst({ where: { userId: desiredUserId } });
    if (existingUid) throw new BadRequestException('userId already taken');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        userId: desiredUserId,
        userIdSetAt: new Date(),
        passwordHash,
        passwordUpdatedAt: new Date(),
        passwordVersion: { increment: 1 },
        mustChangePassword: false,

        // 👇 use set:undefined for fields typed as string | undefined
        inviteToken: undefined,
        inviteTokenExpiresAt: undefined,
        tempPasswordExpiresAt: undefined,

        active: true,
      },
      select: { id: true, email: true, userId: true, role: true },
    });

    return { ok: true, user: updated };
  }

  // ---------------------------
  // Regular login with userId
  // ---------------------------
  async loginWithUserId(userIdRaw: string, password: string) {
  // Normalize input
  const userId = (userIdRaw ?? '').trim().toLowerCase();

  // 🔎 Dev-only diagnostics (remove later)
  // Mask password in logs; also print which DB this process is using
  console.log('[AUTH] loginWithUserId ->', { userId });
  console.log(
    '[AUTH] DATABASE_URL =',
    (process.env.DATABASE_URL || '').replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@')
  );

  // Fetch the minimum needed fields
  const user = await prisma.user.findFirst({
    where: { userId },
    select: {
      id: true, email: true, role: true, name: true,
      active: true, mustChangePassword: true, passwordHash: true, userId: true,
    },
  });

  console.log('[AUTH] prisma.findFirst(userId) ->', user);

  // Handle "no such user" OR inactive
  if (!user || !user.active) {
    // Keep external message generic, but log detail for us
    console.warn('[AUTH] login failed: user missing or inactive');
    throw new UnauthorizedException('Invalid credentials');
  }

  // Verify password
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    console.warn('[AUTH] login failed: bad password for', user.email);
    throw new UnauthorizedException('Invalid credentials');
  }

  // First-login flow
 // auth.service.ts
if (user.mustChangePassword) {
  const payload = { sub: user.id, role: user.role, uid: user.userId ?? null, mcp: true }; // mcp = must change password
  const accessToken = this.jwt.sign(payload, { expiresIn: '15m' }); // short-lived
  return {
    requiresPasswordReset: true,
    accessToken,                                   // 👈 give client a token to call /auth/change-password
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name ?? undefined,
      mustChangePassword: true,
    },
  };
}


  // Issue JWT
  const payload = { sub: user.id, role: user.role, uid: user.userId ?? null };
  const accessToken = this.jwt.sign(payload);

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name ?? undefined,
      mustChangePassword: user.mustChangePassword,
    },
  };
}


  // ---------------------------
  // Change own password (post-auth)
  // ---------------------------
  async changeOwnPassword(userDbId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userDbId } });
    throwIfInvalidUser(user);

    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    if (!this.passwordOk(newPassword)) {
      throw new BadRequestException('New password does not meet policy (min 8 chars)');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userDbId },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        passwordVersion: { increment: 1 },
        mustChangePassword: false,
      },
    });

    return { ok: true };
  }

  // ---------------------------
  // Helpers
  // ---------------------------
  private generateTempPassword() {
    // 12 random base64url chars ~ 72 bits
    return randomBytes(9).toString('base64url');
  }
  private passwordOk(pw: string) {
    return typeof pw === 'string' && pw.length >= 8; // expand if needed
  }
}

function throwIfInvalidUser(user: any): asserts user is any {
  if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');
}



// // import { Injectable } from '@nestjs/common';

// // @Injectable()
// // export class AuthService {}

// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { PrismaClient } from '@prisma/client';
// import * as bcrypt from 'bcrypt';
// import { JwtService } from '@nestjs/jwt';

// const prisma = new PrismaClient();

// @Injectable()
// export class AuthService {
//   constructor(private jwt: JwtService) {}

//   async validate(email: string, password: string) {
//     const user = await prisma.user.findUnique({ where: { email } });
//     if (!user || !user.active)
//       throw new UnauthorizedException('Invalid credentials');
//     const ok = await bcrypt.compare(password, user.passwordHash);
//     if (!ok) throw new UnauthorizedException('Invalid credentials');
//     return user;
//   }

//   async login(email: string, password: string) {
//     const user = await this.validate(email, password);
//     const payload = { sub: user.id, role:user.role, email: user.email };
//     return {
//       accessToken: this.jwt.sign(payload),
//       user: {
//         id: user.id,
//         email: user.email,
//         role: user.role,
//         name: user.name,
//         mustChangePassword: user.mustChangePassword,
//       },
//     };
//   }
// }
