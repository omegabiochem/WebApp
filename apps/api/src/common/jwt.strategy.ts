

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
    });
  }


  async validate(payload: any) {
    return {
      sub: payload.sub,
      userId: payload.sub,
      role: payload.role,
      uid: payload.uid ?? null,
      clientCode: payload.clientCode ?? null,
      mcp: payload.mcp ?? null,

      authMode: payload.authMode ?? 'NORMAL',
      commonAccountId: payload.commonAccountId ?? null,
      commonAccountUserId: payload.commonAccountUserId ?? null,
      actingAsUserId: payload.actingAsUserId ?? null,
      actingAsName: payload.actingAsName ?? null,
    };
  }
}
