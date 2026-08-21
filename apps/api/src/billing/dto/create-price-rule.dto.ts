import {
  BillingDepartment,
  BillingPriceBasis,
  FormType,
} from '@prisma/client';

import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePriceRuleDto {
  @IsString()
  clientCode!: string;

  @IsEnum(BillingDepartment)
  department!: BillingDepartment;

  @IsEnum(FormType)
  formType!: FormType;

  @IsString()
  testKey!: string;

  @IsOptional()
  @IsString()
  testLabel?: string | null;

  /*
   * Individual pricing item.
   *
   * MICRO:
   *   null
   *
   * CHEMISTRY_MIX examples:
   *   AVOBENZONE
   *   DIMETHICONE
   *   SALICYLIC_ACID
   *
   * COA examples:
   *   IDENTIFICATION
   *   WATER
   *   ASSAY
   */
  @IsOptional()
  @IsString()
  itemKey?: string | null;

  @IsOptional()
  @IsString()
  itemLabel?: string | null;

  /*
   * Legacy active-count pricing.
   *
   * New individual CHEMISTRY_MIX / COA rules
   * should leave this null.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  activeCount?: number | null;

  @IsEnum(BillingPriceBasis)
  priceBasis!: BillingPriceBasis;

  @IsDefined()
  unitPrice!: number | string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string | null;
}