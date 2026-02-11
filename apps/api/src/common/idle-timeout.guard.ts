// src/common/idle-timeout.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class IdleTimeoutGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user; // from JwtStrategy validate()

    if (!user?.sub) return true;

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { lastActivityAt: true },
    });

    const now = new Date();
    const last = dbUser?.lastActivityAt;

    // 15 minutes idle
    if (last && now.getTime() - new Date(last).getTime() > 1 * 60 * 1000) {
      throw new UnauthorizedException({
        code: 'IDLE_TIMEOUT',
        message: 'Session expired due to inactivity. Please sign in again.',
      });
    }

    // update activity (avoid auditing noise if you want)
    await this.prisma.user.update({
      where: { id: user.sub },
      data: { lastActivityAt: now },
    });

    return true;
  }
}
