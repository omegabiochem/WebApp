import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  userId?: string;
  role?: string;
  ip?: string;
  reason?: string;        // optional “reason for change”
  eSignPassword?: string; // optional: for e-sign (X-ESign-Password)
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(ctx: RequestContext, fn: () => T) {
  return requestContext.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
