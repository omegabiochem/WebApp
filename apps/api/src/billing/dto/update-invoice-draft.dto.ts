import {
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateInvoiceDraftDto {
  /*
   * May be positive or negative.
   *
   * Examples:
   *  10
   * -10
   * "25.50"
   */
  @IsOptional()
  adjustmentAmount?: number | string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}