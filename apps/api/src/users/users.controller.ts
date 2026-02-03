// src/users/users.controller.ts
import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

// (Use your existing auth guard / roles guard)

// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard /*, RolesGuard */)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // GET /users?q=&role=&active=&page=&pageSize=
  @Get()
  // @Roles('ADMIN', 'SYSTEMADMIN')
  listAllPaged(
    @Query('q') q?: string,
    @Query('role') role?: UserRole | 'ALL',
    @Query('active') active?: 'ALL' | 'TRUE' | 'FALSE',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.users.listAllPaged({
      q: q ?? '',
      role: (role as any) ?? 'ALL',
      active: (active as any) ?? 'ALL',
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  // POST /users/admin-create
  @Post('admin-create')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  createByAdmin(
    @Body()
    body: {
      email: string;
      name?: string;
      role: UserRole;
      userId: string;
      clientCode?: string;
    },
  ) {
    return this.users.createByAdmin(body);
  }

  // PATCH /users/:id/role
  @Patch(':id/role')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  changeRole(@Param('id') id: string, @Body() body: { role: UserRole }) {
    return this.users.changeRole(id, body.role);
  }

  // PATCH /users/:id/active
  @Patch(':id/active')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  toggleActive(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.users.toggleActive(id, body.active);
  }

  // PATCH /users/:id/client-code
  @Patch(':id/client-code')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  updateClientCode(
    @Param('id') id: string,
    @Body() body: { clientCode: string | null },
  ) {
    return this.users.updateClientCode(id, body.clientCode ?? null);
  }

  // POST /users/:id/reset-password
  @Post(':id/reset-password')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  resetPasswordAdmin(@Param('id') id: string) {
    return this.users.resetPasswordAdmin(id);
  }

  // POST /users/:id/set-password
  @Post(':id/set-password')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  setPasswordAdmin(
    @Param('id') id: string,
    @Body() body: { newPassword: string },
  ) {
    return this.users.setPasswordAdmin(id, body.newPassword);
  }

  // POST /users/:id/force-signout
  @Post(':id/force-signout')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  forceSignout(@Param('id') id: string) {
    return this.users.forceSignout(id);
  }

  // GET /users/check-userid?value=frontdesk01
  @Get('check-userid')
  // @Roles('ADMIN', 'SYSTEMADMIN')
  checkUserIdAvailability(@Query('value') value: string) {
    return this.users.checkUserIdAvailability(value ?? '');
  }
}

// import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
// import { UsersService } from './users.service';
// import { JwtAuthGuard } from '../common/jwt-auth.guard';
// import { RolesGuard } from 'src/common/roles.guard';
// import { Roles } from 'src/common/roles.decorator';
// import { UserRole } from '@prisma/client';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('users')
// export class UsersController {
//   constructor(private svc: UsersService) {}

//   @Roles('SYSTEMADMIN','ADMIN')
//   @Post()
//   create(@Body() body: { email: string; name?: string; role: UserRole; userId: string; clientCode?: string }) {
//     return this.svc.createByAdmin(body);
//   }

//   @Roles('SYSTEMADMIN','ADMIN')
//   @Patch(':id/role')
//   changeRole(@Param('id') id: string, @Body() body: { role: UserRole }) {
//     return this.svc.changeRole(id, body.role);
//   }

//   // ✅ Paged list with filters (backs the table)
//   @Roles('SYSTEMADMIN','ADMIN')
//   @Get()
//   listPaged(
//     @Query('q') q?: string,
//     @Query('role') role?: UserRole | 'ALL',
//     @Query('active') active?: 'ALL'|'TRUE'|'FALSE',
//     @Query('page') page = '1',
//     @Query('pageSize') pageSize = '20',
//   ) {
//     return this.svc.listAllPaged({
//       q,
//       role: (role as any) ?? 'ALL',
//       active: (active as any) ?? 'ALL',
//       page: parseInt(page, 10) || 1,
//       pageSize: parseInt(pageSize, 10) || 20,
//     });
//   }

//   // Generic patch (active / clientCode)
//   @Roles('SYSTEMADMIN','ADMIN')
//   @Patch(':id')
//   patch(@Param('id') id: string, @Body() body: Partial<{ active: boolean; clientCode: string | null }>) {
//     if (typeof body.active === 'boolean') return this.svc.toggleActive(id, body.active);
//     if (typeof body.clientCode !== 'undefined') return this.svc.updateClientCode(id, body.clientCode);
//     return { ok: true };
//   }

//   // Password ops
//   @Roles('SYSTEMADMIN','ADMIN')
//   @Post(':id/reset-password')
//   resetPassword(@Param('id') id: string) {
//     return this.svc.resetPasswordAdmin(id);
//   }

//   @Roles('SYSTEMADMIN','ADMIN')
//   @Post(':id/set-password')
//   setPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
//     return this.svc.setPasswordAdmin(id, body.newPassword);
//   }

//   // Force sign-out
//   @Roles('SYSTEMADMIN','ADMIN')
//   @Post(':id/force-signout')
//   forceSignout(@Param('id') id: string) {
//     return this.svc.forceSignout(id);
//   }

//   // Username availability
//   @Roles('SYSTEMADMIN','ADMIN')
//   @Get('check-userid')
//   checkUserId(@Query('value') value: string) {
//     return this.svc.checkUserIdAvailability(value ?? '');
//   }
// }
