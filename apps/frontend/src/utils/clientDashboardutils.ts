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

export function parseIntSafe(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type DatePreset =
  | "ALL"
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "CUSTOM";
// src/utils/searchUtils.ts

export type SearchableReportLike = {
  id?: string;
  client?: string | null;
  formType?: string | null;
  status?: string | null;
  formNumber?: string | null;
reportNumber?: string | number | null;

  dateSent?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;

  typeOfTest?: string | null;
  sampleType?: string | null;
  formulaNo?: string | null;
  description?: string | null;
  lotNo?: string | null;
  manufactureDate?: string | Date | null;

  sampleDescription?: string | null;
  lotBatchNo?: string | null;
  formulaId?: string | null;
  sampleSize?: string | null;
  numberOfActives?: string | null;
  comments?: string | null;

  idNo?: string | null;
  samplingDate?: string | Date | null;

  preliminaryResults?: string | null;
  tbc_result?: string | null;
  tbc_spec?: string | null;
  tmy_result?: string | null;
  tmy_spec?: string | null;

  volumeTested?: string | null;
  ftm_result?: string | null;
  scdb_result?: string | null;

  testedBy?: string | null;
  reviewedBy?: string | null;

  pathogens?: unknown;
  sampleTypes?: unknown;
  testTypes?: unknown;
  sampleCollected?: unknown;
  actives?: unknown;
  coaRows?: unknown;
};

export function toSearchableText(value: unknown): string {
  if (value == null) return "";

  if (typeof value === "string") return value.toLowerCase();

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }

  if (value instanceof Date) {
    return value.toISOString().toLowerCase();
  }

  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

export function getReportSearchBlob(r: SearchableReportLike): string {
  return [
    r.id,
    r.client,
    r.formType,
    r.status,
    r.formNumber,
    r.reportNumber,

    r.dateSent,
    r.createdAt,
    r.updatedAt,

    r.typeOfTest,
    r.sampleType,
    r.formulaNo,
    r.description,
    r.lotNo,
    r.manufactureDate,

    r.sampleDescription,
    r.lotBatchNo,
    r.formulaId,
    r.sampleSize,
    r.numberOfActives,
    r.comments,

    r.idNo,
    r.samplingDate,

    r.preliminaryResults,
    r.tbc_result,
    r.tbc_spec,
    r.tmy_result,
    r.tmy_spec,

    r.volumeTested,
    r.ftm_result,
    r.scdb_result,

    r.testedBy,
    r.reviewedBy,

    r.pathogens,
    r.sampleTypes,
    r.testTypes,
    r.sampleCollected,
    r.actives,
    r.coaRows,
  ]
    .map(toSearchableText)
    .join(" ");
}