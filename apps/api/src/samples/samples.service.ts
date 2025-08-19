import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Injectable()
export class SamplesService {
  list() {
    return prisma.sample.findMany({ orderBy: { createdAt: 'desc' } });
  }
  create(data: { sampleCode: string; sampleType: string; clientId: string }) {
    return prisma.sample.create({ data: { ...data, status: 'received' } });
  }
}
