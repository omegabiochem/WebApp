import { Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';

@Controller('/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get()
  list(@Req() req: any) {
    return this.svc.listForViewer({
      userId: req.user.userId || req.user.sub,
      role: req.user.role,
      clientCode: req.user.clientCode ?? null,
    });
  }

  @Get('/unread-count')
  unreadCount(@Req() req: any) {
    return this.svc.unreadCount({
      userId: req.user.userId || req.user.sub,
      role: req.user.role,
      clientCode: req.user.clientCode ?? null,
    });
  }

  @Patch(':id/read')
  markRead(@Req() req: any, @Param('id') id: string) {
    return this.svc.markRead(
      {
        userId: req.user.userId || req.user.sub,
        role: req.user.role,
        clientCode: req.user.clientCode ?? null,
      },
      id,
    );
  }

  @Post('/read-all')
  markAllRead(@Req() req: any) {
    return this.svc.markAllRead({
      userId: req.user.userId || req.user.sub,
      role: req.user.role,
      clientCode: req.user.clientCode ?? null,
    });
  }
}