// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor() {
//     super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET! });
//   }

//   async validate(payload: any) {

//       return { ...payload, userId: payload.sub };
//   }

// }
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  // src/common/jwt.strategy.ts
  async validate(payload: any) {
    return {
      sub: payload.sub,
      userId: payload.sub, // DB user id
      role: payload.role,
      uid: payload.uid ?? null, // optional username
      clientCode: payload.clientCode ?? null,
      mcp: payload.mcp ?? null,
    };
  }
}
