// src/common/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { setRequestContext } from 'src/common/request-context';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      console.error('JWT auth failed:', { err: err?.message, info: info?.message || String(info) });
      throw err || new UnauthorizedException(info?.message || 'Unauthorized');
    }

    // ✅ Patch ALS with identity AFTER passport validated the token
    setRequestContext({
      userId: user.userId ?? user.sub ?? null,
      role: user.role ?? null,
    });

    return user;
  }
}

