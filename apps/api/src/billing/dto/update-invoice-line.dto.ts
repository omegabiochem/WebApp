import {
  IsDefined,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateInvoiceLineDto {
  /*
   * Final validation/conversion to Prisma.Decimal
   * happens inside BillingService.
   */
  @IsDefined()
  unitPrice!: number | string;

  @IsString()
  @MinLength(3)
  reason!: string;
}