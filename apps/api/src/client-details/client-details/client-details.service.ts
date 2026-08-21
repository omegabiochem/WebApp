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
      (data.workflowReminderMaxCount < 1 ||
        data.workflowReminderMaxCount > 10)
    ) {
      throw new BadRequestException(
        'Reminder maximum must be between 1 and 10',
      );
    }
  }

  /* =========================================================
     BILLING VALIDATION / COERCION
  ========================================================= */

  private normalizeBillingFields(data: Record<string, any>) {
    const copy = {
      ...data,
    };

    /*
     * billingEnabled must be a real boolean.
     *
     * We intentionally do NOT accept strings such as:
     * "true"
     * "false"
     *
     * This prevents accidental truthy values from enabling billing.
     */
    if (
      copy.billingEnabled !== undefined &&
      typeof copy.billingEnabled !== 'boolean'
    ) {
      throw new BadRequestException(
        'billingEnabled must be true or false',
      );
    }

    /*
     * billingStartAt may come from the frontend as:
     *
     * null
     * ""
     * ISO date string
     * Date object
     */
    if (copy.billingStartAt !== undefined) {
      if (
        copy.billingStartAt === null ||
        copy.billingStartAt === ''
      ) {
        copy.billingStartAt = null;
      } else if (copy.billingStartAt instanceof Date) {
        if (Number.isNaN(copy.billingStartAt.getTime())) {
          throw new BadRequestException('Invalid billingStartAt date');
        }
      } else if (typeof copy.billingStartAt === 'string') {
        const raw = copy.billingStartAt.trim();

        if (!raw) {
          copy.billingStartAt = null;
        } else {
          /*
           * HTML <input type="date"> normally returns YYYY-MM-DD.
           *
           * Make that explicitly UTC midnight instead of relying
           * on environment-specific date parsing.
           */
          const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? new Date(`${raw}T00:00:00.000Z`)
            : new Date(raw);

          if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException(
              'Invalid billingStartAt date',
            );
          }

          copy.billingStartAt = parsed;
        }
      } else {
        throw new BadRequestException(
          'billingStartAt must be a valid date or null',
        );
      }
    }

    return copy;
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

      /*
       * BILLING CONTACT
       */
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

      /*
       * BILLING ENGINE
       */
      'billingEnabled',
      'billingStartAt',

      'accountManager',
      'notes',
      'settings',
    ];

    const filtered = Object.fromEntries(
      Object.entries(input ?? {}).filter(([key]) =>
        allowed.includes(key),
      ),
    );

    return this.normalizeBillingFields(filtered);
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
     * Make every CLIENT user active again.
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

    /*
     * BILLING SAFETY
     *
     * If a new client is created with billingEnabled=true but
     * the administrator did not provide a billingStartAt,
     * billing begins NOW.
     *
     * This prevents existing/imported reports from accidentally
     * being captured later.
     */
    if (
      data.billingEnabled === true &&
      data.billingStartAt == null
    ) {
      data.billingStartAt = new Date();
    }

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
        await this.syncClientUsersActiveState(
          tx,
          clientCode,
          false,
        );
      }

      return created;
    });
  }

  /* =========================================================
     UPDATE
  ========================================================= */

  async update(
    user: AuthUser,
    clientCodeInput: string,
    input: any,
  ) {
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
        data.workdayStartMinutes ??
        existing.workdayStartMinutes,

      workdayEndMinutes:
        data.workdayEndMinutes ??
        existing.workdayEndMinutes,

      workingDays:
        data.workingDays ??
        existing.workingDays,

      workflowReminderIntervalMinutes:
        data.workflowReminderIntervalMinutes ??
        existing.workflowReminderIntervalMinutes,

      workflowReminderMaxCount:
        data.workflowReminderMaxCount ??
        existing.workflowReminderMaxCount,
    });

    /*
     * =======================================================
     * BILLING ENABLEMENT SAFETY
     * =======================================================
     *
     * Existing clients default to:
     *
     * billingEnabled = false
     * billingStartAt = null
     *
     * When billing is switched ON for the first time and the
     * administrator did not explicitly choose a start date,
     * automatically use the current timestamp.
     *
     * Therefore old reports do not suddenly enter billing.
     */
    const billingIsBeingEnabled =
      data.billingEnabled === true &&
      existing.billingEnabled === false;

    if (
      billingIsBeingEnabled &&
      data.billingStartAt === undefined &&
      existing.billingStartAt == null
    ) {
      data.billingStartAt = new Date();
    }

    /*
     * If billing was already enabled and only other client
     * information is being updated, leave billingStartAt alone.
     *
     * If the administrator explicitly sends:
     *
     * billingStartAt: null
     *
     * we allow that. The billing service will later treat
     * a null start date as "no additional cutoff".
     */

    const activeWasChanged =
      typeof data.active === 'boolean' &&
      data.active !== existing.active;

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
        affectedUserIds =
          await this.syncClientUsersActiveState(
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
    if (
      activeWasChanged &&
      data.active === false
    ) {
      console.log(
        `🚪 Client ${clientCode} deactivated. ` +
          `Force logging out ${affectedUserIds.length} users.`,
      );

      for (const userId of affectedUserIds) {
        console.log(
          '🚪 Force logout client user:',
          userId,
        );

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
    if (
      activeWasChanged &&
      data.active === true
    ) {
      console.log(
        `✅ Client ${clientCode} reactivated. ` +
          `${affectedUserIds.length} users activated.`,
      );
    }

    return updated;
  }
}