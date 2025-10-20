


import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true; // skip auth for public routes
    }
    return super.canActivate(context);
  }


   handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      // 👇 This will show "invalid signature", "jwt expired", "No auth token", etc.
      // It prints once per failed request in your API logs.
      // Remove after you’re done debugging.
      // eslint-disable-next-line no-console
      console.error('JWT auth failed:', { err: err?.message, info: info?.message || String(info) });
      throw err || new UnauthorizedException(info?.message || 'Unauthorized');
    }
    return user;
  }
}
