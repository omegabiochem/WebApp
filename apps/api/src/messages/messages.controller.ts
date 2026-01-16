import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './create-message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly service: MessagesService) {
    console.log('✅ MessagesController loaded');
  }

  // CLIENT & LAB → fetch conversation
  @Get()
  async getMessages(
    @Req() req: any,
    @Query('clientCode') clientCode?: string,
    @Query('reportId') reportId?: string,
    @Query('chemistryId') chemistryId?: string,
  ) {
    const user = req.user;

    const effectiveClientCode =
      user.role === 'CLIENT' ? user.clientCode : clientCode;

    if (!effectiveClientCode) {
      throw new ForbiddenException('clientCode required');
    }

    return this.service.getThreadMessages({
      clientCode: effectiveClientCode,
      reportId,
      chemistryId,
      viewerRole: user.role,
    });
  }

  // ✅ THIS is what you’re missing in the mapped routes
  @Post()
  async sendMessage(@Req() req: any, @Body() dto: CreateMessageDto) {
    return this.service.sendMessage(req.user, dto);
  }

  // LAB → inbox
  @Get('inbox')
  async inbox(@Req() req: any) {
    const user = req.user;
    const userId = user.userId ?? user.sub;
    return this.service.getInbox(user, userId);
  }

  @Post('read')
  async markRead(
    @Req() req: any,
    @Body()
    body: { clientCode?: string; reportId?: string; chemistryId?: string },
  ) {
    const user = req.user;

    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('clientCode missing');

      return this.service.markThreadRead(user, {
        clientCode: user.clientCode,
        reportId: body.reportId,
        chemistryId: body.chemistryId,
      });
    }

    if (!body.clientCode) throw new ForbiddenException('clientCode required');

    return this.service.markThreadRead(user, {
      clientCode: body.clientCode,
      reportId: body.reportId,
      chemistryId: body.chemistryId,
    });
  }
}
