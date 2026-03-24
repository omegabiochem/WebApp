export function rememberedPath(path: string) {
  const saved = sessionStorage.getItem(`lastSearch:${path}`) || "";
  return `${path}${saved}`;
}

export function getParam(sp: URLSearchParams, key: string, fallback = "") {
  return sp.get(key) ?? fallback;
}

export function getEnum<T extends string>(
  sp: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = sp.get(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function getInt(sp: URLSearchParams, key: string, fallback: number) {
  const raw = sp.get(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export type ColKey =
  | "reportNumber"
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
  { key: "reportNumber", label: "Report #" },
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


export type ChemistryColKey =
  | "reportNumber"
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
  | "actives"
  | "createdAt"
  | "updatedAt";

export const ChemistryCOLS: Array<{ key: ChemistryColKey; label: string }> = [
  { key: "reportNumber", label: "Report #" },
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
  { key: "actives", label: "actives" },
  { key: "createdAt", label: "createdAt" },
  { key: "updatedAt", label: "updatedAt" },
];

export type DashboardColKey =
  | "reportNumber"
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
  | "actives"
  | "createdAt"
  | "updatedAt";

export const DashboardCOLS: Array<{ key: DashboardColKey; label: string }> = [
  { key: "reportNumber", label: "Report #" },
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
  { key: "actives", label: "actives" },
  { key: "createdAt", label: "createdAt" },
  { key: "updatedAt", label: "updatedAt" },
];
export const MAX_COLS = 4;
