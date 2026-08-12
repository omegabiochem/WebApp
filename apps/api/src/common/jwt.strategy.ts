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

    /*
     * Disabled account
     */
    if (!user.active) {
      throw new UnauthorizedException(
        'User account is inactive',
      );
    }

    /*
     * Force-signout/session invalidation.
     */
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

      // Keep same behavior as your current strategy.
      userId: user.id,

      /*
       * Common accounts use the selected role from the JWT.
       * Normal accounts use the current DB role.
       */
      role:
        authMode === 'COMMON'
          ? payload.role
          : user.role,

      uid:
        user.userId ??
        payload.uid ??
        null,

      /*
       * Use current DB clientCode so changing the client's
       * assignment becomes effective immediately.
       */
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


// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor() {
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       secretOrKey: process.env.JWT_SECRET!,
//     });
//   }


//   async validate(payload: any) {
//     return {
//       sub: payload.sub,
//       userId: payload.sub,
//       role: payload.role,
//       uid: payload.uid ?? null,
//       clientCode: payload.clientCode ?? null,
//       mcp: payload.mcp ?? null,

//       authMode: payload.authMode ?? 'NORMAL',
//       commonAccountId: payload.commonAccountId ?? null,
//       commonAccountUserId: payload.commonAccountUserId ?? null,
//       actingAsUserId: payload.actingAsUserId ?? null,
//       actingAsName: payload.actingAsName ?? null,
//     };
//   }
// }
