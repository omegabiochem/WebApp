import {
  Controller,
  Get,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserRole } from '@prisma/client';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  private assertAdmin(user: any) {
    const role: UserRole | undefined = user?.role;
    if (role !== 'ADMIN' && role !== 'SYSTEMADMIN') {
      throw new ForbiddenException('Admin only');
    }
  }

  // GET /admin/reports?q=
  @Get('reports')
  async reports(@Req() req: any, @Query('q') q?: string) {
    this.assertAdmin(req.user);
    return this.admin.listReports({ q: q ?? '' });
  }

  // GET /admin/clients?q=
  @Get('clients')
  async clients(@Req() req: any, @Query('q') q?: string) {
    this.assertAdmin(req.user);
    return this.admin.listClients({ q: q ?? '' });
  }
}
