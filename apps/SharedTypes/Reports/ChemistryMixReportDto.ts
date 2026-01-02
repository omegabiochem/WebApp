// Shared DTO for frontend <-> backend (Chemistry Mix)
export type ChemistryMixReportDTO = {
  id: string; // ChemistryReport.id
  formNumber: string;
  reportNumber?: string | null;
  prefix?: string | null;
  formType?: "CHEMISTRY_MIX"; // or string if you prefer
  status: string; // ChemistryReportStatus as string
  lockedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  chemistryId: string; // ChemistryMixDetails.chemistryId (same as report id)
  client?: string | null;
  dateSent?: string | null;
  sampleDescription?: string | null;
  testTypes?: Array<"ID" | "PERCENT_ASSAY" | "CONTENT_UNIFORMITY">; // TestType[]
  sampleCollected?: "TOP_BEG" | "MID" | "BOTTOM_END" | null; // SampleCollected?
  lotBatchNo?: string | null;
  manufactureDate?: string | null;
  formulaId?: string | null;
  sampleSize?: string | null;
  numberOfActives?: string | null;
  sampleTypes?: Array<
    | "BULK"
    | "FINISHED_GOOD"
    | "RAW_MATERIAL"
    | "PROCESS_VALIDATION"
    | "CLEANING_VALIDATION"
    | "COMPOSITE"
    | "DI_WATER_SAMPLE"
  >; // SampleType[]
  actives?: any; // or define a stricter shape below
  comments?: string | null;
  testedBy?: string | null;
  testedDate?: string | null;
  reviewedBy?: string | null;
  reviewedDate?: string | null;
  corrections?: any;
};
