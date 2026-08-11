import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  userId?: string;
  role?: string;
  clientCode?: string | null;
  ip?: string;
  reason?: string;
  eSignPassword?: string;
  skipAudit?: boolean;
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
    requestContext.enterWith({ ...patch });
  }
}




