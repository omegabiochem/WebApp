import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SupportTicketStatus } from '@prisma/client';

export class UpdateSupportTicketStatusDto {
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;
}

export class AssignSupportTicketDto {
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  assignedToId!: string | null;
}

export class AddSupportTicketNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}