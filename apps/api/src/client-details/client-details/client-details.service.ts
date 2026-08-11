import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

type AuthUser = {
  userId?: string;
  role: UserRole;
};

@Injectable()
export class ClientDetailsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(user: AuthUser) {
    if (!['ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEMADMIN can manage client details',
      );
    }
  }

  private validateTimeZone(timeZone?: string | null) {
    if (!timeZone) return;

    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone,
      }).format(new Date());
    } catch {
      throw new BadRequestException(
        `Invalid timezone: ${timeZone}. Use an IANA timezone such as America/New_York.`,
      );
    }
  }

  private validateWorkingHours(data: any) {
    if (
      data.workdayStartMinutes !== undefined &&
      (data.workdayStartMinutes < 0 ||
        data.workdayStartMinutes > 1439)
    ) {
      throw new BadRequestException(
        'workdayStartMinutes must be between 0 and 1439',
      );
    }

    if (
      data.workdayEndMinutes !== undefined &&
      (data.workdayEndMinutes < 1 ||
        data.workdayEndMinutes > 1440)
    ) {
      throw new BadRequestException(
        'workdayEndMinutes must be between 1 and 1440',
      );
    }

    if (
      data.workdayStartMinutes !== undefined &&
      data.workdayEndMinutes !== undefined &&
      data.workdayStartMinutes >= data.workdayEndMinutes
    ) {
      throw new BadRequestException(
        'Workday end must be after workday start',
      );
    }

    if (data.workingDays !== undefined) {
      if (
        !Array.isArray(data.workingDays) ||
        data.workingDays.some(
          (day: any) =>
            !Number.isInteger(day) || day < 1 || day > 7,
        )
      ) {
        throw new BadRequestException(
          'workingDays must contain ISO weekdays from 1 to 7',
        );
      }
    }

    if (
      data.workflowReminderIntervalMinutes !== undefined &&
      data.workflowReminderIntervalMinutes < 1
    ) {
      throw new BadRequestException(
        'Reminder interval must be at least 1 minute',
      );
    }

    if (
      data.workflowReminderMaxCount !== undefined &&
      (data.workflowReminderMaxCount < 1 ||
        data.workflowReminderMaxCount > 10)
    ) {
      throw new BadRequestException(
        'Reminder maximum must be between 1 and 10',
      );
    }
  }

  private sanitize(input: any) {
    const allowed = [
      'name',
      'legalName',
      'active',

      'primaryContactName',
      'primaryContactEmail',
      'primaryContactPhone',

      'secondaryContactName',
      'secondaryContactEmail',
      'secondaryContactPhone',

      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',

      'timeZone',
      'workdayStartMinutes',
      'workdayEndMinutes',
      'workingDays',

      'workflowReminderEnabled',
      'workflowReminderIntervalMinutes',
      'workflowReminderMaxCount',

      'billingContactName',
      'billingEmail',
      'billingPhone',

      'billingAddressLine1',
      'billingAddressLine2',
      'billingCity',
      'billingState',
      'billingPostalCode',
      'billingCountry',

      'paymentTerms',
      'accountManager',
      'notes',
      'settings',
    ];

    return Object.fromEntries(
      Object.entries(input ?? {}).filter(([key]) =>
        allowed.includes(key),
      ),
    );
  }

  async list(user: AuthUser) {
    this.assertManager(user);

    return this.prisma.clientDetails.findMany({
      orderBy: {
        clientCode: 'asc',
      },
    });
  }

  async get(user: AuthUser, clientCode: string) {
    this.assertManager(user);

    const row = await this.prisma.clientDetails.findUnique({
      where: {
        clientCode: clientCode.trim().toUpperCase(),
      },
    });

    if (!row) {
      throw new NotFoundException('Client details not found');
    }

    return row;
  }

  async create(user: AuthUser, input: any) {
    this.assertManager(user);

    const clientCode = String(input?.clientCode ?? '')
      .trim()
      .toUpperCase();

    if (!clientCode) {
      throw new BadRequestException('clientCode is required');
    }

    const data = this.sanitize(input);

    this.validateTimeZone(data.timeZone as string | undefined);
    this.validateWorkingHours(data);

    return this.prisma.clientDetails.create({
      data: {
        clientCode,
        ...(data as any),
      },
    });
  }

  async update(
    user: AuthUser,
    clientCodeInput: string,
    input: any,
  ) {
    this.assertManager(user);

    const clientCode = clientCodeInput.trim().toUpperCase();

    const existing =
      await this.prisma.clientDetails.findUnique({
        where: { clientCode },
      });

    if (!existing) {
      throw new NotFoundException('Client details not found');
    }

    const data = this.sanitize(input);

    this.validateTimeZone(data.timeZone as string | undefined);

    this.validateWorkingHours({
      workdayStartMinutes:
        data.workdayStartMinutes ??
        existing.workdayStartMinutes,

      workdayEndMinutes:
        data.workdayEndMinutes ??
        existing.workdayEndMinutes,

      workingDays:
        data.workingDays ?? existing.workingDays,

      workflowReminderIntervalMinutes:
        data.workflowReminderIntervalMinutes ??
        existing.workflowReminderIntervalMinutes,

      workflowReminderMaxCount:
        data.workflowReminderMaxCount ??
        existing.workflowReminderMaxCount,
    });

    return this.prisma.clientDetails.update({
      where: { clientCode },
      data: data as any,
    });
  }
}