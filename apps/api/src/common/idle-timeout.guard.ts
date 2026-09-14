// src/common/idle-timeout.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class IdleTimeoutGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user?.sub) {
      return true;
    }

    // Machine-to-machine sessions do not use browser inactivity.
    if (
      typeof user.sub === 'string' &&
      user.sub.startsWith('m2m:')
    ) {
      return true;
    }

    const dbUser = await this.prisma.user.findUnique({
      where: {
        id: user.sub,
      },
      select: {
        active: true,
        lastActivityAt: true,
      },
    });

    if (!dbUser || !dbUser.active) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found or inactive.',
      });
    }

    const lastActivityAt = dbUser.lastActivityAt;

    if (!lastActivityAt) {
      throw new UnauthorizedException({
        code: 'IDLE_TIMEOUT',
        message:
          'Session activity could not be verified. Please sign in again.',
      });
    }

    const inactiveFor =
      Date.now() - lastActivityAt.getTime();

    if (inactiveFor >= IDLE_TIMEOUT_MS) {
      throw new UnauthorizedException({
        code: 'IDLE_TIMEOUT',
        message:
          'Session expired due to inactivity. Please sign in again.',
      });
    }

    // Important:
    // Do not update lastActivityAt here.
    // Automatic API requests must not count as user activity.

    return true;
  }
}








