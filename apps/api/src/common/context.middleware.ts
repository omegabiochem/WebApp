import { Injectable, NestMiddleware } from '@nestjs/common';
import { withRequestContext } from './request-context';

function firstHeaderValue(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  if (typeof v === 'string') return v;
  return undefined;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const user = req.user || {};

    const fwd = firstHeaderValue(req.headers['x-forwarded-for']);
    const ip =
      fwd?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '';

    const reason =
      firstHeaderValue(req.headers['x-change-reason']) ||
      req.body?.reason ||
      req.query?.reason ||
      undefined;

    const eSignPassword =
      firstHeaderValue(req.headers['x-esign-password']) ||
      req.body?.eSignPassword ||
      req.body?.esignPassword ||
      undefined;

    // Prefer human userId if present; fall back to JWT sub/uid conventions
    const userId = user.userId ?? user.sub ?? user.uid ??  undefined;
    // console.log("CTX USER ID:", userId);

    withRequestContext(
      { userId, role: user.role, ip, reason, eSignPassword },
      next,
    );
  }
}
