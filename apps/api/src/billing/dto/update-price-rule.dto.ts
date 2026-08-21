import { BillingPriceBasis } from '@prisma/client';

import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdatePriceRuleDto {
  @IsOptional()
  @IsString()
  testLabel?: string | null;

  /*
   * itemKey is intentionally not editable.
   * It is part of the logical pricing identity.
   *
   * Create a new rule when pricing a different
   * Chemistry active or COA item.
   */
  @IsOptional()
  @IsString()
  itemLabel?: string | null;

  /*
   * Supplying unitPrice creates a new effective-price
   * version instead of overwriting historical pricing.
   */
  @IsOptional()
  unitPrice?: number | string;

  @IsOptional()
  @IsEnum(BillingPriceBasis)
  priceBasis?: BillingPriceBasis;

  /*
   * Legacy active-count pricing only.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  activeCount?: number | null;

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