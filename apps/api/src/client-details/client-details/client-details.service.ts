import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from 'prisma/prisma.service';
import { NotificationGateway } from 'src/notifications/inAppNotifications/notification.gateway';

type AuthUser = {
  userId?: string;
  role: UserRole;
};

@Injectable()
export class ClientDetailsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly notificationGateway: NotificationGateway,
  ) {}

  /* =========================================================
     AUTHORIZATION
  ========================================================= */

  private assertManager(user: AuthUser) {
    if (!['ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEMADMIN can manage client details',
      );
    }
  }

  /* =========================================================
     VALIDATION
  ========================================================= */

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
      (data.workdayStartMinutes < 0 || data.workdayStartMinutes > 1439)
    ) {
      throw new BadRequestException(
        'workdayStartMinutes must be between 0 and 1439',
      );
    }

    if (
      data.workdayEndMinutes !== undefined &&
      (data.workdayEndMinutes < 1 || data.workdayEndMinutes > 1440)
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
      throw new BadRequestException('Workday end must be after workday start');
    }

    if (data.workingDays !== undefined) {
      if (
        !Array.isArray(data.workingDays) ||
        data.workingDays.some(
          (day: any) => !Number.isInteger(day) || day < 1 || day > 7,
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
      (data.workflowReminderMaxCount < 1 || data.workflowReminderMaxCount > 10)
    ) {
      throw new BadRequestException(
        'Reminder maximum must be between 1 and 10',
      );
    }
  }

  /* =========================================================
     SANITIZE
  ========================================================= */

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
      Object.entries(input ?? {}).filter(([key]) => allowed.includes(key)),
    );
  }

  /* =========================================================
     CLIENT USER STATUS / SESSION MANAGEMENT
  ========================================================= */

  private async syncClientUsersActiveState(
    tx: Prisma.TransactionClient,
    clientCode: string,
    active: boolean,
  ): Promise<string[]> {
    const users = await tx.user.findMany({
      where: {
        role: 'CLIENT',
        clientCode,
      },
      select: {
        id: true,
      },
    });

    const userIds = users.map((u) => u.id);

    if (!userIds.length) {
      return [];
    }

    if (!active) {
      /*
       * CLIENT OFF
       *
       * Disable all client users and invalidate
       * every existing session.
       */
      await tx.user.updateMany({
        where: {
          id: {
            in: userIds,
          },
        },
        data: {
          active: false,

          passwordVersion: {
            increment: 1,
          },

          refreshTokenHash: null,
          refreshTokenExpAt: null,
          refreshTokenRotatedAt: null,

          twoFactorCodeHash: null,
          twoFactorExpiresAt: null,
          twoFactorAttempts: 0,
        },
      });

      await tx.commonAuthChallenge.deleteMany({
        where: {
          selectedUserId: {
            in: userIds,
          },
          usedAt: null,
        },
      });

      return userIds;
    }

    /*
     * CLIENT ON
     *
     * Per your requirement:
     * make every CLIENT user active again.
     */
    await tx.user.updateMany({
      where: {
        id: {
          in: userIds,
        },
      },
      data: {
        active: true,

        failedLoginCount: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      },
    });

    return userIds;
  }

  /* =========================================================
     LIST
  ========================================================= */

  async list(user: AuthUser) {
    this.assertManager(user);

    return this.prisma.clientDetails.findMany({
      orderBy: {
        clientCode: 'asc',
      },
    });
  }

  /* =========================================================
     GET
  ========================================================= */

  async get(user: AuthUser, clientCode: string) {
    this.assertManager(user);

    const normalizedClientCode = clientCode.trim().toUpperCase();

    const row = await this.prisma.clientDetails.findUnique({
      where: {
        clientCode: normalizedClientCode,
      },
    });

    if (!row) {
      throw new NotFoundException('Client details not found');
    }

    return row;
  }

  /* =========================================================
     CREATE
  ========================================================= */

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

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.clientDetails.create({
        data: {
          clientCode,

          ...(data as any),
        },
      });

      /*
       * If administrator explicitly
       * creates this client as inactive,
       * disable and logout its users.
       */
      if (data.active === false) {
        await this.syncClientUsersActiveState(tx, clientCode, false);
      }

      return created;
    });
  }

  /* =========================================================
     UPDATE
  ========================================================= */

  async update(user: AuthUser, clientCodeInput: string, input: any) {
    this.assertManager(user);

    const clientCode = clientCodeInput.trim().toUpperCase();

    const existing = await this.prisma.clientDetails.findUnique({
      where: {
        clientCode,
      },
    });

    if (!existing) {
      throw new NotFoundException('Client details not found');
    }

    const data = this.sanitize(input);

    this.validateTimeZone(data.timeZone as string | undefined);

    this.validateWorkingHours({
      workdayStartMinutes:
        data.workdayStartMinutes ?? existing.workdayStartMinutes,

      workdayEndMinutes: data.workdayEndMinutes ?? existing.workdayEndMinutes,

      workingDays: data.workingDays ?? existing.workingDays,

      workflowReminderIntervalMinutes:
        data.workflowReminderIntervalMinutes ??
        existing.workflowReminderIntervalMinutes,

      workflowReminderMaxCount:
        data.workflowReminderMaxCount ?? existing.workflowReminderMaxCount,
    });

    const activeWasChanged =
      typeof data.active === 'boolean' && data.active !== existing.active;

    let affectedUserIds: string[] = [];

    /*
     * ONE transaction only.
     */
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.clientDetails.update({
        where: {
          clientCode,
        },

        data: data as any,
      });

      if (activeWasChanged) {
        affectedUserIds = await this.syncClientUsersActiveState(
          tx,
          clientCode,
          data.active as boolean,
        );
      }

      return result;
    });

    /*
     * Transaction is now fully committed.
     *
     * Only AFTER that do we send socket events.
     */
    if (activeWasChanged && data.active === false) {
      console.log(
        `🚪 Client ${clientCode} deactivated. ` +
          `Force logging out ${affectedUserIds.length} users.`,
      );

      for (const userId of affectedUserIds) {
        console.log('🚪 Force logout client user:', userId);

        this.notificationGateway.emitForceLogoutToUser(
          userId,
          'CLIENT_DEACTIVATED',
        );
      }
    }

    /*
     * Client reactivated.
     * Users were made active by
     * syncClientUsersActiveState().
     *
     * No socket logout needed.
     */
    if (activeWasChanged && data.active === true) {
      console.log(
        `✅ Client ${clientCode} reactivated. ` +
          `${affectedUserIds.length} users activated.`,
      );
    }

    return updated;
  }
}
