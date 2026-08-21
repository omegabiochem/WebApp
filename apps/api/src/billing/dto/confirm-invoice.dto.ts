import {
  IsOptional,
  IsString,
} from 'class-validator';

export class ConfirmInvoiceDto {
  /*
   * Optional final invoice notes.
   *
   * If omitted, existing draft notes remain.
   */
  @IsOptional()
  @IsString()
  notes?: string | null;
}