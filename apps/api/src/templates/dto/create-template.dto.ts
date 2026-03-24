
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { FormType } from '@prisma/client';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEnum(FormType)
  formType: FormType;

  // ADMIN/SYSTEMADMIN may set this; CLIENT must not override their own
  @IsOptional()
  @IsString()
  clientCode?: string;

  // template body (your form JSON)
  @IsObject()
  data: Record<string, any>;
}