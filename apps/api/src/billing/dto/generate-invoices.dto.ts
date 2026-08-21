import {
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class GenerateInvoicesDto {
  /**
   * Billing month.
   *
   * Example:
   * 2026-08
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, {
    message:
      'month must use YYYY-MM format',
  })
  month?: string;

  /**
   * Optional client filter.
   *
   * Example:
   * JJL
   */
  @IsOptional()
  @IsString()
  clientCode?: string;
}