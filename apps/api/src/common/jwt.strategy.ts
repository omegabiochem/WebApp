import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  PassportStrategy,
} from '@nestjs/passport';

import {
  ExtractJwt,
  Strategy,
} from 'passport-jwt';

import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest:
        ExtractJwt.fromAuthHeaderAsBearerToken(),

      secretOrKey:
        process.env.JWT_SECRET!,
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException(
        'Invalid authentication token',
      );
    }

    // =========================================================
    // MACHINE-TO-MACHINE AUTHENTICATION
    // =========================================================
    if (
      payload.typ === 'm2m' &&
      typeof payload.sub === 'string' &&
      payload.sub.startsWith('m2m:')
    ) {
      const clientId = payload.sub.substring(4).trim();

      if (!clientId) {
        throw new UnauthorizedException(
          'Invalid machine authentication token',
        );
      }

      /*
       * Re-check MachineClient in the database on every request.
       *
       * This is important because if an administrator disables the
       * scanner MachineClient, already-issued 12-hour tokens should
       * stop working immediately.
       */
      const machineClient =
        await this.prisma.machineClient.findUnique({
          where: {
            clientId,
          },

          select: {
            clientId: true,
            isActive: true,
            scopes: true,
          },
        });

      if (!machineClient || !machineClient.isActive) {
        throw new UnauthorizedException(
          'Machine client not found or inactive',
        );
      }

      return {
        /*
         * Keep m2m:* as sub so IdleTimeoutGuard recognizes
         * this as a machine session.
         */
        sub: `m2m:${machineClient.clientId}`,

        userId: `m2m:${machineClient.clientId}`,

        role: 'SYSTEMADMIN',

        uid: machineClient.clientId,

        clientCode: null,

        mcp: null,

        authMode: 'M2M',

        machineClientId: machineClient.clientId,

        scopes: machineClient.scopes ?? [],

        commonAccountId: null,
        commonAccountUserId: null,
        actingAsUserId: null,
        actingAsName: null,
      };
    }

    // =========================================================
    // NORMAL / COMMON HUMAN USER AUTHENTICATION
    // =========================================================

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },

        select: {
          id: true,
          userId: true,
          role: true,
          clientCode: true,
          active: true,
          passwordVersion: true,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'User no longer exists',
      );
    }

    if (!user.active) {
      throw new UnauthorizedException(
        'User account is inactive',
      );
    }

    if (
      typeof payload.passwordVersion !== 'number' ||
      payload.passwordVersion !== user.passwordVersion
    ) {
      throw new UnauthorizedException(
        'Session has expired. Please sign in again.',
      );
    }

    const authMode =
      payload.authMode === 'COMMON'
        ? 'COMMON'
        : 'NORMAL';

    return {
      sub: user.id,

      userId: user.id,

      role:
        authMode === 'COMMON'
          ? payload.role
          : user.role,

      uid:
        user.userId ??
        payload.uid ??
        null,

      clientCode:
        user.clientCode ?? null,

      mcp:
        payload.mcp ?? null,

      authMode,

      commonAccountId:
        payload.commonAccountId ?? null,

      commonAccountUserId:
        payload.commonAccountUserId ?? null,

      actingAsUserId:
        payload.actingAsUserId ?? null,

      actingAsName:
        payload.actingAsName ?? null,
    };
  }
}


