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
    const user = req.user;

    if (!user?.sub) return true;

    // ✅ Skip idle timeout for machine-to-machine tokens
    // scan-watcher token has sub = "m2m:scan-watcher"
    if (typeof user.sub === 'string' && user.sub.startsWith('m2m:')) {
      return true;
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { lastActivityAt: true },
    });

    // ✅ If token has user sub but user is missing, don't crash Prisma update
    if (!dbUser) {
      throw new UnauthorizedException('User not found');
    }

    const now = new Date();
    const last = dbUser.lastActivityAt;

    // 15 minutes idle
    if (last && now.getTime() - new Date(last).getTime() > 15 * 60 * 1000) {
      throw new UnauthorizedException({
        code: 'IDLE_TIMEOUT',
        message: 'Session expired due to inactivity. Please sign in again.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.sub },
      data: { lastActivityAt: now },
    });

    return true;
  }
}