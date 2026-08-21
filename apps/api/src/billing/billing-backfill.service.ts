import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import {
  FormType,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from 'prisma/prisma.service';

import { getRequestContext } from '../common/request-context';

/* =========================================================
   TYPES
========================================================= */

type AuthUser = {
  userId: string;
  role: UserRole;
};

type BackfillItem = {
  sourceType:
    | 'REPORT'
    | 'CHEMISTRY_REPORT';

  sourceId: string;

  formType: FormType;

  formNumber: string;

  reportNumber: string;

  clientCode: string;

  milestoneStatus: string;

  milestoneAt: Date;

  billingReadyAt: Date;

  existingResultSentToClientAt:
    | Date
    | null;

  existingBillingReadyAt:
    | Date
    | null;
};

/* =========================================================
   SERVICE
========================================================= */

@Injectable()
export class BillingBackfillService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  /* =======================================================
     AUTHORIZATION
  ======================================================= */

  private assertManager(
    user: AuthUser,
  ) {
    if (
      ![
        'ADMIN',
        'SYSTEMADMIN',
      ].includes(
        user.role,
      )
    ) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEMADMIN can run billing backfill',
      );
    }
  }

  /* =======================================================
     DATE HELPER
  ======================================================= */

  private laterDate(
    a: Date,
    b?: Date | null,
  ) {
    if (!b) {
      return a;
    }

    return b.getTime() >
      a.getTime()
      ? b
      : a;
  }

  /* =======================================================
     ELIGIBLE BILLING CLIENTS

     VERY IMPORTANT:
     Historical billing backfill is allowed only when:

     - client is active
     - billingEnabled = true
     - billingStartAt exists

     Anything before billingStartAt is ignored.
  ======================================================= */

  private async getEligibleBillingClients() {
    const clients =
      await this.prisma.clientDetails.findMany({
        where: {
          active: true,

          billingEnabled: true,

          billingStartAt: {
            not: null,
          },
        },

        select: {
          clientCode: true,

          billingStartAt: true,
        },
      });

    const startMap =
      new Map<
        string,
        Date
      >();

    for (
      const client of
      clients
    ) {
      if (
        !client.billingStartAt
      ) {
        continue;
      }

      const clientCode =
        String(
          client.clientCode ??
            '',
        )
          .trim()
          .toUpperCase();

      if (
        !clientCode
      ) {
        continue;
      }

      startMap.set(
        clientCode,
        client.billingStartAt,
      );
    }

    return {
      clientCodes:
        Array.from(
          startMap.keys(),
        ),

      startMap,
    };
  }

  /* =======================================================
     DISCOVER MICRO REPORTS
  ======================================================= */

  private async discoverMicro(
    clientCodes:
      string[],

    clientStartMap:
      Map<
        string,
        Date
      >,
  ): Promise<
    BackfillItem[]
  > {
    /*
     * Do not query all historical reports
     * when no billing-enabled clients exist.
     */
    if (
      clientCodes.length ===
      0
    ) {
      return [];
    }

    const reports =
      await this.prisma.report.findMany({
        where: {
          /*
           * Only reports that have not already
           * received the new billing timestamp.
           */
          billingReadyAt:
            null,

          /*
           * Billing requires an assigned report number.
           */
          reportNumber: {
            not: null,
          },

          /*
           * Never backfill voided laboratory reports.
           */
          status: {
            not:
              'VOID',
          },

          /*
           * Only billing-enabled clients.
           */
          clientCode: {
            in:
              clientCodes,
          },

          /*
           * APE children are not separate
           * billable sources.
           */
          parentReportId:
            null,

          reportType:
            null,

          formType: {
            in: [
              'MICRO_MIX',
              'MICRO_MIX_WATER',
              'STERILITY',
              'APE',
            ],
          },
        },

        select: {
          id: true,

          formType:
            true,

          formNumber:
            true,

          reportNumber:
            true,

          clientCode:
            true,

          resultSentToClientAt:
            true,

          billingReadyAt:
            true,

          /*
           * Used when report number was assigned
           * after the client-facing milestone.
           */
          ReportnumberAssignedAt:
            true,

          statusHistory: {
            select: {
              to: true,

              createdAt:
                true,
            },

            orderBy: {
              createdAt:
                'asc',
            },
          },
        },
      });

    const result:
      BackfillItem[] =
      [];

    for (
      const report of
      reports
    ) {
      /*
       * TypeScript safety even though
       * query already requires reportNumber.
       */
      if (
        !report.reportNumber
      ) {
        continue;
      }

      const clientCode =
        String(
          report.clientCode ??
            '',
        )
          .trim()
          .toUpperCase();

      if (
        !clientCode
      ) {
        continue;
      }

      const billingStartAt =
        clientStartMap.get(
          clientCode,
        );

      /*
       * Should normally be impossible because
       * query is restricted by clientCodes,
       * but keep this safety check.
       */
      if (
        !billingStartAt
      ) {
        continue;
      }

      /*
       * Micro Mix / Water become billable at:
       *
       * UNDER_CLIENT_FINAL_REVIEW
       *
       * Sterility / APE become billable at:
       *
       * UNDER_CLIENT_REVIEW
       */
      const milestoneStatus =
        report.formType ===
          'MICRO_MIX' ||
        report.formType ===
          'MICRO_MIX_WATER'
          ? 'UNDER_CLIENT_FINAL_REVIEW'
          : 'UNDER_CLIENT_REVIEW';

      /*
       * Status history is sorted ascending,
       * therefore .find() gives the FIRST time
       * this report reached the billing milestone.
       *
       * Corrections/resubmissions later must not
       * move the billing month.
       */
      const milestone =
        report.statusHistory.find(
          (
            history,
          ) =>
            String(
              history.to,
            ) ===
            milestoneStatus,
        );

      if (
        !milestone
      ) {
        continue;
      }

      /*
       * Billing cannot be ready before
       * a report number exists.
       *
       * Therefore use the later of:
       *
       * - first client-facing milestone
       * - report number assignment
       */
      const billingReadyAt =
        this.laterDate(
          milestone.createdAt,

          report.ReportnumberAssignedAt,
        );

      /*
       * CRITICAL HISTORICAL PROTECTION
       *
       * Anything before the client's configured
       * billing start date must never be backfilled.
       */
      if (
        billingReadyAt.getTime() <
        billingStartAt.getTime()
      ) {
        continue;
      }

      result.push({
        sourceType:
          'REPORT',

        sourceId:
          report.id,

        formType:
          report.formType,

        formNumber:
          report.formNumber,

        reportNumber:
          report.reportNumber,

        clientCode,

        milestoneStatus,

        milestoneAt:
          milestone.createdAt,

        billingReadyAt,

        existingResultSentToClientAt:
          report.resultSentToClientAt,

        existingBillingReadyAt:
          report.billingReadyAt,
      });
    }

    return result;
  }

  /* =======================================================
     DISCOVER CHEMISTRY REPORTS
  ======================================================= */

  private async discoverChemistry(
    clientCodes:
      string[],

    clientStartMap:
      Map<
        string,
        Date
      >,
  ): Promise<
    BackfillItem[]
  > {
    if (
      clientCodes.length ===
      0
    ) {
      return [];
    }

    const reports =
      await this.prisma.chemistryReport.findMany({
        where: {
          billingReadyAt:
            null,

          reportNumber: {
            not: null,
          },

          status: {
            not:
              'VOID',
          },

          clientCode: {
            in:
              clientCodes,
          },

          formType: {
            in: [
              'CHEMISTRY_MIX',
              'COA',
            ],
          },
        },

        select: {
          id: true,

          formType:
            true,

          formNumber:
            true,

          reportNumber:
            true,

          clientCode:
            true,

          resultSentToClientAt:
            true,

          billingReadyAt:
            true,

          ReportnumberAssignedAt:
            true,

          statusHistory: {
            select: {
              to: true,

              createdAt:
                true,
            },

            orderBy: {
              createdAt:
                'asc',
            },
          },
        },
      });

    const result:
      BackfillItem[] =
      [];

    for (
      const report of
      reports
    ) {
      if (
        !report.reportNumber
      ) {
        continue;
      }

      const clientCode =
        String(
          report.clientCode ??
            '',
        )
          .trim()
          .toUpperCase();

      if (
        !clientCode
      ) {
        continue;
      }

      const billingStartAt =
        clientStartMap.get(
          clientCode,
        );

      if (
        !billingStartAt
      ) {
        continue;
      }

      /*
       * Both Chemistry Mix and COA
       * use UNDER_CLIENT_REVIEW.
       */
      const milestoneStatus =
        'UNDER_CLIENT_REVIEW';

      /*
       * First client review transition only.
       */
      const milestone =
        report.statusHistory.find(
          (
            history,
          ) =>
            String(
              history.to,
            ) ===
            milestoneStatus,
        );

      if (
        !milestone
      ) {
        continue;
      }

      const billingReadyAt =
        this.laterDate(
          milestone.createdAt,

          report.ReportnumberAssignedAt,
        );

      /*
       * Do not import historical billing
       * before client billing was enabled.
       */
      if (
        billingReadyAt.getTime() <
        billingStartAt.getTime()
      ) {
        continue;
      }

      result.push({
        sourceType:
          'CHEMISTRY_REPORT',

        sourceId:
          report.id,

        formType:
          report.formType,

        formNumber:
          report.formNumber,

        reportNumber:
          report.reportNumber,

        clientCode,

        milestoneStatus,

        milestoneAt:
          milestone.createdAt,

        billingReadyAt,

        existingResultSentToClientAt:
          report.resultSentToClientAt,

        existingBillingReadyAt:
          report.billingReadyAt,
      });
    }

    return result;
  }

  /* =======================================================
     PREVIEW

     SAFE:
     DOES NOT UPDATE DATABASE.
  ======================================================= */

  async preview(
    user: AuthUser,
  ) {
    this.assertManager(
      user,
    );

    const {
      clientCodes,
      startMap,
    } =
      await this.getEligibleBillingClients();

    const [
      micro,
      chemistry,
    ] =
      await Promise.all([
        this.discoverMicro(
          clientCodes,
          startMap,
        ),

        this.discoverChemistry(
          clientCodes,
          startMap,
        ),
      ]);

    const items = [
      ...micro,
      ...chemistry,
    ].sort(
      (
        a,
        b,
      ) =>
        a.billingReadyAt.getTime() -
        b.billingReadyAt.getTime(),
    );

    return {
      eligibleClients:
        clientCodes,

      count:
        items.length,

      microCount:
        micro.length,

      chemistryCount:
        chemistry.length,

      items,
    };
  }

  /* =======================================================
     APPLY BACKFILL

     Only fills records where billingReadyAt
     is STILL null.

     This keeps operation idempotent.
  ======================================================= */

  async apply(
    user: AuthUser,
  ) {
    this.assertManager(
      user,
    );

    /*
     * Re-run the exact same discovery rules
     * immediately before applying.
     */
    const preview =
      await this.preview(
        user,
      );

    /*
     * Nothing to update.
     */
    if (
      preview.count ===
      0
    ) {
      return {
        previewCount:
          0,

        updatedCount:
          0,

        microCount:
          0,

        chemistryCount:
          0,

        message:
          'No billing records require backfill',
      };
    }

    const updatedCount =
      await this.prisma.$transaction(
        async (
          tx,
        ) => {
          let updated =
            0;

          for (
            const item of
            preview.items
          ) {
            /*
             * MICRO
             */
            if (
              item.sourceType ===
              'REPORT'
            ) {
              const updateResult =
                await tx.report.updateMany({
                  where: {
                    id:
                      item.sourceId,

                    /*
                     * Prevent overwriting something
                     * that another request has already
                     * populated.
                     */
                    billingReadyAt:
                      null,
                  },

                  data: {
                    /*
                     * Preserve an existing first-send
                     * timestamp if one already exists.
                     */
                    resultSentToClientAt:
                      item.existingResultSentToClientAt ??
                      item.milestoneAt,

                    billingReadyAt:
                      item.billingReadyAt,
                  },
                });

              updated +=
                updateResult.count;

              continue;
            }

            /*
             * CHEMISTRY
             */
            const updateResult =
              await tx.chemistryReport.updateMany({
                where: {
                  id:
                    item.sourceId,

                  billingReadyAt:
                    null,
                },

                data: {
                  resultSentToClientAt:
                    item.existingResultSentToClientAt ??
                    item.milestoneAt,

                  billingReadyAt:
                    item.billingReadyAt,
                },
              });

            updated +=
              updateResult.count;
          }

          return updated;
        },
      );

    /* =====================================================
       AUDIT
    ===================================================== */

    const ctx =
      getRequestContext();

    await this.prisma.auditTrail.create({
      data: {
        action:
          'BILLING_BACKFILL_APPLIED',

        entity:
          'BILLING',

        userId:
          user.userId,

        role:
          user.role,

        ipAddress:
          ctx?.ip ??
          null,

        details:
          `Billing milestone backfill applied to ${updatedCount} reports`,

        changes:
          {
            eligibleClients:
              preview.eligibleClients,

            previewCount:
              preview.count,

            updatedCount,

            microCount:
              preview.microCount,

            chemistryCount:
              preview.chemistryCount,
          } as Prisma.InputJsonValue,
      },
    });

    return {
      eligibleClients:
        preview.eligibleClients,

      previewCount:
        preview.count,

      updatedCount,

      microCount:
        preview.microCount,

      chemistryCount:
        preview.chemistryCount,
    };
  }
}