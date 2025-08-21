// export type HeaderDto = {
//     client: string;
//     dateSent?: string | null;
//     testType?: string | null;
//     sampleType?: string | null;
//     formulaNo?: string | null;
//     description?: string | null;
//     lotNo?: string | null;
//     manufactureDate?: string | null;
//     testSop?: string | null;
//     dateTested?: string | null;
//     preliminaryResults?: string | null;
//     preliminaryDate?: string | null;
//     dateCompleted?: string | null;
//   };
  
//   export type MicroChemDto = {
//     totalBacterialCount?: string | null;
//     totalMoldYeastCount?: string | null;
//     pathogen_ecoli?: string | null;
//     pathogen_paeruginosa?: string | null;
//     pathogen_saureus?: string | null;
//     pathogen_salmonella?: string | null;
//     pathogen_clostridia?: string | null;
//     pathogen_calbicans?: string | null;
//     pathogen_bcepacia?: string | null;
//     pathogen_other?: string | null;
//     comments?: string | null;
//   };
  
//   export type CreateReportDto = HeaderDto;       // created by Frontdesk/Admin
//   export type UpdateHeaderDto = HeaderDto;      // Frontdesk/Admin can edit while DRAFT
//   export type UpdateMicroChemDto = MicroChemDto; // Micro/Chem/Admin edit while DRAFT/SUBMITTED
  

import { IsOptional, IsString, IsDateString } from 'class-validator';

export class CreateReportDto {
  @IsString() client!: string;

  @IsOptional() @IsDateString() dateSent?: string;
  @IsOptional() @IsString() testType?: string;
  @IsOptional() @IsString() sampleType?: string;
  @IsOptional() @IsString() formulaNo?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() lotNo?: string;
  @IsOptional() @IsDateString() manufactureDate?: string;

  @IsOptional() @IsString() testSop?: string;
  @IsOptional() @IsDateString() dateTested?: string;
  @IsOptional() @IsString() preliminaryResults?: string;
  @IsOptional() @IsDateString() preliminaryDate?: string;
  @IsOptional() @IsDateString() dateCompleted?: string;
}

export class UpdateHeaderDto extends CreateReportDto {}

export class UpdateMicroDto {
  // TBC / TMYC
  @IsOptional() @IsString() tbcDilution?: string;
  @IsOptional() @IsString() tbcGramStain?: string;
  @IsOptional() @IsString() tbcResult?: string;

  @IsOptional() @IsString() tmycDilution?: string;
  @IsOptional() @IsString() tmycGramStain?: string;
  @IsOptional() @IsString() tmycResult?: string;

  // Pathogens — keep strings like "Absent" or "Present in 1g of sample"
  @IsOptional() @IsString() pathogen_ecoli?: string;
  @IsOptional() @IsString() pathogen_paeruginosa?: string;
  @IsOptional() @IsString() pathogen_saureus?: string;
  @IsOptional() @IsString() pathogen_salmonella?: string;
  @IsOptional() @IsString() pathogen_clostridia?: string;
  @IsOptional() @IsString() pathogen_calbicans?: string;
  @IsOptional() @IsString() pathogen_bcepacia?: string;
  @IsOptional() @IsString() pathogen_other?: string;

  @IsOptional() @IsString() comments?: string;
}
