import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { UserRole } from '@prisma/client';

import { PrismaService } from 'prisma/prisma.service';

import { BillingService } from './billing.service';
import { BillingEmailService } from './billing-email.service';
import { SendInvoiceDto } from './dto/send-invoice.dto';

type AuthUser = {
  userId: string;
  role: UserRole;
};

const BILLING_TIME_ZONE =
  process.env.BILLING_TIME_ZONE || 'America/New_York';

function previousMonthKey(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const yearPart = parts.find((p) => p.type === 'year')?.value;
  const monthPart = parts.find((p) => p.type === 'month')?.value;

  let year = Number(yearPart);
  let month = Number(monthPart);

  month -= 1;

  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

@Injectable()
export class BillingSchedulerService {
  private readonly logger =
    new Logger(BillingSchedulerService.name);

  private running = false;
  private scheduledSendRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly email: BillingEmailService,
  ) {}

  /* =========================================================
     INTERNAL RUNNER
  ========================================================= */

  private async runForActor(actor: AuthUser, month: string) {
    return this.billing.generateDraftInvoices(actor, {
      month,
    });
  }

  /* =========================================================
     FIND SYSTEM ACTOR FOR CRON
  ========================================================= */

  private async findSchedulerActor(): Promise<AuthUser | null> {
    let actor = await this.prisma.user.findFirst({
      where: {
        active: true,
        role: 'SYSTEMADMIN',
      },
      select: {
        id: true,
        role: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!actor) {
      actor = await this.prisma.user.findFirst({
        where: {
          active: true,
          role: 'ADMIN',
        },
        select: {
          id: true,
          role: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    }

    if (!actor) {
      return null;
    }

    return {
      userId: actor.id,
      role: actor.role,
    };
  }

  private async findScheduledSendActor(
    scheduledBy?: string | null,
  ): Promise<AuthUser | null> {
    if (scheduledBy) {
      const user = await this.prisma.user.findUnique({
        where: {
          id: scheduledBy,
        },
        select: {
          id: true,
          role: true,
          active: true,
        },
      });

      if (
        user?.active &&
        ['FRONTDESK', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)
      ) {
        return {
          userId: user.id,
          role: user.role,
        };
      }
    }

    return this.findSchedulerActor();
  }

  /* =========================================================
     AUTOMATIC MONTHLY DRAFT GENERATION
  ========================================================= */

  @Cron('15 0 1 * *', {
    timeZone: BILLING_TIME_ZONE,
  })
  async generateMonthlyDrafts() {
    if (this.running) {
      this.logger.warn('Billing scheduler is already running');
      return;
    }

    this.running = true;

    try {
      const actor = await this.findSchedulerActor();

      if (!actor) {
        this.logger.error(
          'Monthly billing drafts were not generated because no active SYSTEMADMIN or ADMIN user exists.',
        );
        return;
      }

      const month = previousMonthKey(BILLING_TIME_ZONE);

      this.logger.log(
        `Starting automatic billing draft generation for ${month}`,
      );

      const result = await this.runForActor(actor, month);

      this.logger.log(
        `Automatic billing draft generation completed for ${month}. ` +
          `Invoices=${result.invoiceCount}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Automatic billing draft generation failed: ${error?.message ?? error}`,
        error?.stack,
      );
      throw error;
    } finally {
      this.running = false;
    }
  }

  /* =========================================================
     AUTOMATIC SCHEDULED INVOICE DELIVERY

     Runs once per minute. Each due invoice is atomically claimed
     by clearing scheduledSendAt before sending. If delivery fails,
     the original schedule is restored for retry.
  ========================================================= */

  @Cron('* * * * *', {
    timeZone: BILLING_TIME_ZONE,
  })
  async sendScheduledInvoices() {
    if (this.scheduledSendRunning) {
      return;
    }

    this.scheduledSendRunning = true;

    try {
      const now = new Date();

      const dueInvoices = await this.prisma.billingInvoice.findMany({
        where: {
          status: 'CONFIRMED',
          scheduledSendAt: {
            lte: now,
          },
          scheduledToEmail: {
            not: null,
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          clientCode: true,
          scheduledSendAt: true,
          scheduledToEmail: true,
          scheduledBy: true,
          scheduledAt: true,
        },
        orderBy: {
          scheduledSendAt: 'asc',
        },
        take: 25,
      });

      for (const invoice of dueInvoices) {
        if (!invoice.scheduledSendAt || !invoice.scheduledToEmail) {
          continue;
        }

        /*
         * Claim this invoice so two Fly instances cannot send it twice.
         */
        const claimed = await this.prisma.billingInvoice.updateMany({
          where: {
            id: invoice.id,
            status: 'CONFIRMED',
            scheduledSendAt: invoice.scheduledSendAt,
          },
          data: {
            scheduledSendAt: null,
          },
        });

        if (claimed.count !== 1) {
          continue;
        }

        try {
          const actor = await this.findScheduledSendActor(
            invoice.scheduledBy,
          );

          if (!actor) {
            throw new Error(
              'No active FRONTDESK, ADMIN, or SYSTEMADMIN account is available for scheduled invoice delivery',
            );
          }

          this.logger.log(
            `Sending scheduled invoice ${invoice.invoiceNumber ?? invoice.id} to ${invoice.scheduledToEmail}`,
          );

          await this.email.sendInvoice(
            actor,
            invoice.id,
            {
              toEmail: invoice.scheduledToEmail,
              resend: false,
            } as SendInvoiceDto,
          );

          this.logger.log(
            `Scheduled invoice ${invoice.invoiceNumber ?? invoice.id} sent successfully`,
          );
        } catch (error: any) {
          this.logger.error(
            `Scheduled invoice ${invoice.invoiceNumber ?? invoice.id} failed: ${error?.message ?? error}`,
            error?.stack,
          );

          /*
           * Restore the schedule only if the invoice is still CONFIRMED.
           * A successful send changes status to SENT and clears schedule fields.
           */
          await this.prisma.billingInvoice.updateMany({
            where: {
              id: invoice.id,
              status: 'CONFIRMED',
              sentAt: null,
              scheduledSendAt: null,
            },
            data: {
              scheduledSendAt: invoice.scheduledSendAt,
              scheduledToEmail: invoice.scheduledToEmail,
              scheduledBy: invoice.scheduledBy,
              scheduledAt: invoice.scheduledAt,
            },
          });
        }
      }
    } finally {
      this.scheduledSendRunning = false;
    }
  }

  /* =========================================================
     MANUAL TEST / ADMIN RUN
  ========================================================= */

  async runManual(user: AuthUser, month?: string) {
    if (!['ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEMADMIN can run billing generation manually',
      );
    }

    if (this.running) {
      throw new BadRequestException('Billing scheduler is already running');
    }

    const billingMonth =
      month?.trim() || previousMonthKey(BILLING_TIME_ZONE);

    if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
      throw new BadRequestException('month must use YYYY-MM format');
    }

    this.running = true;

    try {
      this.logger.log(
        `Manual billing scheduler run started for ${billingMonth} by ${user.userId}`,
      );

      const result = await this.runForActor(user, billingMonth);

      this.logger.log(
        `Manual billing scheduler run completed for ${billingMonth}. ` +
          `Invoices=${result.invoiceCount}`,
      );

      return {
        trigger: 'MANUAL',
        ...result,
      };
    } finally {
      this.running = false;
    }
  }
}