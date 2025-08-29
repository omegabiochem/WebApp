import {
  Body, Controller, Post, UseGuards, Req, BadRequestException, Get
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Public } from 'src/common/public.decorator';
import { UserRole } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // ✅ Login with userId + password
  @Public()
  @Post('login')
  login(@Body() body: { userId: string; password: string }) {
    return this.auth.loginWithUserId(body.userId, body.password);
  }

  // ✅ Who am I?
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req) {
    return req.user; // sub, role, uid, etc.
  }

  // // ✅ Admin invite (creates/updates user with temp password & invite token)
  // @UseGuards(JwtAuthGuard)
  // @Post('admin/invite')
  // adminInvite(@Req() req, @Body() body: { email: string; role?: string;userId?: string; name?: string  }) {
  //   // You can also role-guard here; assuming your JwtAuthGuard attaches role:
  //   // if (!['ADMIN','SYSTEMADMIN'].includes(req.user.role)) throw new ForbiddenException();
  //   return this.auth.adminInvite(body.email, body.role,body.userId, body.name);
  // }

  // ✅ First login: set userId + new password by invite token
  @Public()
  @Post('first-set-credentials')
  firstSetCredentials(
    @Body() body: { inviteToken: string; userId: string; newPassword: string },
  ) {
    return this.auth.firstSetCredentials(body);
  }

  // ✅ Regular authenticated password change (not the first-login)
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const userId = req.user?.sub as string;
    // <-- payload.sub is our DB id
    if (!userId) throw new BadRequestException('Unauthenticated');
    return this.auth.changeOwnPassword(userId, body.currentPassword, body.newPassword);
  }
}



// import {
//   Body,
//   Controller,
//   Post,
//   UseGuards,
//   Req,
//   BadRequestException,
//   Get,
// } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { JwtAuthGuard } from '../common/jwt-auth.guard';
// import * as bcrypt from 'bcrypt';
// import { PrismaClient } from '@prisma/client';
// import { Public } from 'src/common/public.decorator';

// const prisma = new PrismaClient();

// @Controller('auth')
// export class AuthController {
//   constructor(private auth: AuthService) {}

//   // // ✅ Login with userId + password
//   // @Public()
//   // @Post('login')
//   // login(@Body() body: { userId: string; password: string }) {
//   //   return this.auth.loginWithUserId(body.userId, body.password);
//   // }


//   @Public()
//   @Post('login')
//   login(@Body() body: { email: string; password: string }) {
//     return this.auth.login(body.email, body.password);
//   }

//    // ✅ Who am I?

//   @UseGuards(JwtAuthGuard) // ✅ require a valid JWT
//   @Get('me') // ✅ maps to GET /auth/me
//   getMe(@Req() req) {
//     // ✅ NestJS injects request
//     return req.user; // ✅ return the user payload decoded from the JWT
//   }

  
//   // // ✅ Admin invite (creates/updates user with temp password & invite token)
//   // @UseGuards(JwtAuthGuard)
//   // @Post('admin/invite')
//   // adminInvite(@Req() req, @Body() body: { email: string; role?: string }) {
//   //   // You can also role-guard here; assuming your JwtAuthGuard attaches role:
//   //   // if (!['ADMIN','SYSTEMADMIN'].includes(req.user.role)) throw new ForbiddenException();
//   //   return this.auth.adminInvite(body.email, body.role);
//   // }

//   // // ✅ First login: set userId + new password by invite token
//   // @Public()
//   // @Post('first-set-credentials')
//   // firstSetCredentials(
//   //   @Body() body: { inviteToken: string; userId: string; newPassword: string },
//   // ) {
//   //   return this.auth.firstSetCredentials(body);
//   // }

//   // // ✅ Regular authenticated password change (not the first-login)
//   // @UseGuards(JwtAuthGuard)
//   // @Post('change-password')
//   // async changePassword(
//   //   @Req() req: any,
//   //   @Body() body: { currentPassword: string; newPassword: string },
//   // ) {
//   //   const userId = req.user?.sub as string; // <-- payload.sub is our DB id
//   //   if (!userId) throw new BadRequestException('Unauthenticated');
//   //   return this.auth.changeOwnPassword(userId, body.currentPassword, body.newPassword);
//   // }

//   // Authenticated user changes their own password (first login flow)
//   // @UseGuards(JwtAuthGuard)
//   @Post('change-password')
//   async changePassword(
//     @Req() req: any,
//     @Body() body: { currentPassword: string; newPassword: string },
//   ) {
//     const userId = req.user?.userId as string;
//     if (!userId) throw new BadRequestException('Unauthenticated');

//     const user = await prisma.user.findUnique({ where: { id: userId } });
//     if (!user) throw new BadRequestException('User not found');

//     const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
//     if (!ok) throw new BadRequestException('Current password is incorrect');

//     if (!body.newPassword || body.newPassword.length < 8) {
//       throw new BadRequestException(
//         'New password must be at least 8 characters',
//       );
//     }

//     const passwordHash = await bcrypt.hash(body.newPassword, 10);
//     await prisma.user.update({
//       where: { id: userId },
//       data: { passwordHash, mustChangePassword: false },
//     });

//     return { ok: true };
//   }
// }
