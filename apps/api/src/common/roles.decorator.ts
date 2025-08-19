import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export type Role = 'SYSTEMADMIN' | 'ADMIN' | 'FRONTDESK' | 'MICRO' | 'CHEMISTRY' | 'QA' | 'CLIENT';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
