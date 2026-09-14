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
  BadRequestException,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from 'src/common/roles.guard';
import { Roles } from 'src/common/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ---------------------------------------------------------
  // GET /users?q=&role=&active=&page=&pageSize=
  // ADMIN / SYSTEMADMIN only
  // ---------------------------------------------------------
  @Get()
  @Roles('ADMIN', 'SYSTEMADMIN')
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

  // ---------------------------------------------------------
  // POST /users/admin-create
  // ---------------------------------------------------------
  @Post('admin-create')
  @Roles('ADMIN', 'SYSTEMADMIN')
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

  // ---------------------------------------------------------
  // PATCH /users/:id/role
  // ---------------------------------------------------------
  @Patch(':id/role')
  @Roles('ADMIN', 'SYSTEMADMIN')
  changeRole(
    @Param('id') id: string,
    @Body() body: { role: UserRole },
  ) {
    return this.users.changeRole(id, body.role);
  }

  // ---------------------------------------------------------
  // PATCH /users/:id/active
  // ---------------------------------------------------------
  @Patch(':id/active')
  @Roles('ADMIN', 'SYSTEMADMIN')
  toggleActive(
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.users.toggleActive(id, body.active);
  }

  // ---------------------------------------------------------
  // PATCH /users/:id/client-code
  // ---------------------------------------------------------
  @Patch(':id/client-code')
  @Roles('ADMIN', 'SYSTEMADMIN')
  updateClientCode(
    @Param('id') id: string,
    @Body() body: { clientCode: string | null },
  ) {
    return this.users.updateClientCode(id, body.clientCode ?? null);
  }

  // ---------------------------------------------------------
  // PATCH /users/:id/name
  // ---------------------------------------------------------
  @Patch(':id/name')
  @Roles('ADMIN', 'SYSTEMADMIN')
  updateName(
    @Param('id') id: string,
    @Body() body: { name: string | null },
  ) {
    return this.users.updateName(id, body.name ?? null);
  }

  // ---------------------------------------------------------
  // PATCH /users/:id/email
  // ---------------------------------------------------------
  @Patch(':id/email')
  @Roles('ADMIN', 'SYSTEMADMIN')
  updateEmail(
    @Param('id') id: string,
    @Body() body: { email: string },
  ) {
    return this.users.updateEmail(id, body.email);
  }

  // ---------------------------------------------------------
  // POST /users/:id/reset-password
  // ---------------------------------------------------------
  @Post(':id/reset-password')
  @Roles('ADMIN', 'SYSTEMADMIN')
  resetPasswordAdmin(@Param('id') id: string) {
    return this.users.resetPasswordAdmin(id);
  }

  // ---------------------------------------------------------
  // POST /users/:id/set-password
  // ---------------------------------------------------------
  @Post(':id/set-password')
  @Roles('ADMIN', 'SYSTEMADMIN')
  setPasswordAdmin(
    @Param('id') id: string,
    @Body() body: { newPassword: string },
  ) {
    return this.users.setPasswordAdmin(id, body.newPassword);
  }

  // ---------------------------------------------------------
  // POST /users/:id/force-signout
  // ---------------------------------------------------------
  @Post(':id/force-signout')
  @Roles('ADMIN', 'SYSTEMADMIN')
  forceSignout(@Param('id') id: string) {
    return this.users.forceSignout(id);
  }

  // ---------------------------------------------------------
  // GET /users/check-userid?value=frontdesk01
  // ---------------------------------------------------------
  @Get('check-userid')
  @Roles('ADMIN', 'SYSTEMADMIN')
  checkUserIdAvailability(@Query('value') value: string) {
    return this.users.checkUserIdAvailability(value ?? '');
  }

  // ---------------------------------------------------------
  // GET /users/lookup?ids=id1,id2,id3
  // Staff lookup endpoint
  // ---------------------------------------------------------
  @Get('lookup')
  @Roles(
    'SYSTEMADMIN',
    'ADMIN',
    'QA',
    'FRONTDESK',
    'MICRO',
    'MC',
    'CHEMISTRY',
  )
  async lookup(@Query('ids') idsRaw: string) {
    if (!idsRaw || !idsRaw.trim()) {
      throw new BadRequestException('ids is required');
    }

    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return this.users.lookupByIds(ids);
  }
}