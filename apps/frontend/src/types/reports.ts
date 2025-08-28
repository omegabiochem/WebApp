// export type ReportStatus = "DRAFT" | "SUBMITTED" | "QA_APPROVED" | "LOCKED";

// export type PathogenChoice = "ABSENT" | "PRESENT";

// export interface Report {
//   id: string;
//   // Header
//   client: string;
//   dateSent?: string | null;
//   testType?: string | null;
//   sampleType?: string | null;
//   formulaNo?: string | null;
//   description?: string | null;
//   lotNo?: string | null;
//   manufactureDate?: string | null;
//   testSop?: string | null;
//   dateTested?: string | null;
//   preliminaryResults?: string | null;
//   preliminaryDate?: string | null;
//   dateCompleted?: string | null;

//   // Micro/Chem (stored as free text like the paper form)
//   totalBacterialCount?: string | null;    // e.g., "x10^1 ... CFU/ml"
//   totalMoldYeastCount?: string | null;

//   pathogen_ecoli?: string | null;        // "Absent" | "Present in 1g"
//   pathogen_paeruginosa?: string | null;
//   pathogen_saureus?: string | null;
//   pathogen_salmonella?: string | null;
//   pathogen_clostridia?: string | null;   // "Present in 3g" matches spec note
//   pathogen_calbicans?: string | null;
//   pathogen_bcepacia?: string | null;
//   pathogen_other?: string | null;
//   comments?: string | null;

//   testedByUserId?: string | null;
//   testedAt?: string | null;
//   reviewedByUserId?: string | null;
//   reviewedAt?: string | null;

//   status: ReportStatus;
//   createdAt?: string;
//   updatedAt?: string;
// }
