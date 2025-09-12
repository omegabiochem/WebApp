// src/common/request-context.ts
import { AsyncLocalStorage } from 'async_hooks';
import { UserRole } from '@prisma/client';

export type RequestMeta = { userId?: string|null; role?: UserRole|null; ip?: string|null };
export const requestContext = new AsyncLocalStorage<RequestMeta>();
export const getMeta = () => requestContext.getStore() ?? {};
