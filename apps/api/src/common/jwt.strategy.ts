import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET! });
  }
  // src/auth/jwt.strategy.ts
// async validate(payload: any) {
//   // return the same keys you sign with:
//   // e.g., { sub, role, uid, email? }
//    console.log("JWT PAYLOAD:", payload);
//   return payload;
// }

  async validate(payload: any) {
    // console.log("JWT PAYLOAD:", payload);

    return {
      userId: payload.sub,      // 👈 FIX: map sub → userId
      role: payload.role,
      uid: payload.uid,
      clientCode: payload.clientCode,
    };
  }

}
