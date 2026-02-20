import { IsEnum, IsObject, IsOptional, IsString, MaxLength, IsInt } from 'class-validator';
import { FormType } from '@prisma/client';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(FormType)
  formType?: FormType;

  // usually you should NOT allow changing clientCode after create
  // keep it out unless you explicitly want it

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  // optimistic locking
  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}