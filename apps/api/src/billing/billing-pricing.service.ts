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

  /*
   * Exact report-level client/customer name.
   *
   * We preserve readable casing in the database while
   * matching case-insensitively.
   */
  normalizeClientName(value: unknown): string | null {
    const client =
      String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ');

    return client || null;
  }

  private clientIdentity(value: unknown) {
    return (
      this.normalizeClientName(value)
        ?.toUpperCase() ??
      null
    );
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
      client: string | null;
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

      /*
       * A default clientCode rule (client=null) and an
       * exact-client rule are separate pricing identities.
       */
      client:
        args.client == null
          ? null
          : {
              equals: args.client,
              mode: 'insensitive',
            },

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
        `An overlapping pricing rule already exists for ${args.clientCode} / ${args.client ?? 'DEFAULT'} / ${args.formType} / ${args.testKey}${args.itemKey ? ` / ${args.itemKey}` : ''}`,
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
     CLIENT NAME DIRECTORY
  ========================================================= */

  /*
   * Collect every distinct report-level client name for one
   * clientCode and merge it into ClientNameDirectory.
   *
   * This is intentionally scoped to ONE clientCode so opening
   * the Pricing dropdown never scans the entire database.
   *
   * Existing MANUAL entries keep their source. AUTO sync only
   * refreshes the display name / lastSeenAt / active state.
   */
  private async syncClientNamesForCode(
    clientCodeInput: string,
  ) {
    const clientCode =
      this.normalizeClientCode(
        clientCodeInput,
      );

    if (!clientCode) {
      return {
        clientCode,
        discoveredCount: 0,
      };
    }

    const [
      microReports,
      chemistryReports,
    ] =
      await Promise.all([
        this.prisma.report.findMany({
          where: {
            clientCode,
          },

          select: {
            microMix: {
              select: {
                client: true,
              },
            },

            microMixWater: {
              select: {
                client: true,
              },
            },

            sterility: {
              select: {
                client: true,
              },
            },

            ape: {
              select: {
                client: true,
              },
            },
          },
        }),

        this.prisma.chemistryReport.findMany({
          where: {
            clientCode,
          },

          select: {
            chemistryMix: {
              select: {
                client: true,
              },
            },

            coa: {
              select: {
                client: true,
              },
            },
          },
        }),
      ]);

    const discovered =
      new Map<
        string,
        string
      >();

    const add = (
      value: unknown,
    ) => {
      const name =
        this.normalizeClientName(
          value,
        );

      if (!name) {
        return;
      }

      const normalizedName =
        this.clientIdentity(
          name,
        );

      if (!normalizedName) {
        return;
      }

      /*
       * First readable spelling wins during this sync.
       * Case/spacing variants map to the same normalized key.
       */
      if (
        !discovered.has(
          normalizedName,
        )
      ) {
        discovered.set(
          normalizedName,
          name,
        );
      }
    };

    for (
      const report of
      microReports
    ) {
      add(
        report.microMix?.client,
      );

      add(
        report.microMixWater?.client,
      );

      add(
        report.sterility?.client,
      );

      add(
        report.ape?.client,
      );
    }

    for (
      const report of
      chemistryReports
    ) {
      add(
        report.chemistryMix?.client,
      );

      add(
        report.coa?.client,
      );
    }

    const now =
      new Date();

    /*
     * Usually this is only a few names per clientCode.
     * Individual upserts keep the logic simple and preserve
     * MANUAL/AUTO provenance correctly.
     */
    for (
      const [
        normalizedName,
        name,
      ] of
      discovered.entries()
    ) {
      await this.prisma.clientNameDirectory.upsert({
        where: {
          clientCode_normalizedName: {
            clientCode,
            normalizedName,
          },
        },

        update: {
          name,

          active:
            true,

          lastSeenAt:
            now,
        },

        create: {
          clientCode,

          name,

          normalizedName,

          active:
            true,

          source:
            'AUTO',

          firstSeenAt:
            now,

          lastSeenAt:
            now,
        },
      });
    }

    return {
      clientCode,
      discoveredCount:
        discovered.size,
    };
  }

  /*
   * Pricing dropdown API.
   *
   * Calling this route automatically syncs current report data
   * first, then returns the directory. Therefore new client names
   * appear automatically the next time the user opens/selects
   * that clientCode in Pricing.
   */
  async listClientNames(
    user: AuthUser,
    clientCodeInput: string,
  ) {
    this.assertManager(
      user,
    );

    const clientCode =
      this.normalizeClientCode(
        clientCodeInput,
      );

    if (!clientCode) {
      throw new BadRequestException(
        'clientCode is required',
      );
    }

    const clientDetails =
      await this.prisma.clientDetails.findUnique({
        where: {
          clientCode,
        },

        select: {
          clientCode:
            true,

          name:
            true,

          active:
            true,
        },
      });

    if (!clientDetails) {
      throw new BadRequestException(
        `Unknown clientCode: ${clientCode}`,
      );
    }

    const sync =
      await this.syncClientNamesForCode(
        clientCode,
      );

    const rows =
      await this.prisma.clientNameDirectory.findMany({
        where: {
          clientCode,

          active:
            true,
        },

        orderBy: [
          {
            name:
              'asc',
          },
        ],
      });

    return {
      clientCode,

      clientCodeName:
        clientDetails.name ??
        null,

      clientCodeActive:
        clientDetails.active,

      discoveredCount:
        sync.discoveredCount,

      items:
        rows,
    };
  }

  /*
   * When an admin manually types a client while creating a
   * pricing rule, remember it permanently in the same directory.
   *
   * If that name was already AUTO-discovered, its original source
   * is preserved because the update does not overwrite `source`.
   */
  private async rememberManualClientName(
    user: AuthUser,
    clientCode: string,
    client: string | null,
  ) {
    if (!client) {
      return;
    }

    const normalizedName =
      this.clientIdentity(
        client,
      );

    if (!normalizedName) {
      return;
    }

    const now =
      new Date();

    await this.prisma.clientNameDirectory.upsert({
      where: {
        clientCode_normalizedName: {
          clientCode,
          normalizedName,
        },
      },

      update: {
        name:
          client,

        active:
          true,

        lastSeenAt:
          now,

        updatedBy:
          user.userId,
      },

      create: {
        clientCode,

        name:
          client,

        normalizedName,

        active:
          true,

        source:
          'MANUAL',

        firstSeenAt:
          now,

        lastSeenAt:
          now,

        createdBy:
          user.userId,

        updatedBy:
          user.userId,
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
      client?: string;
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

    if (query.client) {
      const client =
        this.normalizeClientName(
          query.client,
        );

      if (client) {
        where.client = {
          equals: client,
          mode: 'insensitive',
        };
      }
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
            client: 'asc',
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

    const pricingClient =
      this.normalizeClientName(
        dto.client,
      );

    const clientDetails =
      await this.prisma.clientDetails.findUnique({
        where: {
          clientCode,
        },
        select: {
          clientCode: true,
        },
      });

    if (!clientDetails) {
      throw new BadRequestException(
        `Unknown clientCode: ${clientCode}`,
      );
    }

    /*
     * A typed client name becomes a permanent dropdown option.
     * DEFAULT rules keep client=null and are not added.
     */
    await this.rememberManualClientName(
      user,
      clientCode,
      pricingClient,
    );

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
        client: pricingClient,
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

          client: pricingClient,

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
        client: created.client,
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

              client:
                existing.client,

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

              client:
                existing.client,

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

        client:
          existing.client,

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

      /*
       * Optional during rollout so older callers still compile.
       * Once BillingService is replaced, every new report
       * candidate supplies its exact report-level client.
       */
      client?: string | null;

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

    const client =
      this.normalizeClientName(
        args.client,
      );

    const clientIdentity =
      this.clientIdentity(
        client,
      );

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
     * CLIENT-SPECIFIC PRICE PRIORITY
     * -------------------------------------------------------
     *
     * 1. Exact client:
     *      JJL + Client A
     *
     * 2. Client-code default:
     *      JJL + client=null
     *
     * Existing rules created before this feature all have
     * client=null and therefore remain valid defaults.
     */
    const exactClientRules =
      clientIdentity == null
        ? []
        : applicable.filter(
            (rule) =>
              rule.client != null &&
              this.clientIdentity(
                rule.client,
              ) ===
                clientIdentity,
          );

    const defaultClientRules =
      applicable.filter(
        (rule) =>
          rule.client == null,
      );

    const pickRule = (
      pool: BillingPriceRule[],
    ) => {
      /*
       * Legacy active-count rules remain supported when
       * itemKey is null.
       */
      const exactActiveCount =
        args.activeCount != null
          ? pool.find(
              (rule) =>
                rule.activeCount ===
                  args.activeCount,
            )
          : undefined;

      const generic =
        pool.find(
          (rule) =>
            rule.activeCount ==
            null,
        );

      return (
        exactActiveCount ??
        generic
      );
    };

    const rule =
      pickRule(
        exactClientRules,
      ) ??
      pickRule(
        defaultClientRules,
      );

    const identity =
      `${clientCode}` +
      (client
        ? ` / ${client}`
        : ' / DEFAULT') +
      ` / ${args.formType} / ${testKey}` +
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