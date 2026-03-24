export type COAReportDTO = {
  id: string; // ChemistryReport.id
  formNumber: string;
  reportNumber?: string | null;
  prefix?: string | null;

  // ✅ MUST be COA and should not be optional
  formType: "COA";

  status: string; // ChemistryReportStatus (as string)
  lockedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;

  // ✅ COADetails.chemistryId (same as ChemistryReport.id)
  chemistryId: string;

  // header (COADetails)
  client?: string | null;
  dateSent?: string | null;
  sampleDescription?: string | null;
  coaVerification?: boolean; // ✅ from schema (default false)

  lotBatchNo?: string | null;
  manufactureDate?: string | null;
  formulaId?: string | null;
  sampleSize?: string | null;
  dateReceived?: string | null;


  // ✅ COADetails.coaRows Json?
  coaRows?: any;

  comments?: string | null;
  testedBy?: string | null;
  testedDate?: string | null;
  reviewedBy?: string | null;
  reviewedDate?: string | null;

  corrections?: any;
};