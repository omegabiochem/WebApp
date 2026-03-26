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

  @Get('reports')
  async reports(@Req() req: any, @Query('q') q?: string) {
    this.assertAdmin(req.user);
    return this.admin.listReports({ q: q ?? '' });
  }

  @Get('clients')
  async clients(@Req() req: any, @Query('q') q?: string) {
    this.assertAdmin(req.user);
    return this.admin.listClients({ q: q ?? '' });
  }

  @Get('reports/daily-activity')
  async dailyReportActivity(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('clientCode') clientCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertAdmin(req.user);
    return this.admin.listDailyReportActivity({
      q: q ?? '',
      clientCode: clientCode ?? '',
      from,
      to,
    });
  }

  @Get('reports/client-summary')
  async clientSummary(
    @Req() req: any,
    @Query('clientCode') clientCode?: string,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertAdmin(req.user);
    return this.admin.listClientReportSummary({
      clientCode: clientCode ?? 'ALL',
      range: range ?? 'ALL',
      from,
      to,
      page: Number(page ?? 1),
      pageSize: Number(pageSize ?? 10),
    });
  }

  @Get('client-codes')
  async clientCodes(@Req() req: any) {
    this.assertAdmin(req.user);
    return this.admin.listClientCodes();
  }

  @Get('reports/client-summary/details')
  async clientSummaryDetails(
    @Req() req: any,
    @Query('clientCode') clientCode?: string,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('metric') metric?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.assertAdmin(req.user);
    return this.admin.listClientReportSummaryDetails({
      clientCode: clientCode ?? 'ALL',
      range: range ?? 'ALL',
      from,
      to,
      metric: metric ?? 'ALL',
      page: Number(page ?? 1),
      pageSize: Number(pageSize ?? 10),
    });
  }
}

// import {
//   Controller,
//   Get,
//   Query,
//   Req,
//   ForbiddenException,
// } from '@nestjs/common';
// import { AdminService } from './admin.service';
// import { UserRole } from '@prisma/client';

// @Controller('admin')
// export class AdminController {
//   constructor(private readonly admin: AdminService) {}

//   private assertAdmin(user: any) {
//     const role: UserRole | undefined = user?.role;
//     if (role !== 'ADMIN' && role !== 'SYSTEMADMIN') {
//       throw new ForbiddenException('Admin only');
//     }
//   }

//   // GET /admin/reports?q=
//   @Get('reports')
//   async reports(@Req() req: any, @Query('q') q?: string) {
//     this.assertAdmin(req.user);
//     return this.admin.listReports({ q: q ?? '' });
//   }

//   // GET /admin/clients?q=
//   @Get('clients')
//   async clients(@Req() req: any, @Query('q') q?: string) {
//     this.assertAdmin(req.user);
//     return this.admin.listClients({ q: q ?? '' });
//   }
// }
