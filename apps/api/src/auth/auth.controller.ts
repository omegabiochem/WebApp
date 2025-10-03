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

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private readonly jwtService: JwtService,
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

    const userId = req.user?.sub as string; // DB id
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

  // src/auth/auth.controller.ts
  @Post('m2m/token')
  @Public() // ← or protect with basic auth/rate-limit/IP allowlist
  async m2mToken(@Body() body: { clientId: string; clientSecret: string }) {
    const ok =
      body.clientId === process.env.M2M_CLIENT_ID &&
      body.clientSecret === process.env.M2M_CLIENT_SECRET;
    if (!ok) throw new UnauthorizedException();

    const payload = {
      type: 'service', // distinguish from human tokens
      service: 'scan-watcher',
      scopes: ['reports:read', 'attachments:write'],
      sub: body.clientId,
      role: 'M2M',
    };

    const expiresIn = '15m'; // short-lived
    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn,
    });
    return { access_token, token_type: 'Bearer', expires_in: 15 * 60 };
  }
}
