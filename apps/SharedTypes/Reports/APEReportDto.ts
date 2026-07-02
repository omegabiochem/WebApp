// Shared DTO for frontend <-> backend
export type APEReportDTO = {
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
  organisms?: any;
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

