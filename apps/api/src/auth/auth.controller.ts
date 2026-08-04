// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
  BadRequestException,
  Get,
  UnauthorizedException,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Public } from 'src/common/public.decorator';
import { PrismaService } from 'prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';

type LogoutReason = 'MANUAL' | 'IDLE_TIMEOUT';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  login(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { userId: string; password: string },
  ) {
    return this.auth.loginWithUserId(body.userId, body.password, req, res);
  }

  @UseGuards(JwtAuthGuard, IdleTimeoutGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    const dbId = req.user?.sub as string;

    if (!dbId) {
      throw new BadRequestException('Unauthenticated');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: dbId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        userId: true,
        clientCode: true,
        mustChangePassword: true,
        active: true,
      },
    });

    if (!dbUser || !dbUser.active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      role: req.user?.role ?? dbUser.role,
      actualRole: dbUser.role,
      name: dbUser.name ?? undefined,
      userId: dbUser.userId ?? undefined,
      uid: dbUser.userId ?? undefined,
      clientCode: dbUser.clientCode ?? null,
      mustChangePassword: dbUser.mustChangePassword,

      authMode: req.user?.authMode ?? 'NORMAL',
      commonAccountId: req.user?.commonAccountId ?? null,
      commonAccountUserId: req.user?.commonAccountUserId ?? null,
      actingAsUserId: req.user?.actingAsUserId ?? null,
      actingAsName: req.user?.actingAsName ?? null,
    };
  }

  @Public()
  @Post('first-set-credentials')
  firstSetCredentials(
    @Body() body: { inviteToken: string; userId: string; newPassword: string },
  ) {
    return this.auth.firstSetCredentials(body);
  }

  @UseGuards(JwtAuthGuard, IdleTimeoutGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body()
    body: {
      currentPassword: string;
      newPassword: string;
    },
  ) {
    const userDbId = req.user?.sub as string;

    if (!userDbId) {
      throw new BadRequestException('Unauthenticated');
    }

    return this.auth.changeOwnPassword(
      userDbId,
      body.currentPassword,
      body.newPassword,
      req,
      res,
    );
  }

  /*
   * Do not add IdleTimeoutGuard here. An expired/idle user must still be
   * allowed to reach logout when the access token itself remains valid.
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { reason?: LogoutReason },
  ) {
    const { sub, role, uid, jti, clientCode } = req.user ?? {};

    // Accept only the known automatic reason. All other values are manual.
    const reason: LogoutReason =
      body?.reason === 'IDLE_TIMEOUT' ? 'IDLE_TIMEOUT' : 'MANUAL';

    return this.auth.logout(
      req,
      {
        id: sub,
        role,
        userId: uid,
        clientCode,
      },
      jti,
      res,
      reason,
    );
  }

  @Post('m2m/token')
  @Public()
  async m2mToken(@Body() body: { clientId: string; clientSecret: string }) {
    const mc = await this.prisma.machineClient.findUnique({
      where: { clientId: body.clientId },
    });

    if (!mc || !mc.isActive) {
      throw new UnauthorizedException();
    }

    const ok = await bcrypt.compare(body.clientSecret, mc.secretHash);

    if (!ok) {
      throw new UnauthorizedException();
    }

    const payload = {
      sub: `m2m:${mc.clientId}`,
      typ: 'm2m',
      role: 'SYSTEMADMIN',
      scopes: mc.scopes,
    };

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: '12h',
    });

    await this.prisma.machineClient.update({
      where: { clientId: mc.clientId },
      data: { lastUsedAt: new Date() },
    });

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: 12 * 60 * 60,
    };
  }

  @Public()
  @Get('db-branch')
  async dbBranch() {
    const rows = await this.prisma.$queryRaw<any[]>`
      select current_database() as db, current_setting('neon.branch', true) as branch
    `;

    return rows?.[0] ?? {};
  }

  @Public()
  @Post('verify-2fa')
  verify2fa(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { userId?: string; pendingToken?: string; code: string },
  ) {
    return this.auth.verifyTwoFactor(body, req, res);
  }

  @Public()
  @Post('resend-2fa')
  resend2fa(
    @Req() req: any,
    @Body() body: { userId?: string; pendingToken?: string },
  ) {
    return this.auth.resendTwoFactor(body, req);
  }

  @Public()
  @Post('refresh')
  refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Public()
  @Post('common/select')
  selectCommonIdentity(
    @Req() req: any,
    @Body() body: { challengeToken: string; personId: string; role: string },
  ) {
    return this.auth.selectCommonIdentity(body, req);
  }

  @UseGuards(JwtAuthGuard, IdleTimeoutGuard)
  @Post('activity')
  async activity(@Req() req: any) {
    const userId = req.user?.sub as string;

    if (!userId) {
      throw new UnauthorizedException('Unauthenticated');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date() },
    });

    return { ok: true };
  }
}
