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
import { setRequestContext } from 'src/common/request-context';
import { MailService } from 'src/mail/mail.service';
import { SmsService } from 'src/mail/sms.service';

const USERID_RE = /^[a-z0-9._-]{4,20}$/;

// Policies
const ACCESS_TOKEN_TTL = '15m';
const LOCK_AFTER_FAILED = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const REFRESH_TOKEN_TTL = '14d';
const REFRESH_COOKIE_NAME = 'omega_rt';

type AuthAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'INVITE_ISSUED'
  | 'FIRST_CREDENTIALS_SET';

@Injectable()
export class AuthService {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private mail: MailService,
    private sms: SmsService,
  ) {}

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

  private generateTempPassword() {
    // 12 random base64url chars ~ 72 bits entropy
    return randomBytes(9).toString('base64url');
  }
  private passwordOk(pw: string) {
    return typeof pw === 'string' && pw.length >= 8;
  }

  private generateOtp6(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private signRefreshToken(userDbId: string) {
    const jti = randomBytes(16).toString('base64url');
    const token = this.jwt.sign(
      { sub: userDbId, typ: 'refresh', jti },
      {
        secret: process.env.REFRESH_TOKEN_SECRET!,
        expiresIn: REFRESH_TOKEN_TTL,
      },
    );
    return { token, jti };
  }

  private setRefreshCookie(res: any, token: string, expAt: Date) {
    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('omega_rt', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      // ✅ allow across omegabiochemlab subdomains
      ...(isProd ? { domain: '.omegabiochemlab.com' } : {}),
      path: '/auth/refresh',
      expires: expAt,
    });
  }

  private clearRefreshCookie(res: any) {
    const isProd = process.env.NODE_ENV === 'production';

    res.clearCookie('omega_rt', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      ...(isProd ? { domain: '.omegabiochemlab.com' } : {}),
      path: '/auth/refresh',
    });
  }

  private async issueRefreshForUser(userDbId: string, res: any) {
    const { token, jti } = this.signRefreshToken(userDbId);
    const decoded: any = this.jwt.decode(token);
    const expAt = new Date(decoded.exp * 1000);

    const hash = await bcrypt.hash(jti, 12);

    await this.prisma.user.update({
      where: { id: userDbId },
      data: {
        refreshTokenHash: hash,
        refreshTokenExpAt: expAt,
        refreshTokenRotatedAt: new Date(),
      } as any,
    });

    this.setRefreshCookie(res, token, expAt);
  }
  // private async start2FA(
  //   user: {
  //     id: string;
  //     email: string;
  //     role: any;
  //     phoneNumber?: string | null;
  //     name?: string | null;
  //   },
  //   req?: any,
  // ) {
  //   // const method = user.role === 'CLIENT' ? 'EMAIL' : 'SMS';

  //   // if (method === 'SMS' && !user.phoneNumber) {
  //   //   throw new BadRequestException({
  //   //     code: 'PHONE_REQUIRED',
  //   //     message:
  //   //       'Phone number is required for 2-factor authentication. Contact admin.',
  //   //   });
  //   // }

  //   const method: 'EMAIL' | 'SMS' = 'EMAIL'; // ✅ temporary until A2P is approved

  //   const code = this.generateOtp6();
  //   const codeHash = await bcrypt.hash(code, 12);
  //   const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  //   await this.prisma.user.update({
  //     where: { id: user.id },
  //     data: {
  //       twoFactorCodeHash: codeHash,
  //       twoFactorExpiresAt: expiresAt,
  //       twoFactorAttempts: 0,
  //     } as any,
  //   });

  //   if (method === 'EMAIL') {
  //     await this.mail.sendTwoFactorOtpEmail({
  //       to: user.email,
  //       name: user.name ?? null,
  //       code,
  //       expiresAt,
  //     });
  //   } else {
  //     await this.sms.sendOtp(user.phoneNumber!, code);
  //   }

  //   return { method, expiresAt };
  // }

  private async start2FA(
    user: {
      id: string;
      email: string;
      role: any;
      phoneNumber?: string | null;
      name?: string | null;
    },
    req?: any,
  ) {
    const method: 'EMAIL' | 'SMS' = 'EMAIL'; // TEMP: A2P pending

    const code = this.generateOtp6();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCodeHash: codeHash,
        twoFactorExpiresAt: expiresAt,
        twoFactorAttempts: 0,
      } as any,
    });

    await this.mail.sendTwoFactorOtpEmail({
      to: user.email,
      name: user.name ?? null,
      code,
      expiresAt,
    });

    return { method, expiresAt };
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

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        inviteToken,
        inviteTokenExpiresAt,
        tempPasswordExpiresAt,
        mustChangePassword: true,
        ...(role ? { role: role as any } : {}),
        active: true,
        passwordVersion: 1,

        // ✅ ensure lockout fields start clean
        failedLoginCount: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      } as any,
      select: {
        id: true,
        email: true,
        role: true,
        mustChangePassword: true,
        inviteToken: true,
      },
    });

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
      tempPassword,
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
      throw new BadRequestException(
        'Password does not meet policy (min 8 chars)',
      );
    }

    const user = await this.prisma.user.findFirst({ where: { inviteToken } });
    if (!user) throw new NotFoundException('Invalid invite token');

    if (!user.mustChangePassword) {
      throw new ForbiddenException('Invite already completed');
    }
    if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw new ForbiddenException('Invite token expired');
    }

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

        // ✅ clear lockout fields too
        failedLoginCount: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      } as any,
      select: { id: true, email: true, userId: true, role: true },
    });

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
  async loginWithUserId(
    userIdRaw: string,
    password: string,
    req?: any,
    res?: any,
  ) {
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
        tempPasswordExpiresAt: true,
        passwordHash: true,
        userId: true,
        clientCode: true,

        // lockout
        failedLoginCount: true,
        lockedUntil: true,
        lastFailedLoginAt: true,

        // 2FA
        phoneNumber: true,
        twoFactorEnabled: true,
      },
    });

    // Missing or inactive
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

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid user ID or password.',
      });
    }

    // Locked?
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: user.id,
        role: user.role as any,
        ip,
        entityId: user.userId ?? user.email,
        details: 'Account locked',
        meta: { lockedUntil: user.lockedUntil, userAgent: ua },
      });

      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Account is temporarily locked.',
        lockedUntil: user.lockedUntil,
      });
    }

    // Verify password
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const now = new Date();
      const nextCount = (user.failedLoginCount ?? 0) + 1;

      const shouldLock = nextCount >= LOCK_AFTER_FAILED;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: nextCount,
          lastFailedLoginAt: now,
          ...(shouldLock ? { lockedUntil } : {}),
        } as any,
      });

      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: user.id,
        role: user.role as any,
        ip,
        entityId: user.userId ?? user.email,
        details: shouldLock ? 'Bad password; account locked' : 'Bad password',
        meta: { userAgent: ua, failedLoginCount: nextCount, lockedUntil },
      });

      throw new UnauthorizedException({
        code: shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
        message: shouldLock
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : 'Invalid user ID or password.',
        lockedUntil,
        remaining: Math.max(0, LOCK_AFTER_FAILED - nextCount),
      });
    }

    // Temp password expired? (still check, even though OTP comes next)
    if (user.mustChangePassword) {
      if (
        user.tempPasswordExpiresAt &&
        user.tempPasswordExpiresAt < new Date()
      ) {
        await this.logAuthEvent({
          action: 'LOGIN_FAILED',
          userId: user.id,
          role: user.role as any,
          ip,
          entityId: user.userId ?? user.email,
          details: 'Temporary password expired',
          meta: { userAgent: ua },
        });

        throw new UnauthorizedException({
          code: 'TEMP_PASSWORD_EXPIRED',
          message: 'Temporary credentials expired. Contact admin.',
        });
      }
    }

    // ✅ Successful password => reset lockout counters
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      } as any,
    });

    // ✅ OTP FIRST (if enabled)
    if (user.twoFactorEnabled) {
      const { method, expiresAt } = await this.start2FA(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          phoneNumber: user.phoneNumber,
          name: user.name ?? null,
        },
        req,
      );

      return {
        requiresTwoFactor: true,
        method,
        expiresAt: expiresAt.toISOString(),
        userId: user.userId, // FE will store in sessionStorage and verify OTP
        mustChangePassword: user.mustChangePassword, // optional hint for FE
      };
    }

    // ✅ If OTP not enabled, and mustChangePassword => force reset now
    if (user.mustChangePassword) {
      const payload = {
        sub: user.id,
        role: user.role,
        uid: user.userId ?? null,
        mcp: true,
        clientCode: user.clientCode ?? null,
      };

      const accessToken = this.jwt.sign(payload, {
        expiresIn: ACCESS_TOKEN_TTL,
      });

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

    // ✅ No OTP and no reset => issue token + update activity
    setRequestContext({ skipAudit: true });
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastActivityAt: new Date() },
      });
    } finally {
      setRequestContext({ skipAudit: false });
    }

    const payload = {
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
    };
    const accessToken = this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });

    await this.logAuthEvent({
      action: 'LOGIN',
      userId: user.id,
      role: user.role as any,
      ip,
      entityId: user.userId ?? user.email,
      details: 'User login successful',
      meta: { userAgent: ua },
    });

    if (res) {
      await this.issueRefreshForUser(user.id, res);
    }

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name ?? undefined,
        mustChangePassword: false,
        clientCode: user.clientCode ?? null,
      },
    };
  }

  async resendTwoFactor(body: { userId: string }, req?: any) {
    const userId = (body.userId ?? '').trim().toLowerCase();
    if (!userId) {
      throw new BadRequestException({
        code: 'MISSING_FIELDS',
        message: 'Missing userId.',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { userId },
      select: {
        id: true,
        userId: true,
        email: true,
        role: true,
        name: true,
        active: true,
        twoFactorEnabled: true,

        // current challenge
        twoFactorExpiresAt: true,
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid session.',
      });
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException({
        code: '2FA_NOT_ENABLED',
        message: 'Two-factor is not enabled.',
      });
    }

    // OPTIONAL: throttle resend to avoid spam (recommended)
    // If the existing OTP is still valid for more than ~9 minutes, allow resend anyway,
    // but if they spam-click resend, you should block.
    // Here: block if last OTP was generated within last 30 seconds
    const now = Date.now();
    if (user.twoFactorExpiresAt) {
      const issuedAtApprox =
        new Date(user.twoFactorExpiresAt).getTime() - 10 * 60 * 1000; // since you set expiry = now+10m
      if (now - issuedAtApprox < 30_000) {
        throw new BadRequestException({
          code: 'OTP_RESEND_THROTTLED',
          message: 'Please wait a few seconds before requesting a new code.',
        });
      }
    }

    // Reuse your existing generator + mail sender
    const { method, expiresAt } = await this.start2FA(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        phoneNumber: null,
        name: user.name ?? null,
      },
      req,
    );

    // Audit (optional but nice)
    await this.logAuthEvent({
      action: 'LOGIN_FAILED', // or create a new action like 'OTP_RESENT'
      userId: user.id,
      role: user.role as any,
      ip: this.getIp(req),
      entityId: user.userId ?? user.email,
      details: '2FA OTP resent',
      meta: { method, userAgent: this.getUA(req) },
    });

    return { ok: true, method, expiresAt: expiresAt.toISOString() };
  }

  // ---------------------------
  // Logout (stateless JWT; audit the intent)
  // ---------------------------
  async logout(
    req: any,
    user: { id: string; role?: string | null; userId?: string | null },
    jti?: string | null,
    res?: any,
  ) {
    const ip = this.getIp(req);
    const ua = this.getUA(req);

    await this.logAuthEvent({
      action: 'LOGOUT',
      userId: user.id,
      role: (user.role as any) ?? null,
      ip,
      entityId: user.userId ?? user.id,
      details: 'User logged out',
      meta: { userAgent: ua, jti: jti ?? null },
    });

    if (res) this.clearRefreshCookie(res);

    await this.prisma.user
      .update({
        where: { id: user.id },
        data: { refreshTokenHash: null, refreshTokenExpAt: null } as any,
      })
      .catch(() => {});

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
    const user = await this.prisma.user.findUnique({
      where: { id: userDbId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        userId: true,
        clientCode: true,
        active: true,
        passwordHash: true,
      },
    });

    throwIfInvalidUser(user);

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    if (!this.passwordOk(newPassword)) {
      throw new BadRequestException(
        'New password does not meet policy (min 8 chars)',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // ✅ update password + clear mustChangePassword
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
      userId: user.id,
      role: (user.role as any) ?? null,
      ip: this.getIp(req),
      entityId: user.userId ?? user.email ?? user.id,
      details: 'Password changed',
      meta: { userAgent: this.getUA(req) },
    });

    // ✅ now they are fully authenticated (OTP already done), issue normal token
    setRequestContext({ skipAudit: true });
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastActivityAt: new Date() },
      });
    } finally {
      setRequestContext({ skipAudit: false });
    }

    const payload = {
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
    };

    const accessToken = this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name ?? undefined,
        mustChangePassword: false,
        clientCode: user.clientCode ?? null,
      },
    };
  }
  async verifyTwoFactor(
    body: { userId: string; code: string },
    req?: any,
    res?: any,
  ) {
    const userId = (body.userId ?? '').trim().toLowerCase();
    const code = (body.code ?? '').trim();

    if (!userId || !code) {
      throw new BadRequestException({
        code: 'MISSING_FIELDS',
        message: 'Missing code.',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        active: true,
        mustChangePassword: true,
        userId: true,
        clientCode: true,

        twoFactorCodeHash: true,
        twoFactorExpiresAt: true,
        twoFactorAttempts: true,
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials.',
      });
    }

    if (!user.twoFactorCodeHash || !user.twoFactorExpiresAt) {
      throw new UnauthorizedException({
        code: 'NO_2FA_CHALLENGE',
        message: 'No verification in progress. Please login again.',
      });
    }

    if (user.twoFactorExpiresAt < new Date()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorCodeHash: null,
          twoFactorExpiresAt: null,
          twoFactorAttempts: 0,
        } as any,
      });

      throw new UnauthorizedException({
        code: 'OTP_EXPIRED',
        message: 'Code expired. Please login again.',
      });
    }

    if ((user.twoFactorAttempts ?? 0) >= 5) {
      throw new UnauthorizedException({
        code: 'OTP_LOCKED',
        message: 'Too many incorrect codes. Please login again.',
      });
    }

    const ok = await bcrypt.compare(code, user.twoFactorCodeHash);
    if (!ok) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorAttempts: { increment: 1 } } as any,
      });

      throw new UnauthorizedException({
        code: 'OTP_INVALID',
        message: 'Invalid code.',
      });
    }

    // ✅ clear OTP state + update activity
    setRequestContext({ skipAudit: true });
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorCodeHash: null,
          twoFactorExpiresAt: null,
          twoFactorAttempts: 0,
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
        } as any,
      });
    } finally {
      setRequestContext({ skipAudit: false });
    }

    if (user.mustChangePassword) {
      const payload = {
        sub: user.id,
        role: user.role,
        uid: user.userId ?? null,
        mcp: true,
        clientCode: user.clientCode ?? null,
      };

      const accessToken = this.jwt.sign(payload, {
        expiresIn: ACCESS_TOKEN_TTL,
      });

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

    const payload = {
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
    };
    const accessToken = this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });

    await this.logAuthEvent({
      action: 'LOGIN',
      userId: user.id,
      role: user.role as any,
      ip: this.getIp(req),
      entityId: user.userId ?? user.email,
      details: 'User login successful (2FA)',
      meta: { userAgent: this.getUA(req) },
    });

    if (res) {
      await this.issueRefreshForUser(user.id, res);
    }

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

  async refresh(req: any, res: any) {
    const token = req.cookies?.omega_rt as string | undefined;
    if (!token) throw new UnauthorizedException({ code: 'NO_REFRESH' });

    let payload: any;
    try {
      payload = this.jwt.verify(token, {
        secret: process.env.REFRESH_TOKEN_SECRET!,
      });
    } catch {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({ code: 'REFRESH_INVALID' });
    }

    if (payload?.typ !== 'refresh' || !payload?.sub || !payload?.jti) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({ code: 'REFRESH_INVALID' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        userId: true,
        clientCode: true,
        active: true,
        refreshTokenHash: true,
        refreshTokenExpAt: true,
        mustChangePassword: true,
      },
    });

    if (
      !user ||
      !user.active ||
      !user.refreshTokenHash ||
      !user.refreshTokenExpAt
    ) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({ code: 'REFRESH_DENIED' });
    }

    if (user.refreshTokenExpAt < new Date()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null, refreshTokenExpAt: null } as any,
      });
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({ code: 'REFRESH_EXPIRED' });
    }

    const ok = await bcrypt.compare(payload.jti, user.refreshTokenHash);
    if (!ok) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({ code: 'REFRESH_REUSED' });
    }

    // ✅ rotate refresh
    await this.issueRefreshForUser(user.id, res);

    const accessPayload = {
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
      mcp: user.mustChangePassword ? true : undefined,
    };

    const accessToken = this.jwt.sign(accessPayload, {
      expiresIn: ACCESS_TOKEN_TTL,
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
}
function throwIfInvalidUser(
  user: {
    id: string;
    active: boolean;
  } | null,
): asserts user is {
  id: string;
  active: true;
} {
  if (!user || !user.active) {
    throw new UnauthorizedException('Invalid credentials');
  }
}
