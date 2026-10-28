import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { TestingInquiriesService } from './testing-inquiries.service';
import { Public } from 'src/common/public.decorator';

// Public endpoint by design; ensure global auth middleware/guards exempt this path.
@Controller('public/testing-inquiries')
export class TestingInquiriesController {
  constructor(private readonly service: TestingInquiriesService) {}

  @Public()
  @Post()
  @HttpCode(201)
  submit(@Body() body: unknown, @Req() req: Request) {
    return this.service.submit(body, req.ip || 'unknown');
  }
}
