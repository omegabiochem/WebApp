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
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Public } from 'src/common/public.decorator';
import { PrismaService } from 'prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ✅ Login with userId + password (pass req so we can capture IP/UA for audit)
  @Public()
  @Post('login')
  login(@Req() req: any, @Body() body: { userId: string; password: string }) {
    return this.auth.loginWithUserId(body.userId, body.password, req);
  }

  // ✅ Who am I?
  @UseGuards(JwtAuthGuard)
  @Get('me')
  // async getMe(@Req() req: any) {
  //   const dbId = req.user?.userId as string; // JwtStrategy maps sub → userId
  //   if (!dbId) throw new BadRequestException('Unauthenticated');
  //   return this.auth.getMe(dbId);
  // }
  getMe(@Req() req) {
    return req.user; // sub, role, uid, etc.
  }

  // ✅ First login: set userId + new password by invite token
  @Public()
  @Post('first-set-credentials')
  firstSetCredentials(
    @Body() body: { inviteToken: string; userId: string; newPassword: string },
  ) {
    return this.auth.firstSetCredentials(body);
  }

  // ✅ Regular authenticated password change (pass req so we can audit)
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    // const dbId = req.user?.userId as string;
    // if (!dbId) throw new BadRequestException('Unauthenticated');
    // return this.auth.changeOwnPassword(dbId, body.currentPassword, body.newPassword, req);

    const userId = req.user?.userId as string; // DB id
    if (!userId) throw new BadRequestException('Unauthenticated');
    return this.auth.changeOwnPassword(
      userId,
      body.currentPassword,
      body.newPassword,
      req,
    );
  }

  // ✅ NEW: Logout endpoint (audited)
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: any) {
    const { sub, role, uid, jti } = req.user ?? {};
    return this.auth.logout(req, { id: sub, role, userId: uid }, jti);
  }

  @Post('m2m/token')
  @Public()
  async m2mToken(@Body() body: { clientId: string; clientSecret: string }) {
    const mc = await this.prisma.machineClient.findUnique({
      where: { clientId: body.clientId },
    });
    if (!mc || !mc.isActive) throw new UnauthorizedException();

    const ok = await bcrypt.compare(body.clientSecret, mc.secretHash);
    if (!ok) throw new UnauthorizedException();

    const payload = {
      sub: `m2m:${mc.clientId}`,
      typ: 'm2m',
      role: 'SYSTEMADMIN', // quick: pass your existing role guards

      scopes: mc.scopes, // keep scopes for later tightening
    };

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: '12h',
    });
    await this.prisma.machineClient.update({
      where: { clientId: mc.clientId },
      data: { lastUsedAt: new Date() },
    });

    return { access_token, token_type: 'Bearer', expires_in: 12 * 60 * 60 };
  }

  // auth.controller.ts
  @Public()
  @Get('db-branch')
  async dbBranch() {
    const rows = await this.prisma.$queryRaw<any[]>`
      select current_database() as db, current_setting('neon.branch', true) as branch
    `;
    return rows?.[0] ?? {};
  }
}
