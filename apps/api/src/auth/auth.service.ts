import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';

const USERID_RE = /^[a-z0-9._-]{4,20}$/;

type AuthAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'INVITE_ISSUED'
  | 'FIRST_CREDENTIALS_SET';

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  // ---------------------------
  // Utilities
  // ---------------------------
  private getIp(req?: any): string | null {
    if (!req) return null;
    const xf = req.headers?.['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length) {
      return xf.split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? req.ip ?? null;
  }
  private getUA(req?: any): string | null {
    return (req?.headers?.['user-agent'] as string) ?? null;
  }
  private async logAuthEvent(p: {
    action: AuthAction;
    userId?: string | null;
    role?: string | null;
    ip?: string | null;
    entityId?: string | null; // usually userId or attempted identifier
    details?: string;
    meta?: Record<string, any>;
  }) {
    await this.prisma.auditTrail.create({
      data: {
        action: p.action,
        entity: 'Auth',
        entityId: p.entityId ?? p.userId ?? null,
        details: p.details ?? '',
        changes: p.meta ?? {}, // stored as JSON
        userId: p.userId ?? null,
        role: (p.role as any) ?? null,
        ipAddress: p.ip ?? null,
      },
    });
  }


  //  // ⬇️ ADD THIS
  // async getMe(dbId: string) {
  //   const u = await this.prisma.user.findUnique({
  //     where: { id: dbId },
  //     select: {
  //       id: true,
  //       email: true,
  //       role: true,
  //       name: true,
  //       mustChangePassword: true,
  //       clientCode: true,
  //     },
  //   });
  //   if (!u) {
  //     // user no longer exists or was deactivated/removed
  //     // you can throw Unauthorized here; 400 also fine.
  //     throw new UnauthorizedException('Invalid session');
  //   }
  //   return u;
  // }

  private generateTempPassword() {
    // 12 random base64url chars ~ 72 bits entropy
    return randomBytes(9).toString('base64url');
  }
  private passwordOk(pw: string) {
    return typeof pw === 'string' && pw.length >= 8; // expand if needed
  }

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
    const tempPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

    const user = await this.prisma.user.upsert({
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
        passwordVersion: 1,
      },
      select: {
        id: true,
        email: true,
        role: true,
        mustChangePassword: true,
        inviteToken: true,
      },
    });

    // (Optional) audit the invite issuance
    await this.logAuthEvent({
      action: 'INVITE_ISSUED',
      userId: user.id,
      role: user.role as any,
      entityId: user.email,
      details: 'Admin invite issued',
    });

    return {
      ok: true,
      email: user.email,
      tempPassword, // remove if only invite links are used
      inviteLinkToken: user.inviteToken,
    };
  }

  // ---------------------------
  // First login: set userId + new password using inviteToken
  // ---------------------------
  async firstSetCredentials(body: {
    inviteToken: string;
    userId: string;
    newPassword: string;
  }) {
    const { inviteToken } = body;
    const desiredUserId = body.userId.trim().toLowerCase();
    const newPassword = body.newPassword;

    if (!inviteToken) throw new BadRequestException('Missing invite token');
    if (!USERID_RE.test(desiredUserId)) {
      throw new BadRequestException(
        'Invalid userId format (4–20 chars, a–z 0–9 . _ -)',
      );
    }
    if (!this.passwordOk(newPassword)) {
      throw new BadRequestException('Password does not meet policy (min 8 chars)');
    }

    const user = await this.prisma.user.findFirst({ where: { inviteToken } });
    if (!user) throw new NotFoundException('Invalid invite token');

    if (!user.mustChangePassword) {
      throw new ForbiddenException('Invite already completed');
    }
    if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw new ForbiddenException('Invite token expired');
    }

    // enforce case-insensitive uniqueness
    const existingUid = await this.prisma.user.findFirst({
      where: { userId: desiredUserId },
    });
    if (existingUid) throw new BadRequestException('userId already taken');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        userId: desiredUserId,
        userIdSetAt: new Date(),
        passwordHash,
        passwordUpdatedAt: new Date(),
        passwordVersion: { increment: 1 },
        mustChangePassword: false,
        inviteToken: undefined,
        inviteTokenExpiresAt: undefined,
        tempPasswordExpiresAt: undefined,
        active: true,
      },
      select: { id: true, email: true, userId: true, role: true },
    });

    // (Optional) audit
    await this.logAuthEvent({
      action: 'FIRST_CREDENTIALS_SET',
      userId: updated.id,
      role: updated.role as any,
      entityId: updated.userId ?? updated.email,
      details: 'User set initial credentials',
    });

    return { ok: true, user: updated };
  }

  // ---------------------------
  // Regular login with userId
  // ---------------------------
  async loginWithUserId(userIdRaw: string, password: string, req?: any) {
    const userId = (userIdRaw ?? '').trim().toLowerCase();
    const ip = this.getIp(req);
    const ua = this.getUA(req);

    const user = await this.prisma.user.findFirst({
      where: { userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        active: true,
        mustChangePassword: true,
        passwordHash: true,
        userId: true,
        clientCode: true,
      },
    });

    // Handle "no such user" OR inactive
    if (!user || !user.active) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: null,
        role: null,
        ip,
        entityId: userId,
        details: 'Invalid credentials (user missing or inactive)',
        meta: { userAgent: ua },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: user.id,
        role: user.role as any,
        ip,
        entityId: user.userId ?? user.email,
        details: 'Invalid credentials (bad password)',
        meta: { userAgent: ua },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // First-login flow (force change)
    if (user.mustChangePassword) {
      const payload = {
        sub: user.id,
        role: user.role,
        uid: user.userId ?? null,
        mcp: true, // must change password
        clientCode: user.clientCode ?? null,
      };
      const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });

      // You may also log a "LOGIN" here, but many teams wait until full login
      return {
        requiresPasswordReset: true,
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name ?? undefined,
          mustChangePassword: true,
          clientCode: user.clientCode ?? null,
        },
      };
    }

    // Issue JWT
    const payload = {
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
    };
    const accessToken = this.jwt.sign(payload);

    await this.logAuthEvent({
      action: 'LOGIN',
      userId: user.id,
      role: user.role as any,
      ip,
      entityId: user.userId ?? user.email,
      details: 'User login successful',
      meta: { userAgent: ua },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name ?? undefined,
        mustChangePassword: user.mustChangePassword,
        clientCode: user.clientCode ?? null,
      },
    };
  }

  // ---------------------------
  // Logout (stateless JWT; audit the intent)
  // ---------------------------
  async logout(
    req: any,
    user: { id: string; role?: string | null; userId?: string | null },
    jti?: string | null,
  ) {
    const ip = this.getIp(req);
    const ua = this.getUA(req);

    // If you maintain a allowlist/denylist for JWTs, revoke here (not shown)

    await this.logAuthEvent({
      action: 'LOGOUT',
      userId: user.id,
      role: (user.role as any) ?? null,
      ip,
      entityId: user.userId ?? user.id,
      details: 'User logged out',
      meta: { userAgent: ua, jti: jti ?? null },
    });

    return { ok: true };
  }

  // ---------------------------
  // Change own password (post-auth)
  // ---------------------------
  async changeOwnPassword(
    userDbId: string,
    currentPassword: string,
    newPassword: string,
    req?: any,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userDbId } });
    throwIfInvalidUser(user);

    const ok = await bcrypt.compare(currentPassword, user?.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    if (!this.passwordOk(newPassword)) {
      throw new BadRequestException('New password does not meet policy (min 8 chars)');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userDbId },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        passwordVersion: { increment: 1 },
        mustChangePassword: false,
      },
    });

    await this.logAuthEvent({
      action: 'PASSWORD_CHANGE',
      userId: user?.id,
      role: (user?.role as any) ?? null,
      ip: this.getIp(req),
      entityId: user?.userId ?? user?.email ?? user?.id,
      details: 'Password changed',
      meta: { userAgent: this.getUA(req) },
    });

    return { ok: true };
  }
}

function throwIfInvalidUser(user: any): asserts user is any {
  if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');
}



// import {
//   Injectable, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException
// } from '@nestjs/common';
// import { PrismaClient } from '@prisma/client';
// import * as bcrypt from 'bcrypt';
// import { JwtService } from '@nestjs/jwt';
// import { randomBytes } from 'crypto';

// const prisma = new PrismaClient();
// const USERID_RE = /^[a-z0-9._-]{4,20}$/;

// @Injectable()
// export class AuthService {
//   constructor(private jwt: JwtService) { }

//   // ---------------------------
//   // Admin invite flow
//   // ---------------------------
//   async adminInvite(emailRaw: string, role?: string) {
//     const email = emailRaw.trim().toLowerCase();
//     if (!email.includes('@')) throw new BadRequestException('Invalid email');

//     const tempPassword = this.generateTempPassword();
//     const passwordHash = await bcrypt.hash(tempPassword, 12);

//     const inviteToken = randomBytes(24).toString('base64url');
//     const inviteTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 3 days
//     const tempPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);    // 24 hours

//     const user = await prisma.user.upsert({
//       where: { email },
//       update: {
//         passwordHash,
//         inviteToken,
//         inviteTokenExpiresAt,
//         tempPasswordExpiresAt,
//         mustChangePassword: true,
//         ...(role ? { role: role as any } : {}),
//         active: true,
//       },
//       create: {
//         email,
//         passwordHash,
//         inviteToken,
//         inviteTokenExpiresAt,
//         tempPasswordExpiresAt,
//         mustChangePassword: true,
//         ...(role ? { role: role as any } : {}),
//         active: true,
//         passwordVersion: 1, // Add this line to satisfy UserCreateInput
//       },
//       select: { id: true, email: true, role: true, mustChangePassword: true, inviteToken: true },
//     });

//     // TODO: send email to user with either:
//     //  1) temp password + link to /first-login (user will enter token we show in link)
//     //  2) or just invite link containing inviteToken (strongly recommended)
//     // e.g. https://app.example.com/auth/first-login?token=INVITE_TOKEN

//     // Return whichever you prefer to display in Admin UI:
//     return {
//       ok: true,
//       email: user.email,
//       tempPassword, // remove if you only use invite links
//       inviteLinkToken: user.inviteToken,
//     };
//   }

//   // ---------------------------
//   // First login: set userId + new password using inviteToken
//   // ---------------------------
//   async firstSetCredentials(body: { inviteToken: string; userId: string; newPassword: string }) {
//     const { inviteToken } = body;
//     const desiredUserId = body.userId.trim().toLowerCase();
//     const newPassword = body.newPassword;

//     if (!inviteToken) throw new BadRequestException('Missing invite token');
//     if (!USERID_RE.test(desiredUserId)) {
//       throw new BadRequestException('Invalid userId format (4–20 chars, a–z 0–9 . _ -)');
//     }
//     if (!this.passwordOk(newPassword)) {
//       throw new BadRequestException('Password does not meet policy (min 8 chars)');
//     }

//     const user = await prisma.user.findFirst({ where: { inviteToken } });
//     if (!user) throw new NotFoundException('Invalid invite token');

//     if (!user.mustChangePassword) {
//       throw new ForbiddenException('Invite already completed');
//     }
//     if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
//       throw new ForbiddenException('Invite token expired');
//     }

//     // enforce case-insensitive uniqueness (we also have a DB functional index)
//     const existingUid = await prisma.user.findFirst({ where: { userId: desiredUserId } });
//     if (existingUid) throw new BadRequestException('userId already taken');

//     const passwordHash = await bcrypt.hash(newPassword, 12);

//     const updated = await prisma.user.update({
//       where: { id: user.id },
//       data: {
//         userId: desiredUserId,
//         userIdSetAt: new Date(),
//         passwordHash,
//         passwordUpdatedAt: new Date(),
//         passwordVersion: { increment: 1 },
//         mustChangePassword: false,

//         // 👇 use set:undefined for fields typed as string | undefined
//         inviteToken: undefined,
//         inviteTokenExpiresAt: undefined,
//         tempPasswordExpiresAt: undefined,

//         active: true,
//       },
//       select: { id: true, email: true, userId: true, role: true },
//     });

//     return { ok: true, user: updated };
//   }

//   // ---------------------------
//   // Regular login with userId
//   // ---------------------------
//   async loginWithUserId(userIdRaw: string, password: string) {
//   // Normalize input
//   const userId = (userIdRaw ?? '').trim().toLowerCase();

//   // 🔎 Dev-only diagnostics (remove later)
//   // Mask password in logs; also print which DB this process is using
//   console.log('[AUTH] loginWithUserId ->', { userId });
//   console.log(
//     '[AUTH] DATABASE_URL =',
//     (process.env.DATABASE_URL || '').replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@')
//   );

//   // Fetch the minimum needed fields
//   const user = await prisma.user.findFirst({
//     where: { userId },
//     select: {
//       id: true, email: true, role: true, name: true,
//       active: true, mustChangePassword: true, passwordHash: true, userId: true,clientCode:true
//     },
//   });

//   console.log('[AUTH] prisma.findFirst(userId) ->', user);

//   // Handle "no such user" OR inactive
//   if (!user || !user.active) {
//     // Keep external message generic, but log detail for us
//     console.warn('[AUTH] login failed: user missing or inactive');
//     throw new UnauthorizedException('Invalid credentials');
//   }

//   // Verify password
//   const ok = await bcrypt.compare(password, user.passwordHash);
//   if (!ok) {
//     console.warn('[AUTH] login failed: bad password for', user.email);
//     throw new UnauthorizedException('Invalid credentials');
//   }

//   // First-login flow
// if (user.mustChangePassword) {
//   const payload = { sub: user.id, role: user.role, uid: user.userId ?? null, mcp: true ,clientCode: user.clientCode ?? null,}; // mcp = must change password
//   const accessToken = this.jwt.sign(payload, { expiresIn: '15m' }); // short-lived
//   return {
//     requiresPasswordReset: true,
//     accessToken,                                   // 👈 give client a token to call /auth/change-password
//     user: {
//       id: user.id,
//       email: user.email,
//       role: user.role,
//       name: user.name ?? undefined,
//       mustChangePassword: true,
//       clientCode: user.clientCode ?? null,
//     },
//   };
// }


//   // Issue JWT
//   const payload = { sub: user.id, role: user.role, uid: user.userId ?? null,clientCode: user.clientCode ?? null, };
//   const accessToken = this.jwt.sign(payload);

//   return {
//     accessToken,
//     user: {
//       id: user.id,
//       email: user.email,
//       role: user.role,
//       name: user.name ?? undefined,
//       mustChangePassword: user.mustChangePassword,
//       clientCode: user.clientCode ?? null,
//     },
//   };
// }


//   // ---------------------------
//   // Change own password (post-auth)
//   // ---------------------------
//   async changeOwnPassword(userDbId: string, currentPassword: string, newPassword: string) {
//     const user = await prisma.user.findUnique({ where: { id: userDbId } });
//     throwIfInvalidUser(user);

//     if (!user) throw new UnauthorizedException('Invalid credentials');
//     const ok = await bcrypt.compare(currentPassword, user.passwordHash);
//     if (!ok) throw new BadRequestException('Current password is incorrect');

//     if (!this.passwordOk(newPassword)) {
//       throw new BadRequestException('New password does not meet policy (min 8 chars)');
//     }

//     const passwordHash = await bcrypt.hash(newPassword, 12);
//     await prisma.user.update({
//       where: { id: userDbId },
//       data: {
//         passwordHash,
//         passwordUpdatedAt: new Date(),
//         passwordVersion: { increment: 1 },
//         mustChangePassword: false,
//       },
//     });

//     return { ok: true };
//   }

//   // ---------------------------
//   // Helpers
//   // ---------------------------
//   private generateTempPassword() {
//     // 12 random base64url chars ~ 72 bits
//     return randomBytes(9).toString('base64url');
//   }
//   private passwordOk(pw: string) {
//     return typeof pw === 'string' && pw.length >= 8; // expand if needed
//   }
// }

// function throwIfInvalidUser(user: any): asserts user is any {
//   if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');
// }



