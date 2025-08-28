// // import { Controller } from '@nestjs/common';

// // @Controller('auth')
// // export class AuthController {}

// import { Body, Controller, Post } from '@nestjs/common';
// import { AuthService } from './auth.service';

// @Controller('auth')
// export class AuthController {
//   constructor(private auth: AuthService) {}
//   @Post('login')
//   login(@Body() body: { email: string; password: string }) {
//     return this.auth.login(body.email, body.password);
//   }
// }
import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { Public } from 'src/common/public.decorator';

const prisma = new PrismaClient();

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @UseGuards(JwtAuthGuard) // ✅ require a valid JWT
  @Get('me') // ✅ maps to GET /auth/me
  getMe(@Req() req) {
    // ✅ NestJS injects request
    return req.user; // ✅ return the user payload decoded from the JWT
  }

  // Authenticated user changes their own password (first login flow)
  // @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const userId = req.user?.userId as string;
    if (!userId) throw new BadRequestException('Unauthenticated');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    if (!body.newPassword || body.newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters',
      );
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    return { ok: true };
  }
}
