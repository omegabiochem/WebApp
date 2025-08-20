export type HeaderDto = {
    client: string;
    dateSent?: string | null;
    testType?: string | null;
    sampleType?: string | null;
    formulaNo?: string | null;
    description?: string | null;
    lotNo?: string | null;
    manufactureDate?: string | null;
    testSop?: string | null;
    dateTested?: string | null;
    preliminaryResults?: string | null;
    preliminaryDate?: string | null;
    dateCompleted?: string | null;
  };
  
  export type MicroChemDto = {
    totalBacterialCount?: string | null;
    totalMoldYeastCount?: string | null;
    pathogen_ecoli?: string | null;
    pathogen_paeruginosa?: string | null;
    pathogen_saureus?: string | null;
    pathogen_salmonella?: string | null;
    pathogen_clostridia?: string | null;
    pathogen_calbicans?: string | null;
    pathogen_bcepacia?: string | null;
    pathogen_other?: string | null;
    comments?: string | null;
  };
  
  export type CreateReportDto = HeaderDto;       // created by Frontdesk/Admin
  export type UpdateHeaderDto = HeaderDto;      // Frontdesk/Admin can edit while DRAFT
  export type UpdateMicroChemDto = MicroChemDto; // Micro/Chem/Admin edit while DRAFT/SUBMITTED
  