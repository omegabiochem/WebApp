import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  userId?: string;
  role?: string;
  ip?: string;
  reason?: string; // optional “reason for change”
  eSignPassword?: string; // optional: for e-sign (X-ESign-Password)
  skipAudit?: boolean; // optional: skip audit logging
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(ctx: RequestContext, fn: () => T) {
  return requestContext.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function setRequestContext(patch: RequestContext) {
  const store = requestContext.getStore();
  if (store) {
    Object.assign(store, patch);
  } else {
    // Node >= 14.8 supports enterWith
    requestContext.enterWith({ ...patch });
  }
}
