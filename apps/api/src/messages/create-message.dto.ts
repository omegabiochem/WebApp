import { IsArray, IsOptional, IsString } from "class-validator";
import { UserRole } from "@prisma/client";

export class CreateMessageDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  mentions?: UserRole[];

  @IsOptional()
  attachments?: any;

  @IsOptional()
  reportId?: string;

  @IsOptional()
  chemistryId?: string;

  // ✅ LAB only
  @IsOptional()
  @IsString()
  clientCode?: string;

  // ✅ NEW — reply support
  @IsOptional()
  @IsString()
  replyToMessageId?: string;
}