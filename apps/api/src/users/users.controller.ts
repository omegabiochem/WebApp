
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from 'src/common/roles.guard';
import { Roles } from 'src/common/roles.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private svc: UsersService) {}

  @Roles('SYSTEMADMIN','ADMIN')
  @Post()
  create(@Body() body: { email: string; name?: string; role: UserRole; userId: string; clientCode?: string }) {
    return this.svc.createByAdmin(body);
  }

  @Roles('SYSTEMADMIN','ADMIN')
  @Patch(':id/role')
  changeRole(@Param('id') id: string, @Body() body: { role: UserRole }) {
    return this.svc.changeRole(id, body.role);
  }

  // ✅ Paged list with filters (backs the table)
  @Roles('SYSTEMADMIN','ADMIN')
  @Get()
  listPaged(
    @Query('q') q?: string,
    @Query('role') role?: UserRole | 'ALL',
    @Query('active') active?: 'ALL'|'TRUE'|'FALSE',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.svc.listAllPaged({
      q,
      role: (role as any) ?? 'ALL',
      active: (active as any) ?? 'ALL',
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
    });
  }

  // Generic patch (active / clientCode)
  @Roles('SYSTEMADMIN','ADMIN')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: Partial<{ active: boolean; clientCode: string | null }>) {
    if (typeof body.active === 'boolean') return this.svc.toggleActive(id, body.active);
    if (typeof body.clientCode !== 'undefined') return this.svc.updateClientCode(id, body.clientCode);
    return { ok: true };
  }

  // Password ops
  @Roles('SYSTEMADMIN','ADMIN')
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.svc.resetPasswordAdmin(id);
  }

  @Roles('SYSTEMADMIN','ADMIN')
  @Post(':id/set-password')
  setPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    return this.svc.setPasswordAdmin(id, body.newPassword);
  }

  // Force sign-out
  @Roles('SYSTEMADMIN','ADMIN')
  @Post(':id/force-signout')
  forceSignout(@Param('id') id: string) {
    return this.svc.forceSignout(id);
  }

  // Username availability
  @Roles('SYSTEMADMIN','ADMIN')
  @Get('check-userid')
  checkUserId(@Query('value') value: string) {
    return this.svc.checkUserIdAvailability(value ?? '');
  }
}
