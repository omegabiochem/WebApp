// src/common/context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { requestContext } from './request-context';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const user = (req as any).user; // assuming your auth guard puts user on req
    const ip =
      (req.headers['x-forwarded-for'] as string) ??
      req.socket.remoteAddress ??
      null;

    requestContext.run(
      { userId: user?.id ?? null, role: user?.role ?? null, ip },
      () => next(),
    );
  }
}
