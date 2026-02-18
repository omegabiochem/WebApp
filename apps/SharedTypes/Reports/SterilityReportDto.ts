// Shared DTO for frontend <-> backend
export type SterilityReportDTO = {
  id: string;
  status: string;
  formNumber: string;
  reportNumber?: string | null;
  prefix?: string | null;
  client: string | null;
  dateSent: string | null;
  sampleType?: string | null;
  typeOfTest?: string | null;
  formulaNo?: string | null;
  description?: string | null;
  lotNo?: string | null;
  manufactureDate?: string | null;
  testSopNo?: string | null;
  dateTested?: string | null;
  dateCompleted?: string | null;
  ftm_turbidity: string | null;
  ftm_observation: string | null;
  ftm_result: string | null;

  scdb_turbidity: string | null;
  scdb_observation: string | null;
  scdb_result: string | null;

  comments?: string | null;
  testedBy?: string | null;
  reviewedBy?: string | null;
  testedDate?: string | null;
  reviewedDate?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

