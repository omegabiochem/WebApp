import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '@prisma/client';


export class CreateMessageDto {
  @IsOptional() @IsString() body?: string;
  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  mentions?: UserRole[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  mentionedUserIds?: string[];
  @IsOptional() @IsString() forwardedFromMessageId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  forwardToRoles?: UserRole[];
  @IsOptional() attachments?: any;
  @IsOptional() @IsString() reportId?: string;
  @IsOptional() @IsString() chemistryId?: string;
  @IsOptional() @IsString() clientCode?: string;
  @IsOptional() @IsString() replyToMessageId?: string;
}
