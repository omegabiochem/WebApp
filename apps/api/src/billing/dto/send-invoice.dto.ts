import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendInvoiceDto {
  @IsOptional()
  @IsEmail()
  toEmail?: string;

  @IsOptional()
  @IsArray()
  @IsEmail(
    {},
    {
      each: true,
    },
  )
  ccEmails?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  messageBody?: string;

  /*
   * SENT invoices require resend=true
   * to avoid accidental duplicate sends.
   */
  @IsOptional()
  @IsBoolean()
  resend?: boolean;
}