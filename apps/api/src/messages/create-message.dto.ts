import { IsArray, IsOptional, IsString, ValidateIf } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  mentions?: UserRole[];

  @IsOptional()
  attachments?: any;

  @IsOptional()
  reportId?: string;

  @IsOptional()
  chemistryId?: string;

  @IsOptional()
  @IsString()
  clientCode?: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;
}