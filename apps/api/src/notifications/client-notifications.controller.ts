// apps/api/src/notifications/client-notifications.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ClientNotificationsService } from './client-notifications.service';
import { ClientNotifyMode } from '@prisma/client';

@Controller('/client-notifications')
export class ClientNotificationsController {
  constructor(private readonly svc: ClientNotificationsService) {}

  @Get(':clientCode')
  get(@Param('clientCode') clientCode: string) {
    return this.svc.getConfig(clientCode);
  }

  @Patch(':clientCode/mode')
  setMode(
    @Param('clientCode') clientCode: string,
    @Body() body: { mode: ClientNotifyMode },
  ) {
    return this.svc.setMode(clientCode, body.mode);
  }

  @Post(':clientCode/emails')
  addEmail(
    @Param('clientCode') clientCode: string,
    @Body() body: { email: string; label?: string },
  ) {
    return this.svc.addEmail(clientCode, body.email, body.label);
  }

  @Patch(':clientCode/emails/:id')
  toggleEmail(
    @Param('clientCode') clientCode: string,
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.svc.toggleEmail(clientCode, id, body.active);
  }

  @Delete(':clientCode/emails/:id')
  removeEmail(
    @Param('clientCode') clientCode: string,
    @Param('id') id: string,
  ) {
    return this.svc.removeEmail(clientCode, id);
  }
}
