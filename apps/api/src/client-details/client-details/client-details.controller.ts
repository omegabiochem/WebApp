import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ClientDetailsService } from './client-details.service';

@Controller('client-details')
export class ClientDetailsController {
  constructor(
    private readonly service: ClientDetailsService,
  ) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(req.user);
  }

  @Get(':clientCode')
  get(
    @Req() req: any,
    @Param('clientCode') clientCode: string,
  ) {
    return this.service.get(req.user, clientCode);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.service.create(req.user, body);
  }

  @Patch(':clientCode')
  update(
    @Req() req: any,
    @Param('clientCode') clientCode: string,
    @Body() body: any,
  ) {
    return this.service.update(
      req.user,
      clientCode,
      body,
    );
  }
}