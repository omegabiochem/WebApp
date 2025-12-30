// chemistry-mix.dto.ts
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TestType, SampleCollected, SampleType, ChemistryReportStatus } from '@prisma/client';



export class ActiveToBeTestedDto {
  @IsString()
  name!: string;          // e.g. "Active 1"

  @IsOptional()
  @IsString()
  testMethod?: string;    // e.g. "HPLC", "Titration"

  @IsOptional()
  @IsString()
  specification?: string; // e.g. "95–105%"

  @IsOptional()
  @IsString()
  result?: string;        // e.g. "99.2%"
}


export class ChemistryMixDto {
  // ---------- Header / sample info ----------

  @IsOptional()
  @IsString()
  client?: string;

  @IsOptional()
  @IsDateString()
  dateSent?: string;              // ISO string from frontend

  @IsOptional()
  @IsString()
  sampleDescription?: string;

  // ---------- TYPE OF TEST (checkbox group) ----------

  @IsOptional()
  @IsArray()
  @IsEnum(TestType, { each: true })
  testTypes?: TestType[];         // [ 'ID', 'PERCENT_ASSAY', ... ]

  // ---------- SAMPLE COLLECTED (radio group) ----------

  @IsOptional()
  @IsEnum(SampleCollected)
  sampleCollected?: SampleCollected; // 'TOP_BEG' | 'MID' | 'BOTTOM_END'

  // ---------- LOT / FORMULA / SAMPLE SIZE / ACTIVES ----------

  @IsOptional()
  @IsString()
  lotBatchNo?: string;

  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  formulaId?: string;

  @IsOptional()
  @IsString()
  sampleSize?: string;

  @IsOptional()
  @IsString()
  numberOfActives?: string;

  // ---------- SAMPLE TYPE (checkbox group) ----------

  @IsOptional()
  @IsArray()
  @IsEnum(SampleType, { each: true })
  sampleTypes?: SampleType[];     // e.g. ['BULK', 'FINISHED_GOOD']

  // ---------- Actives table (stored as JSON) ----------

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActiveToBeTestedDto)
  actives?: ActiveToBeTestedDto[];  // will be saved into Prisma JSON field

  // ---------- Comments & signatures ----------

  @IsOptional()
  @IsString()
  comments?: string;

  @IsOptional()
  @IsString()
  testedBy?: string;

  @IsOptional()
  @IsDateString()
  testedDate?: string;

  @IsOptional()
  @IsString()
  reviewedBy?: string;

  @IsOptional()
  @IsDateString()
  reviewedDate?: string;

  // ---------- Status / audit fields (usually server-controlled) ----------

  @IsOptional()
  @IsEnum(ChemistryReportStatus)
  status?: ChemistryReportStatus;

  @IsOptional()
  @IsDateString()
  lockedAt?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  updatedBy?: string;

  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @IsOptional()
  @IsDateString()
  updatedAt?: string;

  @IsOptional()
  corrections?: any; // Json – can refine later to a specific type
}
