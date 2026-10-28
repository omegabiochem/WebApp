import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma, TestingInquiryStatus } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

const allowedRoles = new Set(['SYSTEMADMIN', 'ADMIN', 'FRONTDESK']);

@Controller('testing-inquiries')
export class TestingInquiriesAdminController {
  constructor(private readonly prisma: PrismaService) {}

  private requireStaff(req: Request) {
    const role = (req.user as { role?: string } | undefined)?.role;

    if (!role || !allowedRoles.has(role)) {
      throw new ForbiddenException(
        'Not authorized to manage testing inquiries',
      );
    }
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') sizeRaw?: string,
  ) {
    this.requireStaff(req);

    const page = Math.max(
      1,
      Math.min(100000, Number.parseInt(pageRaw ?? '1', 10) || 1),
    );

    const pageSize = Math.max(
      1,
      Math.min(100, Number.parseInt(sizeRaw ?? '20', 10) || 20),
    );

    const search = String(q ?? '')
      .trim()
      .slice(0, 150);

    const filters: Prisma.TestingInquiryWhereInput = {
      ...(search
        ? {
            OR: [
              {
                reference: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                companyName: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                contactName: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                requirements: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),

      ...(status &&
      status !== 'All' &&
      Object.values(TestingInquiryStatus).includes(
        status as TestingInquiryStatus,
      )
        ? { status: status as TestingInquiryStatus }
        : {}),
    };

    const statuses = [
      TestingInquiryStatus.NEW,
      TestingInquiryStatus.CONTACTED,
      TestingInquiryStatus.QUOTED,
      TestingInquiryStatus.CONVERTED,
      TestingInquiryStatus.CLOSED,
    ] as const;

    const [items, total, ...totals] = await Promise.all([
      this.prisma.testingInquiry.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
          testingTypes: true,
          productType: true,
          sampleCount: true,
          requirements: true,
          turnaround: true,
          consent: true,
          status: true,
          emailStatus: true,
          emailError: true,
          emailedAt: true,
          createdAt: true,
        },
      }),

      this.prisma.testingInquiry.count({
        where: filters,
      }),

      ...statuses.map((statusValue) =>
        this.prisma.testingInquiry.count({
          where: { status: statusValue },
        }),
      ),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      counts: {
        NEW: totals[0] ?? 0,
        CONTACTED: totals[1] ?? 0,
        QUOTED: totals[2] ?? 0,
        CONVERTED: totals[3] ?? 0,
        CLOSED: totals[4] ?? 0,
      },
    };
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status?: unknown },
  ) {
    this.requireStaff(req);

    const next = body?.status;

    if (
      typeof next !== 'string' ||
      !Object.values(TestingInquiryStatus).includes(
        next as TestingInquiryStatus,
      )
    ) {
      throw new BadRequestException('Invalid inquiry status');
    }

    return this.prisma.testingInquiry.update({
      where: { id },
      data: {
        status: next as TestingInquiryStatus,
      },
    });
  }
}
