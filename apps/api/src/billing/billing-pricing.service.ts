import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  BillingDepartment,
  BillingPriceBasis,
  BillingPriceRule,
  FormType,
  Prisma,
  UserRole,
} from '@prisma/client';

import { PrismaService } from 'prisma/prisma.service';

import { getRequestContext } from '../common/request-context';

import { CreatePriceRuleDto } from './dto/create-price-rule.dto';
import { UpdatePriceRuleDto } from './dto/update-price-rule.dto';

type AuthUser = {
  userId: string;
  role: UserRole;
};

type PriceDb = PrismaService | Prisma.TransactionClient;

const MICRO_FORMS: FormType[] = [
  'MICRO_MIX',
  'MICRO_MIX_WATER',
  'STERILITY',
  'APE',
];

const CHEMISTRY_FORMS: FormType[] = [
  'CHEMISTRY_MIX',
  'COA',
];

@Injectable()
export class BillingPricingService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /* =========================================================
     AUTHORIZATION
  ========================================================= */

  private assertReader(user: AuthUser) {
    if (
      ![
        'FRONTDESK',
        'ADMIN',
        'SYSTEMADMIN',
      ].includes(user.role)
    ) {
      throw new ForbiddenException(
        'You do not have access to billing',
      );
    }
  }

  private assertManager(user: AuthUser) {
    if (
      ![
        'ADMIN',
        'SYSTEMADMIN',
      ].includes(user.role)
    ) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEMADMIN can manage billing prices',
      );
    }
  }

  /* =========================================================
     NORMALIZATION
  ========================================================= */

  normalizeClientCode(value: unknown) {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  normalizeTestKey(value: unknown) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/&/g, ' AND ')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  normalizeItemKey(value: unknown) {
    return this.normalizeTestKey(value);
  }

  private parseDate(
    value: string | Date | null | undefined,
    field: string,
  ): Date | null {
    if (value == null || value === '') {
      return null;
    }

    const date =
      value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `${field} is not a valid date`,
      );
    }

    return date;
  }

  private parseMoney(value: number | string) {
    try {
      const amount = new Prisma.Decimal(
        String(value).trim(),
      );

      if (amount.lt(0)) {
        throw new Error('negative');
      }

      return amount;
    } catch {
      throw new BadRequestException(
        'unitPrice must be a valid non-negative amount',
      );
    }
  }

  /* =========================================================
     RULE VALIDATION
  ========================================================= */

  private validateDepartmentAndForm(
    department: BillingDepartment,
    formType: FormType,
  ) {
    if (
      department === 'MICRO' &&
      !MICRO_FORMS.includes(formType)
    ) {
      throw new BadRequestException(
        `${formType} is not a MICRO billing form`,
      );
    }

    if (
      department === 'CHEMISTRY' &&
      !CHEMISTRY_FORMS.includes(formType)
    ) {
      throw new BadRequestException(
        `${formType} is not a CHEMISTRY billing form`,
      );
    }
  }

  private validatePricingShape(args: {
    department: BillingDepartment;
    formType: FormType;
    priceBasis: BillingPriceBasis;
    activeCount: number | null;
    itemKey: string | null;
    allowLegacyItemless?: boolean;
  }) {
    this.validateDepartmentAndForm(args.department, args.formType);

    if (args.department === 'MICRO') {
      if (args.priceBasis !== 'FLAT') {
        throw new BadRequestException(
          'MICRO pricing must use FLAT price basis',
        );
      }

      if (args.activeCount != null) {
        throw new BadRequestException(
          'MICRO pricing cannot use activeCount',
        );
      }

      /*
       * MICRO_MIX and MICRO_MIX_WATER may optionally use an
       * individual pathogen itemKey.
       *
       * Examples:
       *   E_COLI
       *   P_AER
       *   SALM
       *
       * itemKey=null remains valid for reports where no
       * pathogen was selected, so Type-of-Test-only pricing
       * continues to work.
       *
       * STERILITY and APE do not use pathogen pricing.
       */
      if (
        args.itemKey != null &&
        args.formType !== 'MICRO_MIX' &&
        args.formType !== 'MICRO_MIX_WATER'
      ) {
        throw new BadRequestException(
          `${args.formType} pricing cannot use itemKey`,
        );
      }

      return;
    }

    if (args.formType === 'CHEMISTRY_MIX') {
      if (!args.itemKey) {
        if (args.allowLegacyItemless) return;
        throw new BadRequestException(
          'CHEMISTRY_MIX pricing requires itemKey for the selected active',
        );
      }
      if (args.priceBasis !== 'FLAT') {
        throw new BadRequestException(
          'Individual CHEMISTRY_MIX item pricing must use FLAT price basis',
        );
      }
      if (args.activeCount != null) {
        throw new BadRequestException(
          'Individual CHEMISTRY_MIX item pricing cannot use activeCount',
        );
      }
      return;
    }

    if (args.formType === 'COA') {
      if (args.priceBasis !== 'FLAT') {
        throw new BadRequestException('COA pricing must use FLAT price basis');
      }
      if (args.activeCount != null) {
        throw new BadRequestException('COA pricing cannot use activeCount');
      }
      if (!args.itemKey && !args.allowLegacyItemless) {
        throw new BadRequestException(
          'COA pricing requires itemKey for the selected COA item',
        );
      }
    }
  }

  /* =========================================================
     OVERLAP PROTECTION
  ========================================================= */

  private async assertNoOverlap(
    db: PriceDb,
    args: {
      clientCode: string;
      department: BillingDepartment;
      formType: FormType;
      testKey: string;
      itemKey: string | null;
      activeCount: number | null;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      excludeId?: string;
    },
  ) {
    const where: Prisma.BillingPriceRuleWhereInput = {
      clientCode: args.clientCode,
      department: args.department,
      formType: args.formType,
      testKey: args.testKey,
      itemKey: args.itemKey,
      activeCount: args.activeCount,
      active: true,

      ...(args.excludeId
        ? {
            id: {
              not: args.excludeId,
            },
          }
        : {}),

      /*
       * Existing rule must end after our start,
       * or have no end.
       */
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gt: args.effectiveFrom,
          },
        },
      ],

      /*
       * Existing rule must begin before our end.
       *
       * If our end is null, there is no upper bound.
       */
      ...(args.effectiveTo
        ? {
            effectiveFrom: {
              lt: args.effectiveTo,
            },
          }
        : {}),
    };

    const conflict =
      await db.billingPriceRule.findFirst({
        where,
        orderBy: {
          effectiveFrom: 'desc',
        },
      });

    if (conflict) {
      throw new BadRequestException(
        `An overlapping pricing rule already exists for ${args.clientCode} / ${args.formType} / ${args.testKey}${args.itemKey ? ` / ${args.itemKey}` : ''}`,
      );
    }
  }

  /* =========================================================
     AUDIT
  ========================================================= */

  private async audit(
    user: AuthUser,
    action: string,
    rule: {
      id: string;
      clientCode: string;
      formType: FormType;
    },
    changes: Record<string, any>,
  ) {
    const ctx = getRequestContext();

    await this.prisma.auditTrail.create({
      data: {
        action,
        entity: 'BILLING_PRICE_RULE',
        entityId: rule.id,

        userId: user.userId,
        role: user.role,

        ipAddress: ctx?.ip ?? null,

        clientCode: rule.clientCode,

        formType: rule.formType,

        details: action.replace(/_/g, ' '),

        changes:
          changes as Prisma.InputJsonValue,
      },
    });
  }

  /* =========================================================
     LIST
  ========================================================= */

  async list(
    user: AuthUser,
    query: {
      clientCode?: string;
      department?: BillingDepartment;
      formType?: FormType;
      active?: string | boolean;
    },
  ) {
    this.assertReader(user);

    const where: Prisma.BillingPriceRuleWhereInput = {};

    if (query.clientCode) {
      where.clientCode =
        this.normalizeClientCode(query.clientCode);
    }

    if (query.department) {
      where.department = query.department;
    }

    if (query.formType) {
      where.formType = query.formType;
    }

    if (
      query.active === true ||
      query.active === 'true'
    ) {
      where.active = true;
    }

    if (
      query.active === false ||
      query.active === 'false'
    ) {
      where.active = false;
    }

    const rows =
      await this.prisma.billingPriceRule.findMany({
        where,

        orderBy: [
          {
            clientCode: 'asc',
          },
          {
            formType: 'asc',
          },
          {
            testKey: 'asc',
          },
          {
            itemKey: 'asc',
          },
          {
            effectiveFrom: 'desc',
          },
        ],
      });

    return rows.map((row) => ({
      ...row,

      unitPrice:
        row.unitPrice.toFixed(2),
    }));
  }

  /* =========================================================
     CREATE
  ========================================================= */

  async create(
    user: AuthUser,
    dto: CreatePriceRuleDto,
  ) {
    this.assertManager(user);

    const clientCode =
      this.normalizeClientCode(dto.clientCode);

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
        select: {
          clientCode: true,
        },
      });

    if (!client) {
      throw new BadRequestException(
        `Unknown clientCode: ${clientCode}`,
      );
    }

    let testKey =
      this.normalizeTestKey(dto.testKey);

    if (dto.formType === 'COA') {
      testKey = 'COA';
    }

    if (!testKey) {
      throw new BadRequestException(
        'testKey is required',
      );
    }

    const itemKey =
      dto.itemKey == null
        ? null
        : this.normalizeItemKey(dto.itemKey) || null;

    const activeCount =
      dto.activeCount ?? null;

    this.validatePricingShape({
      department: dto.department,
      formType: dto.formType,
      priceBasis: dto.priceBasis,
      activeCount,
      itemKey,
      allowLegacyItemless: false,
    });

    const unitPrice =
      this.parseMoney(dto.unitPrice);

    const effectiveFrom =
      this.parseDate(
        dto.effectiveFrom,
        'effectiveFrom',
      ) ?? new Date();

    const effectiveTo =
      this.parseDate(
        dto.effectiveTo,
        'effectiveTo',
      );

    if (
      effectiveTo &&
      effectiveTo <= effectiveFrom
    ) {
      throw new BadRequestException(
        'effectiveTo must be after effectiveFrom',
      );
    }

    await this.assertNoOverlap(
      this.prisma,
      {
        clientCode,
        department: dto.department,
        formType: dto.formType,
        testKey,
        itemKey,
        activeCount,
        effectiveFrom,
        effectiveTo,
      },
    );

    const created =
      await this.prisma.billingPriceRule.create({
        data: {
          clientCode,

          department: dto.department,

          formType: dto.formType,

          testKey,

          testLabel:
            dto.testLabel?.trim() || null,

          itemKey,

          itemLabel:
            dto.itemLabel?.trim() || null,

          activeCount,

          priceBasis:
            dto.priceBasis,

          unitPrice,

          active:
            dto.active ?? true,

          effectiveFrom,
          effectiveTo,

          createdBy:
            user.userId,

          updatedBy:
            user.userId,
        },
      });

    await this.audit(
      user,
      'BILLING_PRICE_CREATED',
      created,
      {
        clientCode,
        department: created.department,
        formType: created.formType,
        testKey: created.testKey,
        itemKey: created.itemKey,
        itemLabel: created.itemLabel,
        activeCount: created.activeCount,
        priceBasis: created.priceBasis,
        unitPrice:
          created.unitPrice.toFixed(2),
        effectiveFrom:
          created.effectiveFrom.toISOString(),
        effectiveTo:
          created.effectiveTo?.toISOString() ??
          null,
      },
    );

    return {
      ...created,
      unitPrice:
        created.unitPrice.toFixed(2),
    };
  }

  /* =========================================================
     UPDATE / VERSION PRICE
  ========================================================= */

  async update(
    user: AuthUser,
    id: string,
    dto: UpdatePriceRuleDto,
  ) {
    this.assertManager(user);

    const existing =
      await this.prisma.billingPriceRule.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        'Billing price rule not found',
      );
    }

    /*
     * Changing any pricing dimension creates
     * a NEW version instead of overwriting history.
     */
    const versionPrice =
      dto.unitPrice !== undefined ||
      dto.priceBasis !== undefined ||
      dto.activeCount !== undefined ||
      dto.effectiveFrom !== undefined;

    if (!versionPrice) {
      const effectiveTo =
        dto.effectiveTo !== undefined
          ? this.parseDate(
              dto.effectiveTo,
              'effectiveTo',
            )
          : existing.effectiveTo;

      if (
        effectiveTo &&
        effectiveTo <= existing.effectiveFrom
      ) {
        throw new BadRequestException(
          'effectiveTo must be after effectiveFrom',
        );
      }

      const updated =
        await this.prisma.billingPriceRule.update({
          where: {
            id,
          },

          data: {
            ...(dto.testLabel !== undefined
              ? {
                  testLabel:
                    dto.testLabel?.trim() ||
                    null,
                }
              : {}),

            ...(dto.itemLabel !== undefined
              ? {
                  itemLabel:
                    dto.itemLabel?.trim() ||
                    null,
                }
              : {}),

            ...(dto.active !== undefined
              ? {
                  active: dto.active,
                }
              : {}),

            ...(dto.effectiveTo !== undefined
              ? {
                  effectiveTo,
                }
              : {}),

            updatedBy:
              user.userId,
          },
        });

      await this.audit(
        user,
        dto.active === false
          ? 'BILLING_PRICE_DISABLED'
          : 'BILLING_PRICE_UPDATED',
        updated,
        {
          active: updated.active,
          testLabel: updated.testLabel,
          itemKey: updated.itemKey,
          itemLabel: updated.itemLabel,
          effectiveTo:
            updated.effectiveTo?.toISOString() ??
            null,
        },
      );

      return {
        ...updated,
        unitPrice:
          updated.unitPrice.toFixed(2),
      };
    }

    const nextEffectiveFrom =
      this.parseDate(
        dto.effectiveFrom,
        'effectiveFrom',
      ) ?? new Date();

    if (
      nextEffectiveFrom <=
      existing.effectiveFrom
    ) {
      throw new BadRequestException(
        'New price effectiveFrom must be after the current rule effectiveFrom',
      );
    }

    if (
      existing.effectiveTo &&
      nextEffectiveFrom >=
        existing.effectiveTo
    ) {
      throw new BadRequestException(
        'This pricing rule has already ended. Create a new rule instead.',
      );
    }

    const nextEffectiveTo =
      dto.effectiveTo !== undefined
        ? this.parseDate(
            dto.effectiveTo,
            'effectiveTo',
          )
        : null;

    if (
      nextEffectiveTo &&
      nextEffectiveTo <=
        nextEffectiveFrom
    ) {
      throw new BadRequestException(
        'effectiveTo must be after effectiveFrom',
      );
    }

    const nextPriceBasis =
      dto.priceBasis ??
      existing.priceBasis;

    const nextActiveCount =
      dto.activeCount !== undefined
        ? dto.activeCount
        : existing.activeCount;

    this.validatePricingShape({
      department:
        existing.department,

      formType:
        existing.formType,

      priceBasis:
        nextPriceBasis,

      activeCount:
        nextActiveCount,

      itemKey:
        existing.itemKey,

      allowLegacyItemless:
        existing.itemKey == null,
    });

    const nextUnitPrice =
      dto.unitPrice !== undefined
        ? this.parseMoney(
            dto.unitPrice,
          )
        : existing.unitPrice;

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * Close the old version exactly when
           * the new version begins.
           */
          await tx.billingPriceRule.update({
            where: {
              id: existing.id,
            },

            data: {
              effectiveTo:
                nextEffectiveFrom,

              updatedBy:
                user.userId,
            },
          });

          await this.assertNoOverlap(
            tx,
            {
              clientCode:
                existing.clientCode,

              department:
                existing.department,

              formType:
                existing.formType,

              testKey:
                existing.testKey,

              itemKey:
                existing.itemKey,

              activeCount:
                nextActiveCount,

              effectiveFrom:
                nextEffectiveFrom,

              effectiveTo:
                nextEffectiveTo,

              excludeId:
                existing.id,
            },
          );

          return tx.billingPriceRule.create({
            data: {
              clientCode:
                existing.clientCode,

              department:
                existing.department,

              formType:
                existing.formType,

              testKey:
                existing.testKey,

              testLabel:
                dto.testLabel !== undefined
                  ? dto.testLabel?.trim() ||
                    null
                  : existing.testLabel,

              itemKey:
                existing.itemKey,

              itemLabel:
                dto.itemLabel !== undefined
                  ? dto.itemLabel?.trim() ||
                    null
                  : existing.itemLabel,

              activeCount:
                nextActiveCount,

              priceBasis:
                nextPriceBasis,

              unitPrice:
                nextUnitPrice,

              active:
                dto.active ??
                true,

              effectiveFrom:
                nextEffectiveFrom,

              effectiveTo:
                nextEffectiveTo,

              createdBy:
                user.userId,

              updatedBy:
                user.userId,
            },
          });
        },
      );

    await this.audit(
      user,
      'BILLING_PRICE_UPDATED',
      result,
      {
        replacesRuleId:
          existing.id,

        previousUnitPrice:
          existing.unitPrice.toFixed(2),

        unitPrice:
          result.unitPrice.toFixed(2),

        effectiveFrom:
          result.effectiveFrom.toISOString(),

        itemKey:
          result.itemKey,

        itemLabel:
          result.itemLabel,

        activeCount:
          result.activeCount,

        priceBasis:
          result.priceBasis,
      },
    );

    return {
      ...result,
      unitPrice:
        result.unitPrice.toFixed(2),
    };
  }

  /* =========================================================
     DELETE UNUSED PRICE RULE
  ========================================================= */

  async remove(
    user: AuthUser,
    id: string,
  ) {
    this.assertManager(user);

    const existing =
      await this.prisma.billingPriceRule.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        'Billing price rule not found',
      );
    }

    /*
     * Never physically delete a pricing rule that already
     * participated in an invoice.
     *
     * BillingInvoiceLine stores pricingRuleId as a historical
     * snapshot reference. Once used, the correct action is
     * Disable, not Delete.
     */
    const usageCount =
      await this.prisma.billingInvoiceLine.count({
        where: {
          pricingRuleId: id,
        },
      });

    if (usageCount > 0) {
      throw new BadRequestException(
        `This pricing rule has already been used on ${usageCount} invoice line${usageCount === 1 ? '' : 's'} and cannot be deleted. Disable it instead.`,
      );
    }

    /*
     * Audit the complete rule before deleting it so the
     * administrative action remains traceable.
     */
    await this.audit(
      user,
      'BILLING_PRICE_DELETED',
      existing,
      {
        clientCode:
          existing.clientCode,

        department:
          existing.department,

        formType:
          existing.formType,

        testKey:
          existing.testKey,

        testLabel:
          existing.testLabel,

        itemKey:
          existing.itemKey,

        itemLabel:
          existing.itemLabel,

        activeCount:
          existing.activeCount,

        priceBasis:
          existing.priceBasis,

        unitPrice:
          existing.unitPrice.toFixed(2),

        active:
          existing.active,

        effectiveFrom:
          existing.effectiveFrom.toISOString(),

        effectiveTo:
          existing.effectiveTo?.toISOString() ??
          null,
      },
    );

    await this.prisma.billingPriceRule.delete({
      where: {
        id,
      },
    });

    return {
      ok: true,
      id,
    };
  }

  /* =========================================================
     BATCH RULE LOAD
  ========================================================= */

  async getRulesForPeriod(
    clientCodes: string[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    if (!clientCodes.length) {
      return [];
    }

    return this.prisma.billingPriceRule.findMany({
      where: {
        clientCode: {
          in: clientCodes,
        },

        active: true,

        effectiveFrom: {
          lt: periodEnd,
        },

        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gt: periodStart,
            },
          },
        ],
      },

      /*
       * Latest effective rule wins if two records
       * somehow survive with the same specificity.
       */
      orderBy: {
        effectiveFrom: 'desc',
      },
    });
  }

  /* =========================================================
     RESOLVE PRICE
  ========================================================= */

  resolveFromRules(
    rules: BillingPriceRule[],
    args: {
      clientCode: string;
      formType: FormType;
      testKey: string;
      itemKey?: string | null;
      activeCount: number | null;
      at: Date;
    },
  ): {
    pricingRuleId: string | null;
    priceBasis: BillingPriceBasis;
    unitPrice: Prisma.Decimal | null;
    quantity: number;
    amount: Prisma.Decimal | null;
    pricingIssue: string | null;
  } {
    const clientCode =
      this.normalizeClientCode(args.clientCode);

    const testKey =
      this.normalizeTestKey(args.testKey);

    const itemKey =
      args.itemKey == null
        ? null
        : this.normalizeItemKey(args.itemKey) || null;

    const applicable =
      rules.filter((rule) => {
        if (rule.clientCode !== clientCode) return false;
        if (rule.formType !== args.formType) return false;
        if (rule.testKey !== testKey) return false;

        const ruleItemKey =
          rule.itemKey == null
            ? null
            : this.normalizeItemKey(rule.itemKey) || null;

        /*
         * Exact item match only.
         *
         * An item-specific candidate must NOT silently fall
         * back to an old itemKey=null rule.
         */
        if (ruleItemKey !== itemKey) return false;

        if (rule.effectiveFrom > args.at) return false;

        if (
          rule.effectiveTo &&
          rule.effectiveTo <= args.at
        ) {
          return false;
        }

        return true;
      });

    /*
     * Legacy active-count rules remain supported when
     * itemKey is null.
     */
    const exact =
      args.activeCount != null
        ? applicable.find(
            (rule) =>
              rule.activeCount === args.activeCount,
          )
        : undefined;

    const generic =
      applicable.find(
        (rule) =>
          rule.activeCount == null,
      );

    const rule =
      exact ?? generic;

    const identity =
      `${clientCode} / ${args.formType} / ${testKey}` +
      (itemKey ? ` / ${itemKey}` : '');

    if (!rule) {
      return {
        pricingRuleId: null,
        priceBasis: 'FLAT',
        unitPrice: null,
        quantity: 1,
        amount: null,
        pricingIssue:
          `No pricing rule configured for ${identity}`,
      };
    }

    if (rule.priceBasis === 'PER_ACTIVE') {
      if (
        args.activeCount == null ||
        args.activeCount < 1
      ) {
        return {
          pricingRuleId: rule.id,
          priceBasis: rule.priceBasis,
          unitPrice: rule.unitPrice,
          quantity: 0,
          amount: null,
          pricingIssue:
            'Active count is required for PER_ACTIVE pricing',
        };
      }

      return {
        pricingRuleId: rule.id,
        priceBasis: rule.priceBasis,
        unitPrice: rule.unitPrice,
        quantity: args.activeCount,
        amount: rule.unitPrice.mul(args.activeCount),
        pricingIssue: null,
      };
    }

    return {
      pricingRuleId: rule.id,
      priceBasis: rule.priceBasis,
      unitPrice: rule.unitPrice,
      quantity: 1,
      amount: rule.unitPrice,
      pricingIssue: null,
    };
  }
}