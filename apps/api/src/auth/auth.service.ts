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

type SessionContext = {
  sub: string;
  role: any;
  uid?: string | null;
  clientCode?: string | null;
  mcp?: boolean;
  authMode?: 'NORMAL' | 'COMMON';
  commonAccountId?: string | null;
  commonAccountUserId?: string | null;
  actingAsUserId?: string | null;
  actingAsName?: string | null;
};

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
    clientCode?: string | null;
    ip?: string | null;
    entityId?: string | null;
    details?: string;
    meta?: Record<string, any>;
  }) {
    await this.prisma.auditTrail.create({
      data: {
        action: p.action,
        entity: 'Auth',
        entityId: p.entityId ?? p.userId ?? null,
        details: p.details ?? '',
        changes: p.meta ?? {},
        userId: p.userId ?? null,
        role: (p.role as any) ?? null,
        clientCode: p.clientCode ?? null,
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

  private signRefreshToken(session: SessionContext) {
    const jti = randomBytes(16).toString('base64url');

    const token = this.jwt.sign(
      {
        sub: session.sub,
        typ: 'refresh',
        jti,

        role: session.role,
        uid: session.uid ?? null,
        clientCode: session.clientCode ?? null,
        mcp: session.mcp ? true : undefined,

        authMode: session.authMode ?? 'NORMAL',
        commonAccountId: session.commonAccountId ?? null,
        commonAccountUserId: session.commonAccountUserId ?? null,
        actingAsUserId: session.actingAsUserId ?? null,
        actingAsName: session.actingAsName ?? null,
      },
      {
        secret: process.env.REFRESH_TOKEN_SECRET!,
        expiresIn: REFRESH_TOKEN_TTL,
      },
    );

    return { token, jti };
  }

  private cookieOpts() {
    const isProd = (process.env.NODE_ENV ?? '').trim() === 'production';
    const secure = this.envBool('COOKIE_SECURE', isProd);
    const rawDomain = (process.env.COOKIE_DOMAIN ?? '').trim();
    const domain = rawDomain || undefined;

    return {
      httpOnly: true,
      secure,
      sameSite: secure ? ('none' as const) : ('lax' as const),
      ...(domain ? { domain } : {}),
      path: '/auth/refresh',
    };
  }
  private setRefreshCookie(res: any, token: string, expAt: Date) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOpts(),
      expires: expAt,
    });
  }

  private clearRefreshCookie(res: any) {
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOpts());
  }
  // private setRefreshCookie(res: any, token: string, expAt: Date) {
  //   const isProd = process.env.NODE_ENV === 'production';

  //   res.cookie('omega_rt', token, {
  //     httpOnly: true,
  //     secure: isProd,
  //     sameSite: isProd ? 'lax' : 'lax',
  //     ...(isProd ? { domain: '.omegabiochemlab.com' } : {}),
  //     path: '/auth/refresh',
  //     expires: expAt,
  //   });
  // }

  // private clearRefreshCookie(res: any) {
  //   const isProd = process.env.NODE_ENV === 'production';

  //   res.clearCookie('omega_rt', {
  //     httpOnly: true,
  //     secure: isProd,
  //     sameSite: isProd ? 'lax' : 'lax',
  //     ...(isProd ? { domain: '.omegabiochemlab.com' } : {}),
  //     path: '/auth/refresh',
  //   });
  // }

  private async issueRefreshForUser(session: SessionContext, res: any) {
    const { token, jti } = this.signRefreshToken(session);
    const decoded: any = this.jwt.decode(token);
    const expAt = new Date(decoded.exp * 1000);

    const hash = await bcrypt.hash(jti, 12);

    await this.prisma.user.update({
      where: { id: session.sub },
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

  private envBool(name: string, def = false) {
    const v = (process.env[name] ?? '').trim().toLowerCase();
    if (!v) return def;
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  private envList(name: string): string[] {
    return (process.env[name] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private get2FAMethod(): 'EMAIL' | 'SMS' {
    const m = (process.env.TWO_FACTOR_METHOD ?? 'EMAIL').toUpperCase();
    return m === 'SMS' ? 'SMS' : 'EMAIL';
  }

  private shouldRequire2FA(user: {
    role: any;
    twoFactorEnabled?: boolean | null;
  }) {
    // global kill switch
    const globalEnabled = this.envBool('TWO_FACTOR_ENABLED', true);
    if (!globalEnabled) return false;

    const role = String(user.role ?? '').toUpperCase();

    // role overrides (optional)
    const disabledRoles = this.envList('TWO_FACTOR_DISABLE_ROLES').map((x) =>
      x.toUpperCase(),
    );
    if (disabledRoles.includes(role)) return false;

    const forcedRoles = this.envList('TWO_FACTOR_FORCE_ROLES').map((x) =>
      x.toUpperCase(),
    );
    if (forcedRoles.includes(role)) return true;

    // default: per-user flag
    return !!user.twoFactorEnabled;
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
  //   const method: 'EMAIL' | 'SMS' = 'EMAIL'; // TEMP: A2P pending

  //   const code = this.generateOtp6();
  //   const codeHash = await bcrypt.hash(code, 12);
  //   const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  //   await this.prisma.user.update({
  //     where: { id: user.id },
  //     data: {
  //       twoFactorCodeHash: codeHash,
  //       twoFactorExpiresAt: expiresAt,
  //       twoFactorAttempts: 0,
  //     } as any,
  //   });

  //   await this.mail.sendTwoFactorOtpEmail({
  //     to: user.email,
  //     name: user.name ?? null,
  //     code,
  //     expiresAt,
  //   });

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
    const method = this.get2FAMethod(); // EMAIL | SMS

    // If SMS chosen, enforce phone existence
    if (method === 'SMS' && !user.phoneNumber) {
      throw new BadRequestException({
        code: 'PHONE_REQUIRED',
        message: 'Phone number is required for SMS 2FA. Contact admin.',
      });
    }

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

    if (method === 'EMAIL') {
      await this.mail.sendTwoFactorOtpEmail({
        to: user.email,
        name: user.name ?? null,
        code,
        expiresAt,
      });
    } else {
      await this.sms.sendOtp(user.phoneNumber!, code);
    }

    return { method, expiresAt };
  }

  private maskEmail(email: string | null | undefined) {
    if (!email) return '';
    const [name, domain] = email.split('@');
    if (!domain) return email;
    if (name.length <= 2) return `${name[0] ?? '*'}***@${domain}`;
    return `${name.slice(0, 2)}***@${domain}`;
  }

  private signAccessTokenForSession(args: {
    sub: string;
    role: any;
    uid?: string | null;
    clientCode?: string | null;
    mcp?: boolean;
    authMode?: 'NORMAL' | 'COMMON';
    commonAccountId?: string | null;
    commonAccountUserId?: string | null;
    actingAsUserId?: string | null;
    actingAsName?: string | null;
  }) {
    return this.jwt.sign(
      {
        sub: args.sub,
        role: args.role,
        uid: args.uid ?? null,
        clientCode: args.clientCode ?? null,
        mcp: args.mcp ? true : undefined,
        authMode: args.authMode ?? 'NORMAL',
        commonAccountId: args.commonAccountId ?? null,
        commonAccountUserId: args.commonAccountUserId ?? null,
        actingAsUserId: args.actingAsUserId ?? null,
        actingAsName: args.actingAsName ?? null,
      },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  private async startCommon2FA(args: {
    challengeId: string;
    email: string;
    name?: string | null;
  }) {
    const code = this.generateOtp6();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.commonAuthChallenge.update({
      where: { id: args.challengeId },
      data: {
        twoFactorCodeHash: codeHash,
        twoFactorExpiresAt: expiresAt,
        twoFactorAttempts: 0,
        stage: 'OTP_SENT',
      },
    });

    await this.mail.sendTwoFactorOtpEmail({
      to: args.email,
      name: args.name ?? null,
      code,
      expiresAt,
    });

    return { method: 'EMAIL' as const, expiresAt };
  }

  private async loginCommonAccount(
    userIdRaw: string,
    password: string,
    req?: any,
  ) {
    const userId = (userIdRaw ?? '').trim().toLowerCase();
    const ip = this.getIp(req);
    const ua = this.getUA(req);

    const common = await this.prisma.commonAccount.findUnique({
      where: { userId },
      include: {
        members: {
          where: { active: true },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                active: true,
              },
            },
          },
        },
      },
    });

    if (!common || !common.active) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: null,
        role: null,
        clientCode: null,
        ip,
        entityId: userId,
        details: 'Invalid common account credentials',
        meta: { userAgent: ua },
      });

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid user ID or password.',
      });
    }

    if (common.lockedUntil && common.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Account is temporarily locked.',
        lockedUntil: common.lockedUntil,
      });
    }

    const ok = await bcrypt.compare(password, common.passwordHash);
    if (!ok) {
      const now = new Date();
      const nextCount = (common.failedLoginCount ?? 0) + 1;
      const shouldLock = nextCount >= LOCK_AFTER_FAILED;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : null;

      await this.prisma.commonAccount.update({
        where: { id: common.id },
        data: {
          failedLoginCount: nextCount,
          lastFailedLoginAt: now,
          ...(shouldLock ? { lockedUntil } : {}),
        },
      });

      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: null,
        role: null,
        clientCode: null,
        ip,
        entityId: common.userId,
        details: shouldLock
          ? 'Bad password on common account; locked'
          : 'Bad password on common account',
        meta: { userAgent: ua, failedLoginCount: nextCount, lockedUntil },
      });

      throw new UnauthorizedException({
        code: shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
        message: shouldLock
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : 'Invalid password.',
        lockedUntil,
        remaining: Math.max(0, LOCK_AFTER_FAILED - nextCount),
      });
    }

    await this.prisma.commonAccount.update({
      where: { id: common.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      },
    });

    const challengeToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.commonAuthChallenge.create({
      data: {
        challengeToken,
        commonAccountId: common.id,
        stage: 'PASSWORD_VERIFIED',
        expiresAt,
        ipAddress: ip,
        userAgent: ua,
      },
    });

    const people = common.members
      .filter((m) => m.user?.active)
      .map((m) => ({
        id: m.user.id,
        name: m.user.name || m.user.email,
        emailMasked: this.maskEmail(m.user.email),
        roles: m.allowedRoles,
      }));

    return {
      requiresCommonSelection: true,
      challengeToken,
      commonAccount: {
        id: common.id,
        label: common.label,
      },
      people,
      expiresAt: expiresAt.toISOString(),
    };
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
        clientCode: true,
        inviteToken: true,
      },
    });

    await this.logAuthEvent({
      action: 'INVITE_ISSUED',
      userId: user.id,
      role: user.role as any,
      clientCode: user.clientCode ?? null,
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
      select: {
        id: true,
        email: true,
        userId: true,
        role: true,
        clientCode: true,
      },
    });

    await this.logAuthEvent({
      action: 'FIRST_CREDENTIALS_SET',
      userId: updated.id,
      role: updated.role as any,
      clientCode: updated.clientCode ?? null,
      entityId: updated.userId ?? updated.email,
      details: 'User set initial credentials',
    });

    return { ok: true, user: updated };
  }

  // ---------------------------
  // Regular login with userId
  // ---------------------------
  private async loginNormalUser(
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
    // if (!user || !user.active) {
    //   await this.logAuthEvent({
    //     action: 'LOGIN_FAILED',
    //     userId: null,
    //     role: null,
    //     clientCode: null,
    //     ip,
    //     entityId: userId,
    //     details: 'Invalid credentials (user missing or inactive)',
    //     meta: { userAgent: ua },
    //   });

    //   throw new UnauthorizedException({
    //     code: 'INVALID_CREDENTIALS',
    //     message: 'Invalid user ID or password.',
    //   });
    // }

    if (!user) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: null,
        role: null,
        clientCode: null,
        ip,
        entityId: userId,
        details: 'Invalid user ID',
        meta: { userAgent: ua },
      });

      throw new UnauthorizedException({
        code: 'INVALID_USERID',
        message: 'Invalid user ID.',
      });
    }

    if (!user.active) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: user.id,
        role: user.role as any,
        clientCode: user.clientCode ?? null,
        ip,
        entityId: user.userId ?? user.email,
        details: 'Inactive user login attempt',
        meta: { userAgent: ua },
      });

      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'User account is inactive.',
      });
    }

    if (!user.active) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: user.id,
        role: user.role as any,
        clientCode: user.clientCode ?? null,
        ip,
        entityId: user.userId ?? user.email,
        details: 'Inactive user login attempt',
        meta: { userAgent: ua },
      });

      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'User account is inactive.',
      });
    }

    // Locked?
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.logAuthEvent({
        action: 'LOGIN_FAILED',
        userId: user.id,
        role: user.role as any,
        clientCode: user.clientCode ?? null,
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
        clientCode: user.clientCode ?? null,
        ip,
        entityId: user.userId ?? user.email,
        details: shouldLock ? 'Bad password; account locked' : 'Bad password',
        meta: { userAgent: ua, failedLoginCount: nextCount, lockedUntil },
      });

      throw new UnauthorizedException({
        code: shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_PASSWORD',
        message: shouldLock
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : 'Invalid password.',
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
          clientCode: user.clientCode ?? null,
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
    // if (user.twoFactorEnabled) {
    //   const { method, expiresAt } = await this.start2FA(
    //     {
    //       id: user.id,
    //       email: user.email,
    //       role: user.role,
    //       phoneNumber: user.phoneNumber,
    //       name: user.name ?? null,
    //     },
    //     req,
    //   );

    //   return {
    //     requiresTwoFactor: true,
    //     method,
    //     expiresAt: expiresAt.toISOString(),
    //     userId: user.userId, // FE will store in sessionStorage and verify OTP
    //     mustChangePassword: user.mustChangePassword, // optional hint for FE
    //   };
    // }

    if (this.shouldRequire2FA(user)) {
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
        userId: user.userId,
        mustChangePassword: user.mustChangePassword,
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

      const accessToken = this.signAccessTokenForSession({
        sub: user.id,
        role: user.role,
        uid: user.userId ?? null,
        clientCode: user.clientCode ?? null,
        mcp: true,
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
    const accessToken = this.signAccessTokenForSession({
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
    });

    await this.logAuthEvent({
      action: 'LOGIN',
      userId: user.id,
      role: user.role as any,
      clientCode: user.clientCode ?? null,
      ip,
      entityId: user.userId ?? user.email,
      details: 'User login successful',
      meta: { userAgent: ua },
    });
    if (res) {
      await this.issueRefreshForUser(
        {
          sub: user.id,
          role: user.role,
          uid: user.userId ?? null,
          clientCode: user.clientCode ?? null,
          mcp: false,
          authMode: 'NORMAL',
        },
        res,
      );
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

  async loginWithUserId(
    userIdRaw: string,
    password: string,
    req?: any,
    res?: any,
  ) {
    const userId = (userIdRaw ?? '').trim().toLowerCase();

    const normalUser = await this.prisma.user.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (normalUser) {
      return this.loginNormalUser(userId, password, req, res);
    }

    const common = await this.prisma.commonAccount.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (common) {
      return this.loginCommonAccount(userId, password, req);
    }

    throw new UnauthorizedException({
      code: 'INVALID_USERID',
      message: 'Invalid user ID.',
    });
  }

  async resendTwoFactor(
    body: { userId?: string; pendingToken?: string },
    req?: any,
  ) {
    if (body.pendingToken) {
      return this.resendCommonTwoFactor(body.pendingToken, req);
    }
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
        clientCode: true,
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

    // 🔒 If 2FA disabled globally
    if (!this.shouldRequire2FA(user)) {
      throw new BadRequestException({
        code: '2FA_DISABLED',
        message: 'Two-factor authentication is currently disabled.',
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
      clientCode: user.clientCode ?? null,
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
    user: {
      id: string;
      role?: string | null;
      userId?: string | null;
      clientCode?: string | null;
    },
    jti?: string | null,
    res?: any,
  ) {
    const ip = this.getIp(req);
    const ua = this.getUA(req);

    await this.logAuthEvent({
      action: 'LOGOUT',
      userId: user.id,
      role: (user.role as any) ?? null,
      clientCode: user.clientCode ?? null,
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

      // clear lockout after successful password reset
      failedLoginCount: 0,
      lockedUntil: null,
      lastFailedLoginAt: null,
    } as any,
  });

    await this.logAuthEvent({
      action: 'PASSWORD_CHANGE',
      userId: user.id,
      role: (user.role as any) ?? null,
      clientCode: user.clientCode ?? null,
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

    const accessToken = this.signAccessTokenForSession({
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
      mcp: false,
      authMode: 'NORMAL',
    });

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
    body: { userId?: string; pendingToken?: string; code: string },
    req?: any,
    res?: any,
  ) {
    if (body.pendingToken) {
      return this.verifyCommonTwoFactor(
        { pendingToken: body.pendingToken, code: body.code },
        req,
        res,
      );
    }

    return this.verifyUserTwoFactor(
      { userId: body.userId ?? '', code: body.code },
      req,
      res,
    );
  }

  async verifyUserTwoFactor(
    body: { userId: string; pendingToken?: string; code: string },
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

    // 🔒 If 2FA is globally disabled, stop here
    if (!this.shouldRequire2FA(user)) {
      // Clean up any existing OTP state
      if (user.twoFactorCodeHash || user.twoFactorExpiresAt) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            twoFactorCodeHash: null,
            twoFactorExpiresAt: null,
            twoFactorAttempts: 0,
          } as any,
        });
      }

      throw new ForbiddenException({
        code: '2FA_DISABLED',
        message:
          'Two-factor verification is currently disabled. Please sign in again.',
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

      const accessToken = this.signAccessTokenForSession({
        sub: user.id,
        role: user.role,
        uid: user.userId ?? null,
        clientCode: user.clientCode ?? null,
        mcp: user.mustChangePassword,
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
    const accessToken = this.signAccessTokenForSession({
      sub: user.id,
      role: user.role,
      uid: user.userId ?? null,
      clientCode: user.clientCode ?? null,
      mcp: user.mustChangePassword,
      authMode: 'NORMAL',
    });

    await this.logAuthEvent({
      action: 'LOGIN',
      userId: user.id,
      role: user.role as any,
      clientCode: user.clientCode ?? null,
      ip: this.getIp(req),
      entityId: user.userId ?? user.email,
      details: 'User login successful (2FA)',
      meta: { userAgent: this.getUA(req) },
    });

    if (res) {
      await this.issueRefreshForUser(
        {
          sub: user.id,
          role: user.role,
          uid: user.userId ?? null,
          clientCode: user.clientCode ?? null,
          mcp: user.mustChangePassword,
          authMode: 'NORMAL',
        },
        res,
      );
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
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
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

    const session: SessionContext = {
      sub: user.id,
      role: payload.role ?? user.role,
      uid: payload.uid ?? user.userId ?? null,
      clientCode: payload.clientCode ?? user.clientCode ?? null,
      mcp: user.mustChangePassword ? true : false,

      authMode: payload.authMode === 'COMMON' ? 'COMMON' : 'NORMAL',
      commonAccountId: payload.commonAccountId ?? null,
      commonAccountUserId: payload.commonAccountUserId ?? null,
      actingAsUserId: payload.actingAsUserId ?? null,
      actingAsName: payload.actingAsName ?? null,
    };

    // rotate refresh using same session context
    await this.issueRefreshForUser(session, res);

    const accessToken = this.signAccessTokenForSession(session);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: session.role,
        name: user.name ?? undefined,
        mustChangePassword: user.mustChangePassword,
        clientCode: session.clientCode ?? null,
        authMode: session.authMode,
        commonAccountId: session.commonAccountId ?? null,
        commonAccountUserId: session.commonAccountUserId ?? null,
        actingAsUserId: session.actingAsUserId ?? null,
        actingAsName: session.actingAsName ?? undefined,
      },
    };
  }

  async selectCommonIdentity(
    body: { challengeToken: string; personId: string; role: string },
    req?: any,
  ) {
    const challengeToken = (body.challengeToken ?? '').trim();
    const personId = (body.personId ?? '').trim();
    const role = (body.role ?? '').trim() as any;

    if (!challengeToken || !personId || !role) {
      throw new BadRequestException({
        code: 'MISSING_FIELDS',
        message: 'Missing challengeToken, personId, or role.',
      });
    }

    const challenge = await this.prisma.commonAuthChallenge.findUnique({
      where: { challengeToken },
      include: {
        commonAccount: true,
      },
    });

    if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'COMMON_CHALLENGE_EXPIRED',
        message: 'Session expired. Please sign in again.',
      });
    }

    const member = await this.prisma.commonAccountMember.findFirst({
      where: {
        commonAccountId: challenge.commonAccountId,
        userId: personId,
        active: true,
        user: { active: true },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            clientCode: true,
            mustChangePassword: true,
            active: true,
          },
        },
      },
    });

    if (!member || !member.user?.active) {
      throw new ForbiddenException({
        code: 'INVALID_COMMON_SELECTION',
        message: 'Selected person is not allowed.',
      });
    }

    if (!member.allowedRoles.includes(role)) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Selected role is not allowed for this user.',
      });
    }

    await this.prisma.commonAuthChallenge.update({
      where: { id: challenge.id },
      data: {
        selectedUserId: member.user.id,
        selectedRole: role,
      },
    });

    const { method, expiresAt } = await this.startCommon2FA({
      challengeId: challenge.id,
      email: member.user.email,
      name: member.user.name ?? null,
    });

    await this.logAuthEvent({
      action: 'LOGIN',
      userId: member.user.id,
      role: role,
      clientCode: member.user.clientCode ?? null,
      ip: this.getIp(req),
      entityId: member.user.email,
      details: 'Common account selection completed; OTP sent',
      meta: {
        userAgent: this.getUA(req),
        authMode: 'COMMON',
        commonAccountId: challenge.commonAccountId,
        commonAccountUserId: challenge.commonAccount.userId,
        selectedRole: role,
        actingAsUserId: member.user.id,
        actingAsName: member.user.name ?? null,
      },
    });

    return {
      requiresTwoFactor: true,
      method,
      expiresAt: expiresAt.toISOString(),
      pendingToken: challenge.challengeToken,
      destinationHint: this.maskEmail(member.user.email),
    };
  }

  private async verifyCommonTwoFactor(
    body: { pendingToken: string; code: string },
    req?: any,
    res?: any,
  ) {
    const pendingToken = (body.pendingToken ?? '').trim();
    const code = (body.code ?? '').trim();

    if (!pendingToken || !code) {
      throw new BadRequestException({
        code: 'MISSING_FIELDS',
        message: 'Missing code.',
      });
    }

    const challenge = await this.prisma.commonAuthChallenge.findUnique({
      where: { challengeToken: pendingToken },
      include: {
        commonAccount: true,
      },
    });

    if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'COMMON_CHALLENGE_EXPIRED',
        message: 'Session expired. Please sign in again.',
      });
    }

    if (
      challenge.stage !== 'OTP_SENT' ||
      !challenge.selectedUserId ||
      !challenge.selectedRole
    ) {
      throw new UnauthorizedException({
        code: 'NO_2FA_CHALLENGE',
        message: 'No verification in progress. Please login again.',
      });
    }

    if (!challenge.twoFactorCodeHash || !challenge.twoFactorExpiresAt) {
      throw new UnauthorizedException({
        code: 'NO_2FA_CHALLENGE',
        message: 'No verification in progress. Please login again.',
      });
    }

    if (challenge.twoFactorExpiresAt < new Date()) {
      await this.prisma.commonAuthChallenge.update({
        where: { id: challenge.id },
        data: {
          twoFactorCodeHash: null,
          twoFactorExpiresAt: null,
          twoFactorAttempts: 0,
        },
      });

      throw new UnauthorizedException({
        code: 'OTP_EXPIRED',
        message: 'Code expired. Please login again.',
      });
    }

    if ((challenge.twoFactorAttempts ?? 0) >= 5) {
      throw new UnauthorizedException({
        code: 'OTP_LOCKED',
        message: 'Too many incorrect codes. Please login again.',
      });
    }

    const ok = await bcrypt.compare(code, challenge.twoFactorCodeHash);
    if (!ok) {
      await this.prisma.commonAuthChallenge.update({
        where: { id: challenge.id },
        data: { twoFactorAttempts: { increment: 1 } },
      });

      throw new UnauthorizedException({
        code: 'OTP_INVALID',
        message: 'Invalid code.',
      });
    }

    const selectedUser = await this.prisma.user.findUnique({
      where: { id: challenge.selectedUserId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        userId: true,
        clientCode: true,
        active: true,
        mustChangePassword: true,
      },
    });

    throwIfInvalidUser(selectedUser);

    await this.prisma.commonAuthChallenge.update({
      where: { id: challenge.id },
      data: {
        twoFactorCodeHash: null,
        twoFactorExpiresAt: null,
        twoFactorAttempts: 0,
        stage: 'VERIFIED',
        usedAt: new Date(),
      },
    });

    setRequestContext({ skipAudit: true });
    try {
      await this.prisma.user.update({
        where: { id: selectedUser.id },
        data: {
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
        },
      });
    } finally {
      setRequestContext({ skipAudit: false });
    }

    const accessToken = this.signAccessTokenForSession({
      sub: selectedUser.id,
      role: challenge.selectedRole,
      uid: selectedUser.userId ?? null,
      clientCode: selectedUser.clientCode ?? null,
      mcp: selectedUser.mustChangePassword,
      authMode: 'COMMON',
      commonAccountId: challenge.commonAccountId,
      commonAccountUserId: challenge.commonAccount.userId,
      actingAsUserId: selectedUser.id,
      actingAsName: selectedUser.name ?? null,
    });

    await this.logAuthEvent({
      action: 'LOGIN',
      userId: selectedUser.id,
      role: challenge.selectedRole as any,
      clientCode: selectedUser.clientCode ?? null,
      ip: this.getIp(req),
      entityId: selectedUser.userId ?? selectedUser.email,
      details: 'Common account login successful (2FA)',
      meta: {
        userAgent: this.getUA(req),
        authMode: 'COMMON',
        commonAccountId: challenge.commonAccountId,
        commonAccountUserId: challenge.commonAccount.userId,
        actingAsUserId: selectedUser.id,
        actingAsName: selectedUser.name ?? null,
        selectedRole: challenge.selectedRole,
      },
    });

    if (res) {
      await this.issueRefreshForUser(
        {
          sub: selectedUser.id,
          role: challenge.selectedRole,
          uid: selectedUser.userId ?? null,
          clientCode: selectedUser.clientCode ?? null,
          mcp: selectedUser.mustChangePassword,
          authMode: 'COMMON',
          commonAccountId: challenge.commonAccountId,
          commonAccountUserId: challenge.commonAccount.userId,
          actingAsUserId: selectedUser.id,
          actingAsName: selectedUser.name ?? null,
        },
        res,
      );
    }

    return {
      accessToken,
      user: {
        id: selectedUser.id,
        email: selectedUser.email,
        role: challenge.selectedRole,
        name: selectedUser.name ?? undefined,
        mustChangePassword: selectedUser.mustChangePassword,
        clientCode: selectedUser.clientCode ?? null,
        authMode: 'COMMON',
        commonAccountId: challenge.commonAccountId,
        commonAccountUserId: challenge.commonAccount.userId,
        actingAsUserId: selectedUser.id,
        actingAsName: selectedUser.name ?? undefined,
      },
    };
  }

  private async resendCommonTwoFactor(pendingToken: string, req?: any) {
    const challenge = await this.prisma.commonAuthChallenge.findUnique({
      where: { challengeToken: pendingToken },
    });

    if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'COMMON_CHALLENGE_EXPIRED',
        message: 'Session expired. Please sign in again.',
      });
    }

    if (!challenge.selectedUserId || !challenge.selectedRole) {
      throw new UnauthorizedException({
        code: 'NO_2FA_CHALLENGE',
        message: 'No verification in progress. Please sign in again.',
      });
    }

    if (challenge.twoFactorExpiresAt) {
      const issuedAtApprox =
        new Date(challenge.twoFactorExpiresAt).getTime() - 10 * 60 * 1000;
      if (Date.now() - issuedAtApprox < 30_000) {
        throw new BadRequestException({
          code: 'OTP_RESEND_THROTTLED',
          message: 'Please wait a few seconds before requesting a new code.',
        });
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: challenge.selectedUserId },
      select: { id: true, email: true, name: true, active: true },
    });

    throwIfInvalidUser(user);

    const { method, expiresAt } = await this.startCommon2FA({
      challengeId: challenge.id,
      email: user.email!,
      name: user.name ?? null,
    });

    return { ok: true, method, expiresAt: expiresAt.toISOString() };
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
