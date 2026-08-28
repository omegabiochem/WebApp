import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  BillingInvoiceStatus,
  BillingPriceBasis,
  BillingPriceRule,
  BillingSourceType,
  FormType,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from 'prisma/prisma.service';

import { getRequestContext } from '../common/request-context';

import { BillingPricingService } from './billing-pricing.service';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { UpdateInvoiceLineDto } from './dto/update-invoice-line.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { ConfirmInvoiceDto } from './dto/confirm-invoice.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

type AuthUser = {
  userId: string;
  role: UserRole;
};

type BillingCandidate = {
  sourceType: BillingSourceType;

  sourceId: string;

  chargeKey: string;

  formType: FormType;

  formNumber: string;

  reportNumber: string;

  clientCode: string;

  resultSentToClientAt: Date | null;

  billingReadyAt: Date;

  testKey: string;

  testLabel: string | null;

  /*
   * Exact individual pricing item.
   *
   * MICRO:
   * null
   *
   * CHEMISTRY_MIX:
   * AVOBENZONE
   * DIMETHICONE
   *
   * COA:
   * ASSAY
   * WATER
   */
  itemKey: string | null;

  itemLabel: string | null;

  /*
   * Legacy field retained for old pricing/invoice lines.
   * New Chemistry/COA item candidates use null.
   */
  activeCount: number | null;

  priceBasis: BillingPriceBasis;

  quantity: number;

  unitPrice: Prisma.Decimal | null;

  amount: Prisma.Decimal | null;

  pricingRuleId: string | null;

  pricingIssue: string | null;

  sourceSnapshot: Prisma.InputJsonValue;
};

const DEFAULT_BILLING_TIME_ZONE =
  process.env.BILLING_TIME_ZONE || 'America/New_York';

/* =========================================================
   TIMEZONE HELPERS
========================================================= */

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,

    year: 'numeric',
    month: '2-digit',
    day: '2-digit',

    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',

    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(map.year),

    month: Number(map.month),

    day: Number(map.day),

    hour: Number(map.hour),

    minute: Number(map.minute),

    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const p = getZonedParts(date, timeZone);

  const representedAsUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );

  return representedAsUtc - date.getTime();
}

function zonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  let offset = getTimeZoneOffsetMs(new Date(guess), timeZone);

  let result = new Date(guess - offset);

  /*
   * Recalculate once because the first guess may be
   * on the opposite side of a DST boundary.
   */
  const secondOffset = getTimeZoneOffsetMs(result, timeZone);

  if (secondOffset !== offset) {
    offset = secondOffset;

    result = new Date(guess - offset);
  }

  return result;
}

function monthKeyForNow(timeZone: string) {
  const p = getZonedParts(new Date(), timeZone);

  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

function getMonthRange(monthInput: string | undefined, timeZone: string) {
  const month = monthInput?.trim() || monthKeyForNow(timeZone);

  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    throw new BadRequestException('month must use YYYY-MM format');
  }

  const year = Number(match[1]);

  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) {
    throw new BadRequestException('Invalid billing month');
  }

  const nextYear = monthNumber === 12 ? year + 1 : year;

  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;

  const periodStart = zonedMidnightToUtc(year, monthNumber, 1, timeZone);

  const periodEnd = zonedMidnightToUtc(nextYear, nextMonth, 1, timeZone);

  return {
    month,
    periodStart,
    periodEnd,
  };
}

function niceTestLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

type BillingSourceItem = {
  itemKey: string;
  itemLabel: string;
  sourceKey: string | null;
  sourceValue: string | null;
};

function normalizeBillingIdentity(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractSelectedActives(actives: any): BillingSourceItem[] {
  if (!Array.isArray(actives)) {
    return [];
  }

  const byKey = new Map<string, BillingSourceItem>();

  for (const row of actives) {
    if (!row || (row.checked !== true && row.selected !== true)) {
      continue;
    }

    const sourceKey = String(
      row.key ??
        row.value ??
        row.activeKey ??
        row.label ??
        row.name ??
        row.active ??
        '',
    ).trim();

    const baseLabel = String(
      row.label ??
        row.name ??
        row.active ??
        sourceKey,
    ).trim();

    const otherName = String(
      row.otherName ??
        row.customName ??
        '',
    ).trim();

    const isOtherSlot =
      /^OTHER(?:_\d+)?$/i.test(sourceKey) ||
      /^OTHER(?:\s*\d+)?$/i.test(baseLabel);

    /*
     * OTHER / OTHER_2 are form slots, not semantic actives.
     *
     * If the user entered a custom active name, use that
     * name in the billing identity so the price follows the
     * actual active rather than whichever OTHER slot was used.
     */
    const itemLabel =
      isOtherSlot && otherName
        ? otherName
        : baseLabel || sourceKey;

    const normalizedSourceKey =
      normalizeBillingIdentity(sourceKey || itemLabel);

    const normalizedCustomName =
      normalizeBillingIdentity(itemLabel);

    const itemKey =
      isOtherSlot && otherName
        ? `OTHER_${normalizedCustomName}`
        : normalizedSourceKey;

    if (!itemKey || !itemLabel) {
      continue;
    }

    if (!byKey.has(itemKey)) {
      byKey.set(itemKey, {
        itemKey,
        itemLabel,
        sourceKey: sourceKey || null,
        sourceValue: otherName || null,
      });
    }
  }

  return [...byKey.values()];
}

function extractSelectedPathogens(
  pathogens: any,
): BillingSourceItem[] {
  if (!Array.isArray(pathogens)) {
    return [];
  }

  const byKey = new Map<string, BillingSourceItem>();

  for (const row of pathogens) {
    if (
      !row ||
      (row.checked !== true &&
        row.selected !== true)
    ) {
      continue;
    }

    const sourceKey = String(
      row.key ??
        row.value ??
        row.pathogenKey ??
        row.label ??
        row.name ??
        '',
    ).trim();

    const label = String(
      row.label ??
        row.name ??
        sourceKey,
    ).trim();

    if (!label && !sourceKey) {
      continue;
    }

    const normalizedSourceKey =
      normalizeBillingIdentity(
        sourceKey || label,
      );

    const normalizedLabel =
      normalizeBillingIdentity(label);

    const isOtherSlot =
      /^OTHER(?:_\d+)?$/i.test(
        sourceKey,
      );

    const isGenericOtherLabel =
      /^OTHER(?:\s*\d+)?$/i.test(
        label,
      );

    /*
     * The Micro forms use an editable OTHER row.
     *
     * If OTHER was renamed to a real pathogen/test organism,
     * use the actual name as the semantic billing identity.
     */
    const itemKey =
      isOtherSlot &&
      label &&
      !isGenericOtherLabel
        ? `OTHER_${normalizedLabel}`
        : normalizedSourceKey;

    const itemLabel =
      label || sourceKey;

    if (!itemKey || !itemLabel) {
      continue;
    }

    if (!byKey.has(itemKey)) {
      byKey.set(itemKey, {
        itemKey,
        itemLabel,
        sourceKey:
          sourceKey || null,
        sourceValue: null,
      });
    }
  }

  return [...byKey.values()];
}

function extractSelectedCoaItems(coaRows: any): BillingSourceItem[] {
  if (!Array.isArray(coaRows)) {
    return [];
  }

  const byKey = new Map<string, BillingSourceItem>();

  for (const row of coaRows) {
    if (!row) {
      continue;
    }

    /*
     * A COA item participates in billing only when that row
     * was actually selected/used by having a Specification.
     *
     * Support older/imported property names defensively.
     */
    const specification = String(
      row.Specification ??
        row.specification ??
        row.standard ??
        row.spec ??
        '',
    ).trim();

    if (!specification) {
      continue;
    }

    const sourceKey = String(
      row.key ??
        row.itemKey ??
        row.item ??
        '',
    ).trim();

    const itemLabel = String(
      row.item ??
        row.label ??
        sourceKey,
    ).trim();

    if (!itemLabel) {
      continue;
    }

    const normalizedSourceKey =
      normalizeBillingIdentity(sourceKey || itemLabel);

    const normalizedLabel =
      normalizeBillingIdentity(itemLabel);

    const isOtherSlot =
      /^OTHER(?:_\d+)?$/i.test(sourceKey);

    const isGenericOtherLabel =
      /^OTHER(?:\s*\d+)?$/i.test(itemLabel);

    /*
     * OTHER_1 ... OTHER_12 are positional slots.
     *
     * If an OTHER row was renamed to a real test/item,
     * use the real name as the semantic billing identity.
     */
    const itemKey =
      isOtherSlot && !isGenericOtherLabel
        ? `OTHER_${normalizedLabel}`
        : normalizedSourceKey;

    if (!itemKey) {
      continue;
    }

    if (!byKey.has(itemKey)) {
      byKey.set(itemKey, {
        itemKey,
        itemLabel,
        sourceKey: sourceKey || null,
        sourceValue: specification,
      });
    }
  }

  return [...byKey.values()];
}

function parseDeclaredActiveCount(value: any): number | null {
  if (value == null || value === '') {
    return null;
  }

  const n = Number(String(value).trim());

  if (!Number.isInteger(n) || n < 1) {
    return null;
  }

  return n;
}

/* =========================================================
   SERVICE
========================================================= */

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly pricing: BillingPricingService,
  ) {}

  /* =======================================================
     AUTHORIZATION
  ======================================================= */

  private assertReader(user: AuthUser) {
    if (!['FRONTDESK', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('You do not have access to billing');
    }
  }

  private assertManager(user: AuthUser) {
    if (!['ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEMADMIN can modify or confirm invoices',
      );
    }
  }

  /* =======================================================
     AUDIT
  ======================================================= */

  private async auditInvoice(
    user: AuthUser,
    args: {
      action: string;
      invoiceId: string;
      clientCode: string;
      details: string;
      changes?: Record<string, any>;
    },
  ) {
    const ctx = getRequestContext();

    await this.prisma.auditTrail.create({
      data: {
        action: args.action,

        entity: 'BILLING_INVOICE',

        entityId: args.invoiceId,

        userId: user.userId,

        role: user.role,

        ipAddress: ctx?.ip ?? null,

        clientCode: args.clientCode,

        details: args.details,

        changes: (args.changes ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /* =======================================================
   MONEY
======================================================= */

  private parseMoney(
    value: number | string,
    fieldName: string,
    options?: {
      allowNegative?: boolean;
    },
  ) {
    const raw = String(value ?? '').trim();

    if (!raw) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    try {
      const amount = new Prisma.Decimal(raw);

      if (!options?.allowNegative && amount.lt(0)) {
        throw new BadRequestException(`${fieldName} cannot be negative`);
      }

      return amount.toDecimalPlaces(2);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `${fieldName} must be a valid monetary amount`,
      );
    }
  }

  /* =======================================================
   TOTAL RECALCULATION
======================================================= */

  private async recalculateInvoiceTotals(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ) {
    const invoice = await tx.billingInvoice.findUnique({
      where: {
        id: invoiceId,
      },

      select: {
        id: true,
        status: true,
        adjustmentAmount: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT invoices can be recalculated');
    }

    const [
      lineAggregate,
      manualLineAggregate,
      extraChargeAggregate,
    ] = await Promise.all([
      tx.billingInvoiceLine.aggregate({
        where: {
          invoiceId,
        },

        _sum: {
          amount: true,
        },
      }),

      tx.billingManualInvoiceLine.aggregate({
        where: {
          invoiceId,
        },

        _sum: {
          amount: true,
        },
      }),

      tx.billingInvoiceExtraCharge.aggregate({
        where: {
          invoiceId,
        },

        _sum: {
          amount: true,
        },
      }),
    ]);

    const lineSubtotal =
      lineAggregate._sum.amount ?? new Prisma.Decimal(0);

    const manualLineSubtotal =
      manualLineAggregate._sum.amount ?? new Prisma.Decimal(0);

    const extraChargeSubtotal =
      extraChargeAggregate._sum.amount ?? new Prisma.Decimal(0);

    const subtotal = lineSubtotal
      .plus(manualLineSubtotal)
      .plus(extraChargeSubtotal)
      .toDecimalPlaces(2);

    const total = subtotal.plus(invoice.adjustmentAmount).toDecimalPlaces(2);

    if (total.lt(0)) {
      throw new BadRequestException('Invoice total cannot be negative');
    }

    return tx.billingInvoice.update({
      where: {
        id: invoiceId,
      },

      data: {
        subtotal,
        total,
      },
    });
  }

  /* =======================================================
     CANDIDATE PRICE
  ======================================================= */

  private priceCandidate(
    rules: BillingPriceRule[],
    candidate: Omit<
      BillingCandidate,
      | 'priceBasis'
      | 'quantity'
      | 'unitPrice'
      | 'amount'
      | 'pricingRuleId'
      | 'pricingIssue'
    > & {
      dataIssue?: string | null;
    },
  ): BillingCandidate {
    /*
     * Missing/invalid source data always wins over
     * the pricing lookup.
     */
    if (candidate.dataIssue) {
      return {
        ...candidate,

        priceBasis: 'FLAT',

        quantity: 1,

        unitPrice: null,
        amount: null,

        pricingRuleId: null,

        pricingIssue: candidate.dataIssue,
      };
    }

    const resolved = this.pricing.resolveFromRules(rules, {
      clientCode: candidate.clientCode,

      formType: candidate.formType,

      testKey: candidate.testKey,

      itemKey: candidate.itemKey,

      activeCount: candidate.activeCount,

      at: candidate.billingReadyAt,
    });

    return {
      ...candidate,
      ...resolved,
    };
  }

  /* =======================================================
     MICRO CANDIDATES
  ======================================================= */

  private buildMicroCandidates(
    reports: any[],
    rules: BillingPriceRule[],
    clientStartMap: Map<string, Date | null>,
  ): BillingCandidate[] {
    const items: BillingCandidate[] = [];

    for (const report of reports) {
      const clientCode = String(
        report.clientCode ?? '',
      )
        .trim()
        .toUpperCase();

      if (
        !clientCode ||
        !report.billingReadyAt ||
        !report.reportNumber
      ) {
        continue;
      }

      const clientStart =
        clientStartMap.get(clientCode);

      if (
        clientStart &&
        report.billingReadyAt <
          clientStart
      ) {
        continue;
      }

      const details =
        report.microMix ??
        report.microMixWater ??
        report.sterility ??
        report.ape ??
        null;

      const rawTypeOfTest =
        String(
          details?.typeOfTest ?? '',
        ).trim();

      const testKey =
        rawTypeOfTest
          ? this.pricing.normalizeTestKey(
              rawTypeOfTest,
            )
          : 'UNSPECIFIED';

      const supportsPathogens =
        report.formType ===
          'MICRO_MIX' ||
        report.formType ===
          'MICRO_MIX_WATER';

      const selectedPathogens =
        supportsPathogens
          ? extractSelectedPathogens(
              details?.pathogens,
            )
          : [];

      /*
       * MICRO_MIX / MICRO_MIX_WATER
       *
       * If pathogens were selected, price each exact
       * Type-of-Test + Pathogen combination individually.
       *
       * Example:
       *
       * USP_61_62 + E_COLI
       * USP_61_62 + P_AER
       *
       * This mirrors Chemistry's Test Type + Active pricing.
       */
      if (
        supportsPathogens &&
        selectedPathogens.length > 0
      ) {
        for (
          const pathogen of selectedPathogens
        ) {
          const candidate =
            this.priceCandidate(
              rules,
              {
                sourceType:
                  'REPORT',

                sourceId:
                  report.id,

                chargeKey:
                  `REPORT:${report.id}:${report.formType}:${testKey}:PATHOGEN:${pathogen.itemKey}`,

                formType:
                  report.formType,

                formNumber:
                  report.formNumber,

                reportNumber:
                  report.reportNumber,

                clientCode,

                resultSentToClientAt:
                  report.resultSentToClientAt ??
                  null,

                billingReadyAt:
                  report.billingReadyAt,

                testKey,

                testLabel:
                  rawTypeOfTest ||
                  null,

                itemKey:
                  pathogen.itemKey,

                itemLabel:
                  pathogen.itemLabel,

                activeCount:
                  null,

                sourceSnapshot: {
                  typeOfTest:
                    rawTypeOfTest ||
                    null,

                  client:
                    details?.client ??
                    null,

                  description:
                    details?.description ??
                    null,

                  pathogenKey:
                    pathogen.itemKey,

                  pathogenLabel:
                    pathogen.itemLabel,

                  sourcePathogenKey:
                    pathogen.sourceKey,

                  selectedPathogens:
                    selectedPathogens.map(
                      (item) => ({
                        itemKey:
                          item.itemKey,

                        itemLabel:
                          item.itemLabel,
                      }),
                    ),
                },

                dataIssue:
                  rawTypeOfTest
                    ? null
                    : 'Missing Type of Test',
              },
            );

          items.push(candidate);
        }

        continue;
      }

      /*
       * No pathogen selected:
       *
       * Keep the original Type-of-Test-only Micro charge.
       * This is important because pathogen selection is optional
       * in the Micro forms.
       *
       * STERILITY and APE also continue to use this path.
       */
      const chargeKey =
        `REPORT:${report.id}:${report.formType}`;

      const candidate =
        this.priceCandidate(
          rules,
          {
            sourceType:
              'REPORT',

            sourceId:
              report.id,

            chargeKey,

            formType:
              report.formType,

            formNumber:
              report.formNumber,

            reportNumber:
              report.reportNumber,

            clientCode,

            resultSentToClientAt:
              report.resultSentToClientAt ??
              null,

            billingReadyAt:
              report.billingReadyAt,

            testKey,

            testLabel:
              rawTypeOfTest ||
              null,

            itemKey:
              null,

            itemLabel:
              null,

            activeCount:
              null,

            sourceSnapshot: {
              typeOfTest:
                rawTypeOfTest ||
                null,

              client:
                details?.client ??
                null,

              description:
                details?.description ??
                null,

              selectedPathogens:
                selectedPathogens.map(
                  (item) => ({
                    itemKey:
                      item.itemKey,

                    itemLabel:
                      item.itemLabel,
                  }),
                ),
            },

            dataIssue:
              rawTypeOfTest
                ? null
                : 'Missing Type of Test',
          },
        );

      items.push(candidate);
    }

    return items;
  }

  /* =======================================================
     CHEMISTRY CANDIDATES
  ======================================================= */

  private buildChemistryCandidates(
    reports: any[],
    rules: BillingPriceRule[],
    clientStartMap: Map<string, Date | null>,
  ): BillingCandidate[] {
    const items: BillingCandidate[] = [];

    for (const report of reports) {
      const clientCode = String(report.clientCode ?? '')
        .trim()
        .toUpperCase();

      if (!clientCode || !report.billingReadyAt || !report.reportNumber) {
        continue;
      }

      const clientStart = clientStartMap.get(clientCode);

      if (clientStart && report.billingReadyAt < clientStart) {
        continue;
      }

      /* =====================================================
         COA
         One charge per selected COA row/item.
      ===================================================== */

      if (report.formType === 'COA') {
        const details = report.coa;

        const selectedItems =
          extractSelectedCoaItems(details?.coaRows);

        /*
         * No COA row selected -> keep the report visible as
         * a billing exception instead of silently dropping it.
         */
        if (selectedItems.length === 0) {
          const candidate = this.priceCandidate(rules, {
            sourceType: 'CHEMISTRY_REPORT',

            sourceId: report.id,

            chargeKey:
              `CHEMISTRY_REPORT:${report.id}:COA:UNSPECIFIED_ITEM`,

            formType: report.formType,

            formNumber: report.formNumber,

            reportNumber: report.reportNumber,

            clientCode,

            resultSentToClientAt:
              report.resultSentToClientAt ?? null,

            billingReadyAt: report.billingReadyAt,

            testKey: 'COA',

            testLabel: 'COA',

            itemKey: null,

            itemLabel: null,

            activeCount: null,

            sourceSnapshot: {
              client: details?.client ?? null,

              description:
                details?.sampleDescription ??
                details?.description ??
                null,

              coaRows: Array.isArray(details?.coaRows)
                ? details.coaRows
                : [],
            },

            dataIssue:
              'No COA item has a Specification',
          });

          items.push(candidate);

          continue;
        }

        for (const selectedItem of selectedItems) {
          const candidate = this.priceCandidate(rules, {
            sourceType: 'CHEMISTRY_REPORT',

            sourceId: report.id,

            /*
             * Individual COA item = individual billable charge.
             */
            chargeKey:
              `CHEMISTRY_REPORT:${report.id}:COA:${selectedItem.itemKey}`,

            formType: report.formType,

            formNumber: report.formNumber,

            reportNumber: report.reportNumber,

            clientCode,

            resultSentToClientAt:
              report.resultSentToClientAt ?? null,

            billingReadyAt: report.billingReadyAt,

            testKey: 'COA',

            testLabel: 'COA',

            itemKey: selectedItem.itemKey,

            itemLabel: selectedItem.itemLabel,

            activeCount: null,

            sourceSnapshot: {
              client: details?.client ?? null,

              description:
                details?.sampleDescription ??
                details?.description ??
                null,

              coaItemKey:
                selectedItem.itemKey,

              coaItemLabel:
                selectedItem.itemLabel,

              sourceRowKey:
                selectedItem.sourceKey,

              specification:
                selectedItem.sourceValue,
            },

            dataIssue: null,
          });

          items.push(candidate);
        }

        continue;
      }

      /* =====================================================
         CHEMISTRY MIX
         One charge for every:
           selected Test Type × selected Active
      ===================================================== */

      const details = report.chemistryMix;

      const rawTestTypes: unknown[] =
        Array.isArray(details?.testTypes)
          ? details.testTypes
          : [];

      /*
       * Deduplicate by normalized billing key while keeping a
       * readable label from the source.
       */
      const testTypeMap =
        new Map<string, string>();

      for (const value of rawTestTypes) {
        const raw = String(value ?? '').trim();

        if (!raw) {
          continue;
        }

        const normalized =
          this.pricing.normalizeTestKey(raw);

        if (
          normalized &&
          !testTypeMap.has(normalized)
        ) {
          testTypeMap.set(
            normalized,
            raw,
          );
        }
      }

      const testTypes =
        [...testTypeMap.entries()].map(
          ([testKey, rawValue]) => ({
            testKey,
            rawValue,
          }),
        );

      const selectedActives =
        extractSelectedActives(details?.actives);

      const declaredCount =
        parseDeclaredActiveCount(
          details?.numberOfActives,
        );

      /*
       * Missing Test Type -> one source-level exception.
       */
      if (testTypes.length === 0) {
        const candidate = this.priceCandidate(rules, {
          sourceType: 'CHEMISTRY_REPORT',

          sourceId: report.id,

          chargeKey:
            `CHEMISTRY_REPORT:${report.id}:UNSPECIFIED:UNSPECIFIED_ITEM`,

          formType: report.formType,

          formNumber: report.formNumber,

          reportNumber: report.reportNumber,

          clientCode,

          resultSentToClientAt:
            report.resultSentToClientAt ?? null,

          billingReadyAt: report.billingReadyAt,

          testKey: 'UNSPECIFIED',

          testLabel: null,

          itemKey: null,

          itemLabel: null,

          activeCount: null,

          sourceSnapshot: {
            description:
              details?.sampleDescription ??
                details?.description ??
                null,

            testTypes: [],
            selectedActives,
            declaredActiveCount: declaredCount,
            numberOfActives:
              details?.numberOfActives ?? null,
          },

          dataIssue:
            'Missing Chemistry Type of Test',
        });

        items.push(candidate);

        continue;
      }

      /*
       * New individual-active pricing cannot guess which
       * active was tested from numberOfActives alone.
       *
       * Old/imported records without selected active rows are
       * surfaced as pricing/data exceptions.
       */
      if (selectedActives.length === 0) {
        for (const testType of testTypes) {
          const candidate = this.priceCandidate(rules, {
            sourceType: 'CHEMISTRY_REPORT',

            sourceId: report.id,

            chargeKey:
              `CHEMISTRY_REPORT:${report.id}:${testType.testKey}:UNSPECIFIED_ITEM`,

            formType: report.formType,

            formNumber: report.formNumber,

            reportNumber: report.reportNumber,

            clientCode,

            resultSentToClientAt:
              report.resultSentToClientAt ?? null,

            billingReadyAt: report.billingReadyAt,

            testKey: testType.testKey,

            testLabel:
              niceTestLabel(
                testType.rawValue,
              ),

            itemKey: null,

            itemLabel: null,

            activeCount: null,

            sourceSnapshot: {
              description:
                details?.sampleDescription ??
                details?.description ??
                null,

              testType:
                testType.rawValue,

              selectedActives: [],

              declaredActiveCount:
                declaredCount,

              numberOfActives:
                details?.numberOfActives ?? null,
            },

            dataIssue:
              declaredCount
                ? `No selected Chemistry active data found; ${declaredCount} active(s) were declared`
                : 'No Chemistry active selected',
          });

          items.push(candidate);
        }

        continue;
      }

      /*
       * The selected rows are the billing source of truth.
       *
       * numberOfActives is kept in sourceSnapshot only.
       * A mismatch no longer changes quantity or blocks the
       * charge because pricing is now per exact selected item.
       */
      for (const testType of testTypes) {
        for (const selectedActive of selectedActives) {
          const candidate = this.priceCandidate(rules, {
            sourceType: 'CHEMISTRY_REPORT',

            sourceId: report.id,

            chargeKey:
              `CHEMISTRY_REPORT:${report.id}:${testType.testKey}:${selectedActive.itemKey}`,

            formType: report.formType,

            formNumber: report.formNumber,

            reportNumber: report.reportNumber,

            clientCode,

            resultSentToClientAt:
              report.resultSentToClientAt ?? null,

            billingReadyAt: report.billingReadyAt,

            testKey:
              testType.testKey,

            testLabel:
              niceTestLabel(
                testType.rawValue,
              ),

            itemKey:
              selectedActive.itemKey,

            itemLabel:
              selectedActive.itemLabel,

            /*
             * New item pricing is FLAT quantity 1.
             * activeCount remains null.
             */
            activeCount: null,

            sourceSnapshot: {
              description:
                details?.sampleDescription ??
                details?.description ??
                null,

              testType:
                testType.rawValue,

              itemKey:
                selectedActive.itemKey,

              itemLabel:
                selectedActive.itemLabel,

              sourceActiveKey:
                selectedActive.sourceKey,

              sourceActiveValue:
                selectedActive.sourceValue,

              selectedActives:
                selectedActives.map(
                  (active) => ({
                    itemKey:
                      active.itemKey,

                    itemLabel:
                      active.itemLabel,
                  }),
                ),

              declaredActiveCount:
                declaredCount,

              numberOfActives:
                details?.numberOfActives ?? null,

              selectedActiveCount:
                selectedActives.length,

              declaredCountMatchesSelection:
                declaredCount == null
                  ? null
                  : declaredCount ===
                    selectedActives.length,
            },

            dataIssue: null,
          });

          items.push(candidate);
        }
      }
    }

    return items;
  }

  /* =======================================================
     DISCOVER UNBILLED
  ======================================================= */

  private async discoverUnbilled(
    user: AuthUser,
    query: {
      month?: string;
      clientCode?: string;
    },
  ) {
    this.assertReader(user);

    const { month, periodStart, periodEnd } = getMonthRange(
      query.month,
      DEFAULT_BILLING_TIME_ZONE,
    );

    const requestedClient = query.clientCode
      ? String(query.clientCode).trim().toUpperCase()
      : null;

    /*
     * Only enabled/active clients participate.
     */
    const clients = await this.prisma.clientDetails.findMany({
      where: {
        active: true,

        billingEnabled: true,

        ...(requestedClient
          ? {
              clientCode: requestedClient,
            }
          : {}),
      },

      select: {
        clientCode: true,
        billingStartAt: true,
      },
    });

    const clientCodes = clients.map((client) => client.clientCode);

    const clientStartMap = new Map<string, Date | null>(
      clients.map((client) => [
        client.clientCode,
        client.billingStartAt ?? null,
      ]),
    );

    if (clientCodes.length === 0) {
      return {
        month,
        periodStart,
        periodEnd,
        candidates: [] as BillingCandidate[],
      };
    }

    /*
     * Fetch all price rules once.
     * Avoid N database queries for N reports.
     */
    const rules = await this.pricing.getRulesForPeriod(
      clientCodes,
      periodStart,
      periodEnd,
    );

    /*
     * ROOT MICRO reports only.
     *
     * parentReportId=null and reportType=null explicitly
     * exclude APE child outputs.
     */
    const microReports = await this.prisma.report.findMany({
      where: {
        clientCode: {
          in: clientCodes,
        },

        billingReadyAt: {
          gte: periodStart,
          lt: periodEnd,
        },

        reportNumber: {
          not: null,
        },

        status: {
          not: 'VOID',
        },

        parentReportId: null,

        reportType: null,

        formType: {
          in: ['MICRO_MIX', 'MICRO_MIX_WATER', 'STERILITY', 'APE'],
        },
      },

      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
      },

      orderBy: {
        billingReadyAt: 'asc',
      },
    });

    const chemistryReports = await this.prisma.chemistryReport.findMany({
      where: {
        clientCode: {
          in: clientCodes,
        },

        billingReadyAt: {
          gte: periodStart,
          lt: periodEnd,
        },

        reportNumber: {
          not: null,
        },

        status: {
          not: 'VOID',
        },

        formType: {
          in: ['CHEMISTRY_MIX', 'COA'],
        },
      },

      include: {
        chemistryMix: true,
        coa: true,
      },

      orderBy: {
        billingReadyAt: 'asc',
      },
    });

    let candidates = [
      ...this.buildMicroCandidates(microReports, rules, clientStartMap),

      ...this.buildChemistryCandidates(chemistryReports, rules, clientStartMap),
    ];

    /*
     * Remove anything already captured by its exact chargeKey.
     */
    const chargeKeys =
      candidates.map(
        (item) =>
          item.chargeKey,
      );

    const alreadyCaptured =
      new Set<string>();

    if (chargeKeys.length > 0) {
      const activeLines =
        await this.prisma.billingInvoiceLine.findMany({
          where: {
            activeChargeKey: {
              in: chargeKeys,
            },
          },

          select: {
            activeChargeKey: true,
          },
        });

      for (const line of activeLines) {
        if (line.activeChargeKey) {
          alreadyCaptured.add(
            line.activeChargeKey,
          );
        }
      }
    }

    /*
     * Rollout safety for invoices generated BEFORE
     * individual item pricing existed.
     *
     * Old Chemistry/COA lines have itemKey = null and charge
     * keys such as:
     *
     * CHEMISTRY_REPORT:<id>:PERCENT_ASSAY
     * CHEMISTRY_REPORT:<id>:COA
     *
     * If such a line is already on a CONFIRMED/SENT invoice,
     * that source was historically billed and MUST NOT be
     * billed again as new itemized charges.
     *
     * If the old line is only on a DRAFT invoice we allow the
     * new candidates through; generateDraftInvoices() safely
     * replaces those legacy draft lines.
     */
    const itemizedChemistrySourceIds =
      Array.from(
        new Set(
          candidates
            .filter(
              (item) =>
                item.sourceType ===
                  'CHEMISTRY_REPORT' &&
                item.itemKey != null,
            )
            .map(
              (item) =>
                item.sourceId,
            ),
        ),
      );

    const itemizedMicroSourceIds =
      Array.from(
        new Set(
          candidates
            .filter(
              (item) =>
                item.sourceType ===
                  'REPORT' &&
                item.itemKey != null,
            )
            .map(
              (item) =>
                item.sourceId,
            ),
        ),
      );

    const finalizedLegacyMicroSources =
      new Set<string>();

    if (
      itemizedMicroSourceIds.length >
      0
    ) {
      const legacyMicroLines =
        await this.prisma.billingInvoiceLine.findMany({
          where: {
            sourceType:
              'REPORT',

            sourceId: {
              in:
                itemizedMicroSourceIds,
            },

            itemKey:
              null,

            activeChargeKey: {
              not: null,
            },
          },

          select: {
            sourceId: true,

            invoice: {
              select: {
                status: true,
              },
            },
          },
        });

      for (
        const line of legacyMicroLines
      ) {
        if (
          line.invoice.status ===
            'CONFIRMED' ||
          line.invoice.status ===
            'SENT'
        ) {
          finalizedLegacyMicroSources.add(
            line.sourceId,
          );
        }
      }
    }

    const finalizedLegacySources =
      new Set<string>();

    if (
      itemizedChemistrySourceIds.length >
      0
    ) {
      const legacyLines =
        await this.prisma.billingInvoiceLine.findMany({
          where: {
            sourceType:
              'CHEMISTRY_REPORT',

            sourceId: {
              in:
                itemizedChemistrySourceIds,
            },

            itemKey: null,

            activeChargeKey: {
              not: null,
            },
          },

          select: {
            sourceId: true,

            invoice: {
              select: {
                status: true,
              },
            },
          },
        });

      for (const line of legacyLines) {
        if (
          line.invoice.status ===
            'CONFIRMED' ||
          line.invoice.status ===
            'SENT'
        ) {
          finalizedLegacySources.add(
            line.sourceId,
          );
        }
      }
    }

    candidates =
      candidates.filter(
        (item) =>
          !alreadyCaptured.has(
            item.chargeKey,
          ) &&
          !(
            item.sourceType ===
              'CHEMISTRY_REPORT' &&
            item.itemKey != null &&
            finalizedLegacySources.has(
              item.sourceId,
            )
          ) &&
          !(
            item.sourceType ===
              'REPORT' &&
            item.itemKey != null &&
            finalizedLegacyMicroSources.has(
              item.sourceId,
            )
          ),
      );

    return {
      month,
      periodStart,
      periodEnd,
      candidates,
    };
  }

  /* =======================================================
     PUBLIC UNBILLED API
  ======================================================= */

  async getUnbilled(
    user: AuthUser,
    query: {
      month?: string;
      clientCode?: string;
    },
  ) {
    const result = await this.discoverUnbilled(user, query);

    let estimatedSubtotal = new Prisma.Decimal(0);

    let exceptionCount = 0;

    for (const item of result.candidates) {
      if (item.amount) {
        estimatedSubtotal = estimatedSubtotal.plus(item.amount);
      }

      if (item.pricingIssue) {
        exceptionCount += 1;
      }
    }

    return {
      month: result.month,

      timeZone: DEFAULT_BILLING_TIME_ZONE,

      periodStart: result.periodStart,

      periodEndExclusive: result.periodEnd,

      count: result.candidates.length,

      exceptionCount,

      estimatedSubtotal: estimatedSubtotal.toFixed(2),

      items: result.candidates.map((item) => ({
        ...item,

        unitPrice: item.unitPrice ? item.unitPrice.toFixed(2) : null,

        amount: item.amount ? item.amount.toFixed(2) : null,
      })),
    };
  }

  /* =======================================================
     GENERATE DRAFT INVOICES
  ======================================================= */

  async generateDraftInvoices(user: AuthUser, dto: GenerateInvoicesDto) {
    this.assertReader(user);

    const discovery = await this.discoverUnbilled(user, dto);

    /*
     * DRAFT GENERATION SAFETY
     * -------------------------------------------------------
     * A charge is READY only when:
     *   - pricingIssue is empty
     *   - unitPrice is resolved
     *   - amount is resolved
     *
     * A source report is treated atomically.
     * If one pathogen / active / COA item from that report
     * is not READY, the whole report stays in Unbilled.
     */
    const candidatesBySource =
      new Map<string, BillingCandidate[]>();

    for (const item of discovery.candidates) {
      const sourceKey =
        `${item.sourceType}:${item.sourceId}`;

      const current =
        candidatesBySource.get(sourceKey) ?? [];

      current.push(item);

      candidatesBySource.set(
        sourceKey,
        current,
      );
    }

    const readyCandidates: BillingCandidate[] = [];

    let skippedNotReadySources = 0;
    let skippedNotReadyCharges = 0;

    for (
      const sourceLines of
      candidatesBySource.values()
    ) {
      const sourceReady =
        sourceLines.every(
          (line) =>
            !line.pricingIssue &&
            line.unitPrice != null &&
            line.amount != null,
        );

      if (!sourceReady) {
        skippedNotReadySources += 1;
        skippedNotReadyCharges +=
          sourceLines.length;
        continue;
      }

      readyCandidates.push(
        ...sourceLines,
      );
    }

    const groups =
      new Map<string, BillingCandidate[]>();

    for (const item of readyCandidates) {
      const current =
        groups.get(item.clientCode) ?? [];

      current.push(item);

      groups.set(
        item.clientCode,
        current,
      );
    }

    const results: any[] = [];

    for (const [clientCode, lines] of groups.entries()) {
      const activeKey = `${clientCode}:${discovery.month}`;

      const transactionResult = await this.prisma.$transaction(async (tx) => {
        /*
         * There may be only ONE open DRAFT slot per client/month.
         *
         * IMPORTANT:
         * A previously CONFIRMED/SENT invoice must NOT keep the
         * monthly activeKey lock. Otherwise any report that becomes
         * Ready later in the same month can never enter a new draft.
         *
         * Historical invoices remain immutable; we only release the
         * activeKey slot so a new DRAFT can be created.
         */
        let invoice =
          await tx.billingInvoice.findUnique({
            where: {
              activeKey,
            },
          });

        let releasedClosedInvoiceId:
          | string
          | null = null;

        if (
          invoice &&
          invoice.status !== 'DRAFT'
        ) {
          releasedClosedInvoiceId =
            invoice.id;

          await tx.billingInvoice.update({
            where: {
              id: invoice.id,
            },

            data: {
              activeKey: null,

              updatedBy:
                user.userId,
            },
          });

          invoice = null;
        }

        if (!invoice) {
          invoice =
            await tx.billingInvoice.create({
              data: {
                activeKey,

                clientCode,

                periodStart:
                  discovery.periodStart,

                periodEnd:
                  discovery.periodEnd,

                status:
                  'DRAFT',

                invoiceKind:
                  'REPORT',

                createdBy:
                  user.userId,

                updatedBy:
                  user.userId,
              },
            });
        }

        /*
         * Transition old DRAFT Chemistry/COA lines to the new
         * itemized structure.
         *
         * We only replace legacy itemKey=null lines when the
         * current discovery produced exact itemized candidates
         * for that same source.
         *
         * IMPORTANT:
         *
         * A DRAFT invoice is still rebuildable. If an old
         * generic Chemistry/COA draft line had a manual price
         * override, that override belonged to the OLD pricing
         * structure and cannot be mapped safely across multiple
         * new itemized lines.
         *
         * Therefore Generate Drafts intentionally removes the
         * old legacy DRAFT line and recreates the source using
         * the current itemized pricing model.
         *
         * CONFIRMED/SENT invoices are never handled here and
         * remain protected/immutable.
         */
        const itemizedChemistrySourceIds =
          Array.from(
            new Set(
              lines
                .filter(
                  (line) =>
                    line.sourceType ===
                      'CHEMISTRY_REPORT' &&
                    line.itemKey != null,
                )
                .map(
                  (line) =>
                    line.sourceId,
                ),
            ),
          );

        const itemizedMicroSourceIds =
          Array.from(
            new Set(
              lines
                .filter(
                  (line) =>
                    line.sourceType ===
                      'REPORT' &&
                    line.itemKey != null,
                )
                .map(
                  (line) =>
                    line.sourceId,
                ),
            ),
          );

        let legacyLinesReplaced = 0;
        let legacyManualOverridesReplaced = 0;

        if (
          itemizedChemistrySourceIds.length >
          0
        ) {
          const legacyDraftLines =
            await tx.billingInvoiceLine.findMany({
              where: {
                invoiceId:
                  invoice.id,

                sourceType:
                  'CHEMISTRY_REPORT',

                sourceId: {
                  in:
                    itemizedChemistrySourceIds,
                },

                itemKey:
                  null,

                activeChargeKey: {
                  not: null,
                },
              },

              select: {
                id: true,
                sourceId: true,
                formNumber: true,
                reportNumber: true,
                testKey: true,
                manualOverride: true,
              },
            });

          legacyManualOverridesReplaced =
            legacyDraftLines.filter(
              (line) =>
                line.manualOverride,
            ).length;

          if (
            legacyDraftLines.length >
            0
          ) {
            const deleted =
              await tx.billingInvoiceLine.deleteMany({
                where: {
                  id: {
                    in:
                      legacyDraftLines.map(
                        (line) =>
                          line.id,
                      ),
                  },
                },
              });

            legacyLinesReplaced =
              deleted.count;
          }
        }

        if (
          itemizedMicroSourceIds.length >
          0
        ) {
          const legacyMicroDraftLines =
            await tx.billingInvoiceLine.findMany({
              where: {
                invoiceId:
                  invoice.id,

                sourceType:
                  'REPORT',

                sourceId: {
                  in:
                    itemizedMicroSourceIds,
                },

                itemKey:
                  null,

                activeChargeKey: {
                  not: null,
                },
              },

              select: {
                id: true,
                manualOverride: true,
              },
            });

          legacyManualOverridesReplaced +=
            legacyMicroDraftLines.filter(
              (line) =>
                line.manualOverride,
            ).length;

          if (
            legacyMicroDraftLines.length >
            0
          ) {
            const deleted =
              await tx.billingInvoiceLine.deleteMany({
                where: {
                  id: {
                    in:
                      legacyMicroDraftLines.map(
                        (line) =>
                          line.id,
                      ),
                  },
                },
              });

            legacyLinesReplaced +=
              deleted.count;
          }
        }

        const createData = lines.map((line) => ({
          invoiceId: invoice.id,

          sourceType: line.sourceType,

          sourceId: line.sourceId,

          chargeKey: line.chargeKey,

          activeChargeKey: line.chargeKey,

          formType: line.formType,

          formNumber: line.formNumber,

          reportNumber: line.reportNumber,

          clientCode: line.clientCode,

          resultSentToClientAt: line.resultSentToClientAt,

          billingReadyAt: line.billingReadyAt,

          testKey: line.testKey,

          testLabel: line.testLabel,

          itemKey: line.itemKey,

          itemLabel: line.itemLabel,

          activeCount: line.activeCount,

          priceBasis: line.priceBasis,

          quantity: line.quantity,

          unitPrice: line.unitPrice,

          amount: line.amount,

          pricingRuleId: line.pricingRuleId,

          pricingIssue: line.pricingIssue,

          sourceSnapshot: line.sourceSnapshot,
        }));

        const created = createData.length
          ? await tx.billingInvoiceLine.createMany({
              data: createData,

              /*
               * activeChargeKey is UNIQUE.
               * This is another layer of duplicate
               * billing protection.
               */
              skipDuplicates: true,
            })
          : {
              count: 0,
            };

        /*
         * Always recalculate totals from persisted lines.
         * Never trust totals supplied by frontend.
         */
        const persistedLines = await tx.billingInvoiceLine.findMany({
          where: {
            invoiceId: invoice.id,
          },

          select: {
            amount: true,
          },
        });

        let subtotal = new Prisma.Decimal(0);

        for (const persistedLine of persistedLines) {
          if (persistedLine.amount) {
            subtotal = subtotal.plus(persistedLine.amount);
          }
        }

        const total = subtotal.plus(invoice.adjustmentAmount);

        const updated = await tx.billingInvoice.update({
          where: {
            id: invoice.id,
          },

          data: {
            subtotal,
            total,

            updatedBy: user.userId,
          },
        });

        return {
          invoice: updated,

          skipped: false,

          added: created.count,

          legacyLinesReplaced,

          legacyManualOverridesReplaced,

          releasedClosedInvoiceId,
        };
      });

      if (!transactionResult.skipped) {
        await this.auditInvoice(user, {
          action: 'INVOICE_DRAFT_CREATED',

          invoiceId: transactionResult.invoice.id,

          clientCode,

          details: `Generated billing draft for ${clientCode} / ${discovery.month}`,

          changes: {
            month: discovery.month,

            linesAdded: transactionResult.added,

            legacyLinesReplaced:
              transactionResult.legacyLinesReplaced,

            legacyManualOverridesReplaced:
              transactionResult.legacyManualOverridesReplaced,

            releasedClosedInvoiceId:
              transactionResult.releasedClosedInvoiceId,
          },
        });
      }

      results.push({
        invoiceId: transactionResult.invoice.id,

        clientCode,

        status: transactionResult.invoice.status,

        skipped: transactionResult.skipped,

        linesAdded: transactionResult.added,

        legacyLinesReplaced:
          transactionResult.legacyLinesReplaced,

        legacyManualOverridesReplaced:
          transactionResult.legacyManualOverridesReplaced,

        releasedClosedInvoiceId:
          transactionResult.releasedClosedInvoiceId,

        subtotal: transactionResult.invoice.subtotal.toFixed(2),

        total: transactionResult.invoice.total.toFixed(2),
      });
    }

    return {
      month: discovery.month,

      invoices: results,

      invoiceCount: results.length,

      readyChargeCount:
        readyCandidates.length,

      skippedNotReadySources,

      skippedNotReadyCharges,
    };
  }

  /* =======================================================
   REFRESH INVOICE PRICING
======================================================= */
  async refreshInvoicePricing(user: AuthUser, invoiceId: string) {
    /*
     * FRONTDESK may refresh because this only applies
     * existing configured pricing rules.
     *
     * It cannot choose arbitrary prices.
     */
    this.assertReader(user);

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: {
        id: invoiceId,
      },

      include: {
        lines: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT invoices can refresh pricing');
    }

    const rules = await this.pricing.getRulesForPeriod(
      [invoice.clientCode],
      invoice.periodStart,
      invoice.periodEnd,
    );

    let refreshedCount = 0;
    let manualOverrideCount = 0;

    await this.prisma.$transaction(async (tx) => {
      /*
       * Recheck status inside transaction.
       */
      const current = await tx.billingInvoice.findUnique({
        where: {
          id: invoiceId,
        },

        select: {
          status: true,
        },
      });

      if (!current || current.status !== 'DRAFT') {
        throw new BadRequestException('Invoice is no longer editable');
      }

      for (const line of invoice.lines) {
        /*
         * NEVER overwrite manual pricing.
         */
        if (line.manualOverride) {
          manualOverrideCount += 1;
          continue;
        }

        const resolved = this.pricing.resolveFromRules(rules, {
          clientCode: line.clientCode,

          formType: line.formType,

          testKey: line.testKey,

          itemKey: line.itemKey,

          activeCount: line.activeCount,

          at: line.billingReadyAt,
        });

        await tx.billingInvoiceLine.update({
          where: {
            id: line.id,
          },

          data: {
            priceBasis: resolved.priceBasis,

            quantity: resolved.quantity,

            unitPrice: resolved.unitPrice,

            amount: resolved.amount,

            pricingRuleId: resolved.pricingRuleId,

            pricingIssue: resolved.pricingIssue,
          },
        });

        refreshedCount += 1;
      }

      await this.recalculateInvoiceTotals(tx, invoiceId);

      await tx.billingInvoice.update({
        where: {
          id: invoiceId,
        },

        data: {
          updatedBy: user.userId,
        },
      });
    });

    await this.auditInvoice(user, {
      action: 'INVOICE_PRICING_REFRESHED',

      invoiceId,

      clientCode: invoice.clientCode,

      details: 'Refreshed invoice pricing from configured pricing rules',

      changes: {
        refreshedCount,
        manualOverrideCount,
      },
    });

    return this.getInvoice(user, invoiceId);
  }

  /* =======================================================
   MANUAL LINE PRICE OVERRIDE
======================================================= */

  async overrideInvoiceLine(
    user: AuthUser,
    invoiceId: string,
    lineId: string,
    dto: UpdateInvoiceLineDto,
  ) {
    this.assertManager(user);

    const reason = String(dto.reason ?? '').trim();

    if (reason.length < 3) {
      throw new BadRequestException('Manual override reason is required');
    }

    const unitPrice = this.parseMoney(dto.unitPrice, 'unitPrice');

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.findUnique({
        where: {
          id: invoiceId,
        },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT invoices can be edited');
      }

      const line = await tx.billingInvoiceLine.findUnique({
        where: {
          id: lineId,
        },
      });

      if (!line || line.invoiceId !== invoiceId) {
        throw new NotFoundException('Invoice line not found');
      }

      const quantity = new Prisma.Decimal(String(line.quantity ?? 1));

      const amount = unitPrice.mul(quantity).toDecimalPlaces(2);

      await tx.billingInvoiceLine.update({
        where: {
          id: lineId,
        },

        data: {
          unitPrice,
          amount,

          pricingRuleId: null,

          pricingIssue: null,

          manualOverride: true,

          manualOverrideReason: reason,

          manualOverrideBy: user.userId,

          manualOverrideAt: new Date(),
        },
      });

      await this.recalculateInvoiceTotals(tx, invoiceId);

      await tx.billingInvoice.update({
        where: {
          id: invoiceId,
        },

        data: {
          updatedBy: user.userId,
        },
      });

      return {
        clientCode: invoice.clientCode,

        amount,
      };
    });

    await this.auditInvoice(user, {
      action: 'INVOICE_LINE_PRICE_OVERRIDDEN',

      invoiceId,

      clientCode: result.clientCode,

      details: `Manual price override for invoice line ${lineId}`,

      changes: {
        lineId,

        unitPrice: unitPrice.toFixed(2),

        amount: result.amount.toFixed(2),

        reason,
      },
    });

    return this.getInvoice(user, invoiceId);
  }

  /* =======================================================
   UPDATE DRAFT
======================================================= */

  async updateInvoiceDraft(
    user: AuthUser,
    invoiceId: string,
    dto: UpdateInvoiceDraftDto,
  ) {
    this.assertManager(user);

    const adjustmentAmount =
      dto.adjustmentAmount !== undefined
        ? this.parseMoney(dto.adjustmentAmount, 'adjustmentAmount', {
            allowNegative: true,
          })
        : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.findUnique({
        where: {
          id: invoiceId,
        },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT invoices can be edited');
      }

      await tx.billingInvoice.update({
        where: {
          id: invoiceId,
        },

        data: {
          ...(adjustmentAmount !== undefined
            ? {
                adjustmentAmount,
              }
            : {}),

          ...(dto.notes !== undefined
            ? {
                notes: dto.notes?.trim() || null,
              }
            : {}),

          updatedBy: user.userId,
        },
      });

      await this.recalculateInvoiceTotals(tx, invoiceId);

      return {
        clientCode: invoice.clientCode,
      };
    });

    await this.auditInvoice(user, {
      action: 'INVOICE_DRAFT_UPDATED',

      invoiceId,

      clientCode: result.clientCode,

      details: 'Updated invoice draft',

      changes: {
        ...(adjustmentAmount !== undefined
          ? {
              adjustmentAmount: adjustmentAmount.toFixed(2),
            }
          : {}),

        ...(dto.notes !== undefined
          ? {
              notes: dto.notes?.trim() || null,
            }
          : {}),
      },
    });

    return this.getInvoice(user, invoiceId);
  }


  /* =======================================================
     MANUAL INVOICES
  ======================================================= */

  async createManualInvoice(
    user: AuthUser,
    dto: {
      clientCode: string;
      notes?: string;
    },
  ) {
    this.assertManager(user);

    const clientCode =
      String(dto?.clientCode ?? '')
        .trim()
        .toUpperCase();

    if (!clientCode) {
      throw new BadRequestException(
        'clientCode is required',
      );
    }

    const client =
      await this.prisma.clientDetails.findUnique({
        where: {
          clientCode,
        },
      });

    if (!client) {
      throw new NotFoundException(
        `Client details not found for ${clientCode}`,
      );
    }

    if (!client.active) {
      throw new BadRequestException(
        'Cannot create an invoice for an inactive client',
      );
    }

    /*
     * Manual invoices are intentionally independent from
     * automatic report billing eligibility.
     *
     * billingEnabled / billingStartAt only control automatic
     * LIMS report discovery.
     */
    const range =
      getMonthRange(
        undefined,
        DEFAULT_BILLING_TIME_ZONE,
      );

    const invoice =
      await this.prisma.billingInvoice.create({
        data: {
          invoiceKind:
            'MANUAL',

          clientCode,

          activeKey:
            null,

          periodStart:
            range.periodStart,

          periodEnd:
            range.periodEnd,

          status:
            'DRAFT',

          currency:
            'USD',

          subtotal:
            new Prisma.Decimal(0),

          adjustmentAmount:
            new Prisma.Decimal(0),

          total:
            new Prisma.Decimal(0),

          clientName:
            client.name ?? null,

          clientLegalName:
            client.legalName ?? null,

          billingContactName:
            client.billingContactName ?? null,

          billingEmail:
            client.billingEmail ?? null,

          billingPhone:
            client.billingPhone ?? null,

          billingAddressLine1:
            client.billingAddressLine1 ?? null,

          billingAddressLine2:
            client.billingAddressLine2 ?? null,

          billingCity:
            client.billingCity ?? null,

          billingState:
            client.billingState ?? null,

          billingPostalCode:
            client.billingPostalCode ?? null,

          billingCountry:
            client.billingCountry ?? null,

          paymentTerms:
            client.paymentTerms ?? null,

          notes:
            dto?.notes?.trim() ||
            null,

          createdBy:
            user.userId,

          updatedBy:
            user.userId,
        },
      });

    await this.auditInvoice(
      user,
      {
        action:
          'MANUAL_INVOICE_CREATED',

        invoiceId:
          invoice.id,

        clientCode:
          invoice.clientCode,

        details:
          `Created manual invoice draft for ${invoice.clientCode}`,

        changes: {
          invoiceKind:
            'MANUAL',
        },
      },
    );

    return this.getInvoice(
      user,
      invoice.id,
    );
  }

  private parseManualQuantity(
    value: unknown,
  ) {
    const quantity =
      Number(
        String(
          value ?? '',
        ).trim(),
      );

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100000
    ) {
      throw new BadRequestException(
        'quantity must be a whole number between 1 and 100000',
      );
    }

    return quantity;
  }

  private normalizeManualDescription(
    value: unknown,
  ) {
    const description =
      String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ');

    if (
      description.length < 2 ||
      description.length > 500
    ) {
      throw new BadRequestException(
        'Description must be between 2 and 500 characters',
      );
    }

    return description;
  }

  async addManualInvoiceLine(
    user: AuthUser,
    invoiceId: string,
    dto: {
      description: string;
      quantity: number | string;
      unitPrice: number | string;
    },
  ) {
    this.assertManager(user);

    const description =
      this.normalizeManualDescription(
        dto?.description,
      );

    const quantity =
      this.parseManualQuantity(
        dto?.quantity,
      );

    const unitPrice =
      this.parseMoney(
        dto?.unitPrice,
        'unitPrice',
      );

    if (unitPrice.lte(0)) {
      throw new BadRequestException(
        'unitPrice must be greater than 0',
      );
    }

    const amount =
      unitPrice
        .mul(
          new Prisma.Decimal(
            quantity,
          ),
        )
        .toDecimalPlaces(2);

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const invoice =
            await tx.billingInvoice.findUnique({
              where: {
                id:
                  invoiceId,
              },
            });

          if (!invoice) {
            throw new NotFoundException(
              'Invoice not found',
            );
          }

          if (
            invoice.invoiceKind !==
            'MANUAL'
          ) {
            throw new BadRequestException(
              'Items can only be added to a MANUAL invoice',
            );
          }

          if (
            invoice.status !==
            'DRAFT'
          ) {
            throw new BadRequestException(
              'Manual invoice items can only be changed while the invoice is DRAFT',
            );
          }

          const line =
            await tx.billingManualInvoiceLine.create({
              data: {
                invoiceId:
                  invoice.id,

                description,

                quantity,

                unitPrice,

                amount,

                createdBy:
                  user.userId,

                updatedBy:
                  user.userId,
              },
            });

          await this.recalculateInvoiceTotals(
            tx,
            invoice.id,
          );

          return {
            line,
            clientCode:
              invoice.clientCode,
          };
        },
      );

    await this.auditInvoice(
      user,
      {
        action:
          'MANUAL_INVOICE_LINE_ADDED',

        invoiceId,

        clientCode:
          result.clientCode,

        details:
          `Added manual invoice item: ${description}`,

        changes: {
          manualLineId:
            result.line.id,

          description,

          quantity,

          unitPrice:
            unitPrice.toFixed(2),

          amount:
            amount.toFixed(2),
        },
      },
    );

    return this.getInvoice(
      user,
      invoiceId,
    );
  }

  async updateManualInvoiceLine(
    user: AuthUser,
    invoiceId: string,
    lineId: string,
    dto: {
      description?: string;
      quantity?: number | string;
      unitPrice?: number | string;
    },
  ) {
    this.assertManager(user);

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const invoice =
            await tx.billingInvoice.findUnique({
              where: {
                id:
                  invoiceId,
              },
            });

          if (!invoice) {
            throw new NotFoundException(
              'Invoice not found',
            );
          }

          if (
            invoice.invoiceKind !==
            'MANUAL'
          ) {
            throw new BadRequestException(
              'Items can only be changed on a MANUAL invoice',
            );
          }

          if (
            invoice.status !==
            'DRAFT'
          ) {
            throw new BadRequestException(
              'Manual invoice items can only be changed while the invoice is DRAFT',
            );
          }

          const existing =
            await tx.billingManualInvoiceLine.findFirst({
              where: {
                id:
                  lineId,

                invoiceId,
              },
            });

          if (!existing) {
            throw new NotFoundException(
              'Manual invoice item not found',
            );
          }

          const description =
            dto?.description !==
            undefined
              ? this.normalizeManualDescription(
                  dto.description,
                )
              : existing.description;

          const quantity =
            dto?.quantity !==
            undefined
              ? this.parseManualQuantity(
                  dto.quantity,
                )
              : existing.quantity;

          const unitPrice =
            dto?.unitPrice !==
            undefined
              ? this.parseMoney(
                  dto.unitPrice,
                  'unitPrice',
                )
              : existing.unitPrice;

          if (unitPrice.lte(0)) {
            throw new BadRequestException(
              'unitPrice must be greater than 0',
            );
          }

          const amount =
            unitPrice
              .mul(
                new Prisma.Decimal(
                  quantity,
                ),
              )
              .toDecimalPlaces(2);

          const updated =
            await tx.billingManualInvoiceLine.update({
              where: {
                id:
                  lineId,
              },

              data: {
                description,

                quantity,

                unitPrice,

                amount,

                updatedBy:
                  user.userId,
              },
            });

          await this.recalculateInvoiceTotals(
            tx,
            invoice.id,
          );

          return {
            existing,
            updated,
            clientCode:
              invoice.clientCode,
          };
        },
      );

    await this.auditInvoice(
      user,
      {
        action:
          'MANUAL_INVOICE_LINE_UPDATED',

        invoiceId,

        clientCode:
          result.clientCode,

        details:
          `Updated manual invoice item ${lineId}`,

        changes: {
          manualLineId:
            lineId,

          before: {
            description:
              result.existing.description,

            quantity:
              result.existing.quantity,

            unitPrice:
              result.existing.unitPrice.toFixed(2),

            amount:
              result.existing.amount.toFixed(2),
          },

          after: {
            description:
              result.updated.description,

            quantity:
              result.updated.quantity,

            unitPrice:
              result.updated.unitPrice.toFixed(2),

            amount:
              result.updated.amount.toFixed(2),
          },
        },
      },
    );

    return this.getInvoice(
      user,
      invoiceId,
    );
  }

  async deleteManualInvoiceLine(
    user: AuthUser,
    invoiceId: string,
    lineId: string,
  ) {
    this.assertManager(user);

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const invoice =
            await tx.billingInvoice.findUnique({
              where: {
                id:
                  invoiceId,
              },
            });

          if (!invoice) {
            throw new NotFoundException(
              'Invoice not found',
            );
          }

          if (
            invoice.invoiceKind !==
            'MANUAL'
          ) {
            throw new BadRequestException(
              'Items can only be changed on a MANUAL invoice',
            );
          }

          if (
            invoice.status !==
            'DRAFT'
          ) {
            throw new BadRequestException(
              'Manual invoice items can only be changed while the invoice is DRAFT',
            );
          }

          const existing =
            await tx.billingManualInvoiceLine.findFirst({
              where: {
                id:
                  lineId,

                invoiceId,
              },
            });

          if (!existing) {
            throw new NotFoundException(
              'Manual invoice item not found',
            );
          }

          await tx.billingManualInvoiceLine.delete({
            where: {
              id:
                lineId,
            },
          });

          await this.recalculateInvoiceTotals(
            tx,
            invoice.id,
          );

          return {
            existing,
            clientCode:
              invoice.clientCode,
          };
        },
      );

    await this.auditInvoice(
      user,
      {
        action:
          'MANUAL_INVOICE_LINE_DELETED',

        invoiceId,

        clientCode:
          result.clientCode,

        details:
          `Deleted manual invoice item: ${result.existing.description}`,

        changes: {
          manualLineId:
            result.existing.id,

          description:
            result.existing.description,

          quantity:
            result.existing.quantity,

          unitPrice:
            result.existing.unitPrice.toFixed(2),

          amount:
            result.existing.amount.toFixed(2),
        },
      },
    );

    return this.getInvoice(
      user,
      invoiceId,
    );
  }

  /* =======================================================
     REPORT-LEVEL ADDITIONAL CHARGES
  ======================================================= */

  async addInvoiceExtraCharge(
    user: AuthUser,
    invoiceId: string,
    dto: {
      sourceType: BillingSourceType | string;
      sourceId: string;
      name: string;
      amount: string | number;
    },
  ) {
    this.assertManager(user);

    const sourceType = String(dto?.sourceType ?? '').trim() as BillingSourceType;
    const sourceId = String(dto?.sourceId ?? '').trim();
    const name = String(dto?.name ?? '').trim();

    if (!['REPORT', 'CHEMISTRY_REPORT'].includes(sourceType)) {
      throw new BadRequestException('Invalid billing source type');
    }

    if (!sourceId) {
      throw new BadRequestException('sourceId is required');
    }

    if (name.length < 2 || name.length > 120) {
      throw new BadRequestException(
        'Additional charge name must be between 2 and 120 characters',
      );
    }

    const amount = this.parseMoney(dto.amount, 'amount');

    if (amount.lte(0)) {
      throw new BadRequestException('Additional charge amount must be greater than 0');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.findUnique({
        where: { id: invoiceId },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException(
          'Additional charges can only be changed while the invoice is DRAFT',
        );
      }

      const sourceLine = await tx.billingInvoiceLine.findFirst({
        where: {
          invoiceId,
          sourceType,
          sourceId,
        },
        select: {
          formNumber: true,
          reportNumber: true,
        },
      });

      if (!sourceLine) {
        throw new BadRequestException(
          'The selected form does not belong to this invoice',
        );
      }

      const charge = await tx.billingInvoiceExtraCharge.create({
        data: {
          invoiceId,
          sourceType,
          sourceId,
          formNumber: sourceLine.formNumber,
          reportNumber: sourceLine.reportNumber,
          name,
          amount,
          createdBy: user.userId,
          updatedBy: user.userId,
        },
      });

      await this.recalculateInvoiceTotals(tx, invoiceId);

      return {
        charge,
        clientCode: invoice.clientCode,
      };
    });

    await this.auditInvoice(user, {
      action: 'INVOICE_EXTRA_CHARGE_ADDED',
      invoiceId,
      clientCode: result.clientCode,
      details: `Added ${name} additional charge`,
      changes: {
        extraChargeId: result.charge.id,
        sourceType,
        sourceId,
        formNumber: result.charge.formNumber,
        reportNumber: result.charge.reportNumber,
        name,
        amount: amount.toFixed(2),
      },
    });

    return this.getInvoice(user, invoiceId);
  }

  async updateInvoiceExtraCharge(
    user: AuthUser,
    invoiceId: string,
    chargeId: string,
    dto: {
      name?: string;
      amount?: string | number;
    },
  ) {
    this.assertManager(user);

    const hasName = dto?.name !== undefined;
    const hasAmount = dto?.amount !== undefined;

    if (!hasName && !hasAmount) {
      throw new BadRequestException('Provide name or amount to update');
    }

    const name = hasName ? String(dto.name ?? '').trim() : undefined;

    if (name !== undefined && (name.length < 2 || name.length > 120)) {
      throw new BadRequestException(
        'Additional charge name must be between 2 and 120 characters',
      );
    }

    const amount = hasAmount
      ? this.parseMoney(dto.amount!, 'amount')
      : undefined;

    if (amount !== undefined && amount.lte(0)) {
      throw new BadRequestException('Additional charge amount must be greater than 0');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.findUnique({
        where: { id: invoiceId },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException(
          'Additional charges can only be changed while the invoice is DRAFT',
        );
      }

      const existing = await tx.billingInvoiceExtraCharge.findFirst({
        where: {
          id: chargeId,
          invoiceId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Additional charge not found');
      }

      const updated = await tx.billingInvoiceExtraCharge.update({
        where: { id: chargeId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(amount !== undefined ? { amount } : {}),
          updatedBy: user.userId,
        },
      });

      await this.recalculateInvoiceTotals(tx, invoiceId);

      return {
        existing,
        updated,
        clientCode: invoice.clientCode,
      };
    });

    await this.auditInvoice(user, {
      action: 'INVOICE_EXTRA_CHARGE_UPDATED',
      invoiceId,
      clientCode: result.clientCode,
      details: `Updated additional charge ${result.updated.name}`,
      changes: {
        extraChargeId: chargeId,
        before: {
          name: result.existing.name,
          amount: result.existing.amount.toFixed(2),
        },
        after: {
          name: result.updated.name,
          amount: result.updated.amount.toFixed(2),
        },
      },
    });

    return this.getInvoice(user, invoiceId);
  }

  async deleteInvoiceExtraCharge(
    user: AuthUser,
    invoiceId: string,
    chargeId: string,
  ) {
    this.assertManager(user);

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.findUnique({
        where: { id: invoiceId },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException(
          'Additional charges can only be changed while the invoice is DRAFT',
        );
      }

      const existing = await tx.billingInvoiceExtraCharge.findFirst({
        where: {
          id: chargeId,
          invoiceId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Additional charge not found');
      }

      await tx.billingInvoiceExtraCharge.delete({
        where: { id: chargeId },
      });

      await this.recalculateInvoiceTotals(tx, invoiceId);

      return {
        existing,
        clientCode: invoice.clientCode,
      };
    });

    await this.auditInvoice(user, {
      action: 'INVOICE_EXTRA_CHARGE_DELETED',
      invoiceId,
      clientCode: result.clientCode,
      details: `Deleted additional charge ${result.existing.name}`,
      changes: {
        extraChargeId: chargeId,
        sourceType: result.existing.sourceType,
        sourceId: result.existing.sourceId,
        formNumber: result.existing.formNumber,
        reportNumber: result.existing.reportNumber,
        name: result.existing.name,
        amount: result.existing.amount.toFixed(2),
      },
    });

    return this.getInvoice(user, invoiceId);
  }

  /* =======================================================
   CONFIRM INVOICE
======================================================= */

  async confirmInvoice(
    user: AuthUser,
    invoiceId: string,
    dto: ConfirmInvoiceDto,
  ) {
    this.assertManager(user);

    const now = new Date();

    const invoiceYear = getZonedParts(now, DEFAULT_BILLING_TIME_ZONE).year;

    const confirmed = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.findUnique({
        where: {
          id: invoiceId,
        },

        include: {
          lines: true,
          manualLines: true,
          extraCharges: true,
        },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT invoices can be confirmed');
      }

      if (
        invoice.invoiceKind ===
          'REPORT' &&
        invoice.lines.length ===
          0
      ) {
        throw new BadRequestException(
          'Report invoice cannot be confirmed without invoice lines',
        );
      }

      if (
        invoice.invoiceKind ===
          'MANUAL' &&
        invoice.manualLines.length ===
          0
      ) {
        throw new BadRequestException(
          'Manual invoice cannot be confirmed without at least one invoice item',
        );
      }

      const unresolvedLines = invoice.lines.filter(
        (line) =>
          !!line.pricingIssue || line.unitPrice == null || line.amount == null,
      );

      if (unresolvedLines.length > 0) {
        throw new BadRequestException({
          message: 'Invoice contains unresolved pricing issues',

          lines: unresolvedLines.map((line) => ({
            id: line.id,

            formNumber: line.formNumber,

            reportNumber: line.reportNumber,

            testKey: line.testKey,

            itemKey: line.itemKey,

            itemLabel: line.itemLabel,

            pricingIssue: line.pricingIssue ?? 'Missing price',
          })),
        });
      }

      const invalidOverrides = invoice.lines.filter(
        (line) =>
          line.manualOverride &&
          !String(line.manualOverrideReason ?? '').trim(),
      );

      if (invalidOverrides.length > 0) {
        throw new BadRequestException(
          'Every manual price override must have a reason',
        );
      }

      const client = await tx.clientDetails.findUnique({
        where: {
          clientCode: invoice.clientCode,
        },
      });

      if (!client) {
        throw new BadRequestException(
          `Client details not found for ${invoice.clientCode}`,
        );
      }

      if (!client.active) {
        throw new BadRequestException(
          'Cannot confirm invoice for an inactive client',
        );
      }

      /*
       * billingEnabled controls automatic REPORT billing only.
       *
       * A MANUAL invoice is intentionally allowed for any
       * active client, even when automatic report billing
       * is disabled.
       */
      if (
        invoice.invoiceKind ===
          'REPORT' &&
        !client.billingEnabled
      ) {
        throw new BadRequestException(
          'Billing is disabled for this client',
        );
      }

      let subtotal = new Prisma.Decimal(0);

      for (const line of invoice.lines) {
        subtotal = subtotal.plus(line.amount!);
      }

      for (const line of invoice.manualLines) {
        subtotal = subtotal.plus(line.amount);
      }

      for (const charge of invoice.extraCharges) {
        subtotal = subtotal.plus(charge.amount);
      }

      subtotal = subtotal.toDecimalPlaces(2);

      const total = subtotal.plus(invoice.adjustmentAmount).toDecimalPlaces(2);

      if (total.lt(0)) {
        throw new BadRequestException('Invoice total cannot be negative');
      }

      /*
       * NUMBERING RULE
       * -----------------------------------------------------
       * Brand-new DRAFT:
       *   invoiceNumber is null -> allocate INV-YYYY-NNNN.
       *
       * Reopened CONFIRMED invoice:
       *   already has INV-YYYY-NNNN -> KEEP SAME NUMBER.
       *
       * Revision:
       *   already has INV-YYYY-NNNN-R1 / R2... -> KEEP IT.
       */
      let invoiceNumber =
        invoice.invoiceNumber;

      if (!invoiceNumber) {
        const sequence =
          await tx.billingInvoiceSequence.upsert({
            where: {
              year: invoiceYear,
            },

            update: {
              lastNumber: {
                increment: 1,
              },
            },

            create: {
              year: invoiceYear,

              lastNumber: 1,
            },
          });

        invoiceNumber =
          `INV-${invoiceYear}-${String(
            sequence.lastNumber,
          ).padStart(4, '0')}`;
      }

      const updateResult = await tx.billingInvoice.updateMany({
        where: {
          id: invoiceId,

          status: 'DRAFT',
        },

        data: {
          invoiceNumber,

          status: 'CONFIRMED',

          /*
           * Release the client/month DRAFT slot immediately.
           * activeChargeKey on the lines still prevents any
           * already-confirmed report from being billed twice.
           */
          activeKey: null,

          subtotal,
          total,

          clientName: client.name ?? null,

          clientLegalName: client.legalName ?? null,

          billingContactName: client.billingContactName ?? null,

          billingEmail: client.billingEmail ?? null,

          billingPhone: client.billingPhone ?? null,

          billingAddressLine1: client.billingAddressLine1 ?? null,

          billingAddressLine2: client.billingAddressLine2 ?? null,

          billingCity: client.billingCity ?? null,

          billingState: client.billingState ?? null,

          billingPostalCode: client.billingPostalCode ?? null,

          billingCountry: client.billingCountry ?? null,

          paymentTerms: client.paymentTerms ?? null,

          ...(dto.notes !== undefined
            ? {
                notes: dto.notes?.trim() || null,
              }
            : {}),

          confirmedAt: now,

          confirmedBy: user.userId,

          updatedBy: user.userId,
        },
      });

      if (updateResult.count !== 1) {
        throw new BadRequestException('Invoice is no longer in DRAFT status');
      }

      const result = await tx.billingInvoice.findUnique({
        where: {
          id: invoiceId,
        },
      });

      if (!result) {
        throw new NotFoundException('Invoice not found after confirmation');
      }

      return result;
    });

    await this.auditInvoice(user, {
      action: 'INVOICE_CONFIRMED',

      invoiceId,

      clientCode: confirmed.clientCode,

      details: `Confirmed invoice ${confirmed.invoiceNumber}`,

      changes: {
        invoiceNumber: confirmed.invoiceNumber,

        subtotal: confirmed.subtotal.toFixed(2),

        adjustmentAmount: confirmed.adjustmentAmount.toFixed(2),

        total: confirmed.total.toFixed(2),
      },
    });

    return this.getInvoice(user, invoiceId);
  }



  /* =======================================================
     REOPEN CONFIRMED INVOICE
  ======================================================= */

  async reopenConfirmedInvoice(
    user: AuthUser,
    invoiceId: string,
  ) {
    this.assertManager(user);

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const invoice =
            await tx.billingInvoice.findUnique({
              where: {
                id: invoiceId,
              },

              include: {
                lines: {
                  select: {
                    id: true,
                  },
                },
              },
            });

          if (!invoice) {
            throw new NotFoundException(
              'Invoice not found',
            );
          }

          if (
            invoice.status !==
            'CONFIRMED'
          ) {
            throw new BadRequestException(
              invoice.status ===
                'SENT'
                ? 'Sent invoices cannot be reopened. Create a revision instead.'
                : 'Only CONFIRMED invoices can be reopened for editing',
            );
          }

          if (
            !invoice.invoiceNumber
          ) {
            throw new BadRequestException(
              'Confirmed invoice is missing invoiceNumber',
            );
          }

          const previous = {
            status:
              invoice.status,

            invoiceNumber:
              invoice.invoiceNumber,

            confirmedAt:
              invoice.confirmedAt,

            confirmedBy:
              invoice.confirmedBy,

            pdfFilename:
              invoice.pdfFilename,

            pdfStorageKey:
              invoice.pdfStorageKey,

            pdfChecksum:
              invoice.pdfChecksum,

            pdfCreatedAt:
              invoice.pdfCreatedAt,

            dueDate:
              invoice.dueDate,

            scheduledSendAt:
              invoice.scheduledSendAt,

            scheduledToEmail:
              invoice.scheduledToEmail,
          };

          /*
           * Reopening is allowed only before delivery.
           *
           * Keep:
           *   - same invoiceNumber
           *   - same invoice id
           *   - same line charge identities
           *   - same revision relationship
           *
           * Clear confirmation/PDF/schedule metadata because
           * the invoice is editable again and a new official
           * PDF must be generated after re-confirmation.
           *
           * activeKey stays null. A confirmed invoice already
           * released the monthly draft slot and reopening must
           * not steal that slot from a newer monthly draft.
           */
          const updated =
            await tx.billingInvoice.updateMany({
              where: {
                id:
                  invoice.id,

                status:
                  'CONFIRMED',
              },

              data: {
                status:
                  'DRAFT',

                activeKey:
                  null,

                confirmedAt:
                  null,

                confirmedBy:
                  null,

                dueDate:
                  null,

                scheduledSendAt:
                  null,

                scheduledToEmail:
                  null,

                scheduledBy:
                  null,

                scheduledAt:
                  null,

                pdfFilename:
                  null,

                pdfStorageKey:
                  null,

                pdfStorageBucket:
                  null,

                pdfChecksum:
                  null,

                pdfCreatedAt:
                  null,

                updatedBy:
                  user.userId,
              },
            });

          if (
            updated.count !== 1
          ) {
            throw new BadRequestException(
              'Invoice is no longer CONFIRMED',
            );
          }

          return {
            clientCode:
              invoice.clientCode,

            invoiceNumber:
              invoice.invoiceNumber,

            revisionNumber:
              invoice.revisionNumber,

            revisionOfInvoiceId:
              invoice.revisionOfInvoiceId,

            previous,

            lineCount:
              invoice.lines.length,
          };
        },
      );

    await this.auditInvoice(
      user,
      {
        action:
          'INVOICE_REOPENED_FOR_EDITING',

        invoiceId,

        clientCode:
          result.clientCode,

        details:
          `Reopened ${result.invoiceNumber} for editing`,

        changes: {
          previousStatus:
            'CONFIRMED',

          newStatus:
            'DRAFT',

          invoiceNumber:
            result.invoiceNumber,

          revisionNumber:
            result.revisionNumber,

          revisionOfInvoiceId:
            result.revisionOfInvoiceId,

          lineCount:
            result.lineCount,

          previousConfirmedAt:
            result.previous.confirmedAt
              ?.toISOString() ??
            null,

          previousConfirmedBy:
            result.previous.confirmedBy,

          previousPdfChecksum:
            result.previous.pdfChecksum,

          previousDueDate:
            result.previous.dueDate
              ?.toISOString() ??
            null,

          previousScheduledSendAt:
            result.previous.scheduledSendAt
              ?.toISOString() ??
            null,
        },
      },
    );

    return this.getInvoice(
      user,
      invoiceId,
    );
  }

  /* =======================================================
     CREATE REVISION FROM SENT INVOICE
  ======================================================= */

  async createInvoiceRevision(
    user: AuthUser,
    invoiceId: string,
  ) {
    this.assertManager(user);

    let transactionResult:
      {
        revisionId: string;
        revisionInvoiceNumber: string;
        revisionNumber: number;
        rootInvoiceId: string;
        rootInvoiceNumber: string;
        copiedFromInvoiceId: string;
        copiedFromInvoiceNumber: string;
        clientCode: string;
        lineCount: number;
        extraChargeCount: number;
      };

    try {
      transactionResult =
        await this.prisma.$transaction(
          async (tx) => {
            const requestedInvoice =
              await tx.billingInvoice.findUnique({
                where: {
                  id:
                    invoiceId,
                },
              });

            if (!requestedInvoice) {
              throw new NotFoundException(
                'Invoice not found',
              );
            }

            if (
              requestedInvoice.status !==
              'SENT'
            ) {
              throw new BadRequestException(
                requestedInvoice.status ===
                  'CONFIRMED'
                  ? 'Confirmed invoices should be reopened for editing instead of revised'
                  : 'Only SENT invoices can create a revision',
              );
            }

            /*
             * Every revision points directly to the ORIGINAL
             * invoice, not to the previous revision.
             *
             * Original:
             *   revisionOfInvoiceId = null
             *
             * R1 / R2 / R3:
             *   revisionOfInvoiceId = original.id
             */
            const rootInvoiceId =
              requestedInvoice.revisionOfInvoiceId ??
              requestedInvoice.id;

            const rootInvoice =
              await tx.billingInvoice.findUnique({
                where: {
                  id:
                    rootInvoiceId,
                },

                select: {
                  id: true,
                  invoiceNumber: true,
                  clientCode: true,
                },
              });

            if (
              !rootInvoice ||
              !rootInvoice.invoiceNumber
            ) {
              throw new BadRequestException(
                'Original invoice could not be resolved for revision',
              );
            }

            const existingRevisions =
              await tx.billingInvoice.findMany({
                where: {
                  revisionOfInvoiceId:
                    rootInvoiceId,
                },

                select: {
                  id: true,
                  invoiceNumber: true,
                  revisionNumber: true,
                  status: true,
                },

                orderBy: {
                  revisionNumber:
                    'desc',
                },
              });

            /*
             * Only one revision may be "in progress".
             *
             * If R1 is still DRAFT or CONFIRMED, the user
             * must finish/reopen that revision instead of
             * accidentally creating R2.
             */
            const openRevision =
              existingRevisions.find(
                (revision) =>
                  revision.status ===
                    'DRAFT' ||
                  revision.status ===
                    'CONFIRMED',
              );

            if (openRevision) {
              throw new BadRequestException(
                `${openRevision.invoiceNumber ?? `Revision ${openRevision.revisionNumber}`} already exists and is ${openRevision.status}. Complete that revision before creating another one.`,
              );
            }

            const highestRevisionNumber =
              existingRevisions.reduce(
                (
                  highest,
                  revision,
                ) =>
                  Math.max(
                    highest,
                    revision.revisionNumber,
                  ),
                0,
              );

            const nextRevisionNumber =
              highestRevisionNumber +
              1;

            /*
             * Copy from the latest SENT version in the family.
             *
             * This matters if the user opens the original
             * invoice after R1 was already sent. Creating R2
             * should inherit R1's latest changes, not revert
             * back to the original values.
             */
            const latestSentVersion =
              await tx.billingInvoice.findFirst({
                where: {
                  status:
                    'SENT',

                  OR: [
                    {
                      id:
                        rootInvoiceId,
                    },

                    {
                      revisionOfInvoiceId:
                        rootInvoiceId,
                    },
                  ],
                },

                include: {
                  lines: {
                    orderBy: {
                      createdAt:
                        'asc',
                    },
                  },

                  manualLines: {
                    orderBy: {
                      createdAt:
                        'asc',
                    },
                  },

                  extraCharges: {
                    orderBy: {
                      createdAt:
                        'asc',
                    },
                  },
                },

                orderBy: [
                  {
                    revisionNumber:
                      'desc',
                  },

                  {
                    sentAt:
                      'desc',
                  },
                ],
              });

            if (
              !latestSentVersion ||
              !latestSentVersion.invoiceNumber
            ) {
              throw new BadRequestException(
                'No SENT invoice version is available to revise',
              );
            }

            const revisionInvoiceNumber =
              `${rootInvoice.invoiceNumber}-R${nextRevisionNumber}`;

            /*
             * Create the revised invoice as DRAFT.
             *
             * It receives its revision invoice number NOW,
             * not during confirmation:
             *
             *   INV-2026-0003-R1
             *   INV-2026-0003-R2
             *
             * confirmInvoice() has been updated to preserve an
             * already-existing invoiceNumber.
             */
            const revision =
              await tx.billingInvoice.create({
                data: {
                  invoiceNumber:
                    revisionInvoiceNumber,

                  invoiceKind:
                    latestSentVersion.invoiceKind,

                  clientCode:
                    latestSentVersion.clientCode,

                  activeKey:
                    null,

                  periodStart:
                    latestSentVersion.periodStart,

                  periodEnd:
                    latestSentVersion.periodEnd,

                  status:
                    'DRAFT',

                  currency:
                    latestSentVersion.currency,

                  /*
                   * Totals are recalculated after the copied
                   * lines / extra charges are inserted.
                   */
                  subtotal:
                    new Prisma.Decimal(
                      0,
                    ),

                  adjustmentAmount:
                    latestSentVersion.adjustmentAmount,

                  total:
                    new Prisma.Decimal(
                      0,
                    ),

                  clientName:
                    latestSentVersion.clientName,

                  clientLegalName:
                    latestSentVersion.clientLegalName,

                  billingContactName:
                    latestSentVersion.billingContactName,

                  billingEmail:
                    latestSentVersion.billingEmail,

                  billingPhone:
                    latestSentVersion.billingPhone,

                  billingAddressLine1:
                    latestSentVersion.billingAddressLine1,

                  billingAddressLine2:
                    latestSentVersion.billingAddressLine2,

                  billingCity:
                    latestSentVersion.billingCity,

                  billingState:
                    latestSentVersion.billingState,

                  billingPostalCode:
                    latestSentVersion.billingPostalCode,

                  billingCountry:
                    latestSentVersion.billingCountry,

                  paymentTerms:
                    latestSentVersion.paymentTerms,

                  notes:
                    latestSentVersion.notes,

                  /*
                   * Revision is a fresh editable invoice.
                   * Confirmation/send/PDF/due-date metadata
                   * intentionally starts empty.
                   */
                  confirmedAt:
                    null,

                  confirmedBy:
                    null,

                  sentAt:
                    null,

                  sentBy:
                    null,

                  dueDate:
                    null,

                  scheduledSendAt:
                    null,

                  scheduledToEmail:
                    null,

                  scheduledBy:
                    null,

                  scheduledAt:
                    null,

                  voidedAt:
                    null,

                  voidedBy:
                    null,

                  voidReason:
                    null,

                  pdfFilename:
                    null,

                  pdfStorageKey:
                    null,

                  pdfStorageBucket:
                    null,

                  pdfChecksum:
                    null,

                  pdfCreatedAt:
                    null,

                  revisionOfInvoiceId:
                    rootInvoiceId,

                  revisionNumber:
                    nextRevisionNumber,

                  createdBy:
                    user.userId,

                  updatedBy:
                    user.userId,
                },
              });

            /*
             * Copy all testing lines exactly as they appeared
             * on the latest SENT version.
             *
             * CRITICAL:
             * activeChargeKey MUST be null.
             *
             * The original/SENT version remains the historical
             * owner of the billable source identity. A revision
             * is a correction of that invoice, not a second
             * billing occurrence.
             */
            if (
              latestSentVersion.lines.length >
              0
            ) {
              await tx.billingInvoiceLine.createMany({
                data:
                  latestSentVersion.lines.map(
                    (line) => ({
                      invoiceId:
                        revision.id,

                      sourceType:
                        line.sourceType,

                      sourceId:
                        line.sourceId,

                      chargeKey:
                        line.chargeKey,

                      activeChargeKey:
                        null,

                      formType:
                        line.formType,

                      formNumber:
                        line.formNumber,

                      reportNumber:
                        line.reportNumber,

                      clientCode:
                        line.clientCode,

                      resultSentToClientAt:
                        line.resultSentToClientAt,

                      billingReadyAt:
                        line.billingReadyAt,

                      testKey:
                        line.testKey,

                      testLabel:
                        line.testLabel,

                      itemKey:
                        line.itemKey,

                      itemLabel:
                        line.itemLabel,

                      activeCount:
                        line.activeCount,

                      priceBasis:
                        line.priceBasis,

                      quantity:
                        line.quantity,

                      unitPrice:
                        line.unitPrice,

                      amount:
                        line.amount,

                      pricingRuleId:
                        line.pricingRuleId,

                      pricingIssue:
                        line.pricingIssue,

                      manualOverride:
                        line.manualOverride,

                      manualOverrideReason:
                        line.manualOverrideReason,

                      manualOverrideBy:
                        line.manualOverrideBy,

                      manualOverrideAt:
                        line.manualOverrideAt,

                      sourceSnapshot:
                        line.sourceSnapshot ===
                        null
                          ? Prisma.JsonNull
                          : (line.sourceSnapshot as Prisma.InputJsonValue),
                    })),
              });
            }

            if (
              latestSentVersion.manualLines.length >
              0
            ) {
              await tx.billingManualInvoiceLine.createMany({
                data:
                  latestSentVersion.manualLines.map(
                    (line) => ({
                      invoiceId:
                        revision.id,

                      description:
                        line.description,

                      quantity:
                        line.quantity,

                      unitPrice:
                        line.unitPrice,

                      amount:
                        line.amount,

                      createdBy:
                        user.userId,

                      updatedBy:
                        user.userId,
                    }),
                  ),
              });
            }

            if (
              latestSentVersion.extraCharges.length >
              0
            ) {
              await tx.billingInvoiceExtraCharge.createMany({
                data:
                  latestSentVersion.extraCharges.map(
                    (charge) => ({
                      invoiceId:
                        revision.id,

                      sourceType:
                        charge.sourceType,

                      sourceId:
                        charge.sourceId,

                      formNumber:
                        charge.formNumber,

                      reportNumber:
                        charge.reportNumber,

                      name:
                        charge.name,

                      amount:
                        charge.amount,

                      createdBy:
                        user.userId,

                      updatedBy:
                        user.userId,
                    })),
              });
            }

            const recalculated =
              await this.recalculateInvoiceTotals(
                tx,
                revision.id,
              );

            await tx.billingInvoice.update({
              where: {
                id:
                  revision.id,
              },

              data: {
                updatedBy:
                  user.userId,
              },
            });

            return {
              revisionId:
                revision.id,

              revisionInvoiceNumber:
                revision.invoiceNumber!,

              revisionNumber:
                revision.revisionNumber,

              rootInvoiceId:
                rootInvoice.id,

              rootInvoiceNumber:
                rootInvoice.invoiceNumber,

              copiedFromInvoiceId:
                latestSentVersion.id,

              copiedFromInvoiceNumber:
                latestSentVersion.invoiceNumber,

              clientCode:
                latestSentVersion.clientCode,

              lineCount:
                latestSentVersion.lines.length,

              extraChargeCount:
                latestSentVersion.extraCharges.length,

              subtotal:
                recalculated.subtotal,
            };
          },
        );
    } catch (error: any) {
      /*
       * Database uniqueness is the final concurrency guard:
       *
       *   invoiceNumber UNIQUE
       *   (revisionOfInvoiceId, revisionNumber) UNIQUE
       *
       * If two admins click "Create Revision" at the exact
       * same moment, one succeeds and the other receives a
       * clean message instead of creating duplicate R1/R2.
       */
      if (
        error?.code ===
        'P2002'
      ) {
        throw new BadRequestException(
          'Another revision was created at the same time. Refresh the invoice and try again.',
        );
      }

      throw error;
    }

    await this.auditInvoice(
      user,
      {
        action:
          'INVOICE_REVISION_CREATED',

        invoiceId:
          transactionResult.revisionId,

        clientCode:
          transactionResult.clientCode,

        details:
          `Created ${transactionResult.revisionInvoiceNumber} from ${transactionResult.copiedFromInvoiceNumber}`,

        changes: {
          originalInvoiceId:
            transactionResult.rootInvoiceId,

          originalInvoiceNumber:
            transactionResult.rootInvoiceNumber,

          copiedFromInvoiceId:
            transactionResult.copiedFromInvoiceId,

          copiedFromInvoiceNumber:
            transactionResult.copiedFromInvoiceNumber,

          revisionNumber:
            transactionResult.revisionNumber,

          revisionInvoiceNumber:
            transactionResult.revisionInvoiceNumber,

          copiedLineCount:
            transactionResult.lineCount,

          copiedExtraChargeCount:
            transactionResult.extraChargeCount,
        },
      },
    );

    /*
     * Also put a trace on the SENT invoice that was copied.
     * This makes the old invoice's audit history clearly show
     * which revised document superseded it.
     */
    await this.auditInvoice(
      user,
      {
        action:
          'INVOICE_REVISION_CREATED_FROM',

        invoiceId:
          transactionResult.copiedFromInvoiceId,

        clientCode:
          transactionResult.clientCode,

        details:
          `${transactionResult.copiedFromInvoiceNumber} revised as ${transactionResult.revisionInvoiceNumber}`,

        changes: {
          revisionInvoiceId:
            transactionResult.revisionId,

          revisionInvoiceNumber:
            transactionResult.revisionInvoiceNumber,

          revisionNumber:
            transactionResult.revisionNumber,
        },
      },
    );

    return this.getInvoice(
      user,
      transactionResult.revisionId,
    );
  }

  /* =======================================================
     VOID INVOICE
  ======================================================= */

  async voidInvoice(
    user: AuthUser,
    invoiceId: string,
    dto: VoidInvoiceDto,
  ) {
    this.assertManager(user);

    const reason = String(
      dto.reason ?? '',
    ).trim();

    if (reason.length < 3) {
      throw new BadRequestException(
        'Void reason is required',
      );
    }

    const now = new Date();

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const invoice =
            await tx.billingInvoice.findUnique({
              where: {
                id: invoiceId,
              },

              include: {
                lines: true,
              },
            });

          if (!invoice) {
            throw new NotFoundException(
              'Invoice not found',
            );
          }

          if (
            invoice.status ===
            'VOID'
          ) {
            throw new BadRequestException(
              'Invoice is already VOID',
            );
          }

          if (
            invoice.status !==
              'CONFIRMED' &&
            invoice.status !==
              'SENT'
          ) {
            throw new BadRequestException(
              'Only CONFIRMED or SENT invoices can be voided',
            );
          }

          const previousStatus =
            invoice.status;

          const previousActiveKey =
            invoice.activeKey;

          /*
           * Keep historical chargeKey unchanged.
           * Release only activeChargeKey so a replacement
           * invoice may legitimately capture the source.
           */
          const released =
            await tx.billingInvoiceLine.updateMany({
              where: {
                invoiceId:
                  invoice.id,
              },

              data: {
                activeChargeKey:
                  null,
              },
            });

          const voided =
            await tx.billingInvoice.update({
              where: {
                id:
                  invoice.id,
              },

              data: {
                status:
                  'VOID',

                activeKey:
                  null,

                voidReason:
                  reason,

                voidedAt:
                  now,

                voidedBy:
                  user.userId,

                updatedBy:
                  user.userId,
              },
            });

          return {
            voided,

            previousStatus,

            previousActiveKey,

            releasedChargeCount:
              released.count,
          };
        },
      );

    await this.auditInvoice(
      user,
      {
        action:
          'INVOICE_VOIDED',

        invoiceId:
          result.voided.id,

        clientCode:
          result.voided.clientCode,

        details:
          `Voided invoice ${
            result.voided.invoiceNumber ??
            result.voided.id
          } | reason: ${reason}`,

        changes: {
          previousStatus:
            result.previousStatus,

          newStatus:
            'VOID',

          previousActiveKey:
            result.previousActiveKey,

          activeKey:
            null,

          releasedChargeCount:
            result.releasedChargeCount,

          reason,

          voidedAt:
            now.toISOString(),

          voidedBy:
            user.userId,
        },
      },
    );

    return this.getInvoice(
      user,
      invoiceId,
    );
  }

  /* =======================================================
     LIST INVOICES
  ======================================================= */

  async listInvoices(
    user: AuthUser,
    query: {
      month?: string;
      clientCode?: string;
      status?: BillingInvoiceStatus;
      page?: string | number;
      perPage?: string | number;
    },
  ) {
    this.assertReader(user);

    const page = Math.max(1, Number(query.page ?? 1) || 1);

    const perPage = Math.min(
      100,
      Math.max(1, Number(query.perPage ?? 25) || 25),
    );

    const where: Prisma.BillingInvoiceWhereInput = {};

    if (query.clientCode) {
      where.clientCode = String(query.clientCode).trim().toUpperCase();
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.month) {
      const range = getMonthRange(query.month, DEFAULT_BILLING_TIME_ZONE);

      where.periodStart = {
        gte: range.periodStart,

        lt: range.periodEnd,
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.billingInvoice.findMany({
        where,

        orderBy: {
          createdAt: 'desc',
        },

        skip: (page - 1) * perPage,

        take: perPage,

        include: {
          _count: {
            select: {
              lines: true,
              manualLines: true,
              emails: true,
            },
          },
        },
      }),

      this.prisma.billingInvoice.count({
        where,
      }),
    ]);

    return {
      page,
      perPage,
      total,

      pages: Math.ceil(total / perPage),

      items: rows.map((row) => ({
        ...row,

        subtotal: row.subtotal.toFixed(2),

        adjustmentAmount: row.adjustmentAmount.toFixed(2),

        total: row.total.toFixed(2),
      })),
    };
  }

  /* =======================================================
     INVOICE DETAIL
  ======================================================= */

  async getInvoice(user: AuthUser, id: string) {
    this.assertReader(user);

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: {
        id,
      },

      include: {
        lines: {
          orderBy: [
            {
              formNumber: 'asc',
            },
            {
              testKey: 'asc',
            },
            {
              itemKey: 'asc',
            },
          ],
        },

        emails: {
          orderBy: {
            createdAt: 'desc',
          },
        },

        manualLines: {
          orderBy: {
            createdAt: 'asc',
          },
        },

        extraCharges: {
          orderBy: [
            {
              formNumber: 'asc',
            },
            {
              createdAt: 'asc',
            },
          ],
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const revisionRootId =
      invoice.revisionOfInvoiceId ??
      invoice.id;

    const revisionHistory =
      await this.prisma.billingInvoice.findMany({
        where: {
          OR: [
            {
              id:
                revisionRootId,
            },

            {
              revisionOfInvoiceId:
                revisionRootId,
            },
          ],
        },

        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          revisionOfInvoiceId: true,
          revisionNumber: true,
          confirmedAt: true,
          sentAt: true,
          total: true,
          createdAt: true,
        },

        orderBy: [
          {
            revisionNumber:
              'asc',
          },

          {
            createdAt:
              'asc',
          },
        ],
      });

    return {
      ...invoice,

      subtotal: invoice.subtotal.toFixed(2),

      adjustmentAmount: invoice.adjustmentAmount.toFixed(2),

      total: invoice.total.toFixed(2),

      lines: invoice.lines.map((line) => ({
        ...line,

        unitPrice: line.unitPrice ? line.unitPrice.toFixed(2) : null,

        amount: line.amount ? line.amount.toFixed(2) : null,
      })),

      manualLines: invoice.manualLines.map((line) => ({
        ...line,

        unitPrice:
          line.unitPrice.toFixed(2),

        amount:
          line.amount.toFixed(2),
      })),

      extraCharges: invoice.extraCharges.map((charge) => ({
        ...charge,
        amount: charge.amount.toFixed(2),
      })),

      revisionRootId,

      revisionHistory:
        revisionHistory.map(
          (version) => ({
            ...version,

            total:
              version.total.toFixed(
                2,
              ),
          }),
        ),
    };
  }

  /* =======================================================
     SUMMARY
  ======================================================= */

  async getSummary(
    user: AuthUser,
    query: {
      month?: string;
      clientCode?: string;
    },
  ) {
    this.assertReader(user);

    const range = getMonthRange(query.month, DEFAULT_BILLING_TIME_ZONE);

    const clientCode = query.clientCode
      ? String(query.clientCode).trim().toUpperCase()
      : null;

    const where: Prisma.BillingInvoiceWhereInput = {
      periodStart: {
        gte: range.periodStart,

        lt: range.periodEnd,
      },

      ...(clientCode
        ? {
            clientCode,
          }
        : {}),
    };

    const [invoices, unbilled] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where,

        select: {
          status: true,
          total: true,
        },
      }),

      this.getUnbilled(user, {
        month: range.month,

        clientCode: clientCode ?? undefined,
      }),
    ]);

    const counts = {
      DRAFT: 0,
      CONFIRMED: 0,
      SENT: 0,
      VOID: 0,
    };

    const totals = {
      DRAFT: new Prisma.Decimal(0),

      CONFIRMED: new Prisma.Decimal(0),

      SENT: new Prisma.Decimal(0),

      VOID: new Prisma.Decimal(0),
    };

    for (const invoice of invoices) {
      counts[invoice.status] += 1;

      totals[invoice.status] = totals[invoice.status].plus(invoice.total);
    }

    return {
      month: range.month,

      timeZone: DEFAULT_BILLING_TIME_ZONE,

      unbilled: {
        count: unbilled.count,

        estimatedSubtotal: unbilled.estimatedSubtotal,
      },

      billingExceptions: unbilled.exceptionCount,

      invoices: {
        DRAFT: {
          count: counts.DRAFT,

          total: totals.DRAFT.toFixed(2),
        },

        CONFIRMED: {
          count: counts.CONFIRMED,

          total: totals.CONFIRMED.toFixed(2),
        },

        SENT: {
          count: counts.SENT,

          total: totals.SENT.toFixed(2),
        },

        VOID: {
          count: counts.VOID,

          total: totals.VOID.toFixed(2),
        },
      },
    };
  }
}