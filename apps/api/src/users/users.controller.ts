import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private svc: UsersService) {}

  // Only SYSTEMADMIN or ADMIN can create accounts
  @Roles('SYSTEMADMIN','ADMIN')
  @Post()
  create(@Body() body: { email: string; name?: string; role: 'SYSTEMADMIN'|'ADMIN'|'FRONTDESK'|'MICRO'|'CHEMISTRY'|'QA'|'CLIENT' }) {
    return this.svc.createByAdmin(body as any);
  }

  // Only SYSTEMADMIN or ADMIN can change roles
  @Roles('SYSTEMADMIN','ADMIN')
  @Patch(':id/role')
  changeRole(@Param('id') id: string, @Body() body: { role: 'SYSTEMADMIN'|'ADMIN'|'FRONTDESK'|'MICRO'|'CHEMISTRY'|'QA'|'CLIENT' }) {
    return this.svc.changeRole(id, body.role as any);
  }

  // Optional: allow admins to list users
  @Roles('SYSTEMADMIN','ADMIN')
  @Get()
  list() {
    return this.svc.listAll();
  }
}
