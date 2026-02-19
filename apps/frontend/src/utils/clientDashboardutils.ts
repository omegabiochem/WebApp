

export type ColKey =
  | "formNumber"
  | "client"
  | "formType"
  | "dateSent"
  | "typeOfTest"
  | "sampleType"
  | "formulaNo"
  | "description"
  | "lotNo"
  | "manufactureDate"
  | "createdAt"
  | "updatedAt";

export const COLS: Array<{ key: ColKey; label: string }> = [
  { key: "formNumber", label: "Form #" },
  { key: "client", label: "Client" },
  { key: "formType", label: "Form @" },
  { key: "dateSent", label: "Date Sent" },

  { key: "typeOfTest", label: "typeOfTest" },
  { key: "sampleType", label: "sampleType" },
  { key: "formulaNo", label: "formulaNo" },
  { key: "description", label: "description" },
  { key: "lotNo", label: "lotNo" },
  { key: "manufactureDate", label: "manufactureDate" },
  { key: "createdAt", label: "createdAt" },
  { key: "updatedAt", label: "updatedAt" },
];

export const MAX_COLS = 4;




