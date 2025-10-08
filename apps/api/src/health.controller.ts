// src/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';
@Controller() export class HealthController {
  @Get('health') @Public() health() { return { ok: true, ts: new Date().toISOString() }; }
}
