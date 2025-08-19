import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SamplesService } from './samples.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('samples')
export class SamplesController {
  constructor(private samplesService: SamplesService) {}

  @Get()
  findAll() {
    return this.samplesService.list();
  }

  @Post()
  create(@Body() body: { sampleCode: string; sampleType: string; clientId: string }) {
    return this.samplesService.create(body);
  }
}
