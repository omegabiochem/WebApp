import { IsInt, IsOptional, Min } from 'class-validator';

export class RemoveTemplateDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}