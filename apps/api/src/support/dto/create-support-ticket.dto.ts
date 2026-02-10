import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export enum SupportTicketCategory {
  LOGIN_ACCESS = "LOGIN_ACCESS",
  OTP_VERIFICATION = "OTP_VERIFICATION",
  REPORTS_WORKFLOW = "REPORTS_WORKFLOW",
  ATTACHMENTS_PRINTING = "ATTACHMENTS_PRINTING",
  PERFORMANCE = "PERFORMANCE",
  BUG_ERROR = "BUG_ERROR",
  OTHER = "OTHER",
}

export class CreateSupportTicketDto {
  @IsEnum(SupportTicketCategory)
  category!: SupportTicketCategory;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reportId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  reportType?: string;

  @IsString()
  @MaxLength(5000)
  description!: string;

  // optional client info
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientTime?: string;

  @IsOptional()
  meta?: any;
}