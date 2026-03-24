import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CommonAccountsService } from './common-accounts.service';

@Controller('common-accounts')
export class CommonAccountsController {
  constructor(private readonly service: CommonAccountsService) {}

  private assertAdmin(user: any) {
    const role: UserRole | undefined = user?.role;
    if (role !== 'ADMIN' && role !== 'SYSTEMADMIN') {
      throw new ForbiddenException('Admin only');
    }
  }

  @Get()
  async list(@Req() req: any) {
    this.assertAdmin(req.user);
    return this.service.listCommonAccounts();
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { label: string; userId: string; password: string },
  ) {
    this.assertAdmin(req.user);
    return this.service.createCommonAccount(body);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { active?: boolean; label?: string; password?: string },
  ) {
    this.assertAdmin(req.user);
    return this.service.updateCommonAccount(id, body);
  }

  @Get(':id/members')
  async listMembers(@Req() req: any, @Param('id') id: string) {
    this.assertAdmin(req.user);
    return this.service.listMembers(id);
  }

  @Post(':id/members')
  async addMember(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      userId: string;
      allowedRoles: UserRole[];
      active?: boolean;
    },
  ) {
    this.assertAdmin(req.user);
    return this.service.addMember(id, body);
  }

  @Patch(':id/members/:memberId')
  async updateMember(
    @Req() req: any,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: { active?: boolean; allowedRoles?: UserRole[] },
  ) {
    this.assertAdmin(req.user);
    return this.service.updateMember(id, memberId, body);
  }

  @Delete(':id/members/:memberId')
  async deleteMember(
    @Req() req: any,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    this.assertAdmin(req.user);
    return this.service.removeMember(id, memberId);
  }
}