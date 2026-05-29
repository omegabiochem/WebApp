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
  | "dateReceived"
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
  | "dateReceived"
  | "dateTested"
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
  { key: "dateReceived", label: "dateReceived" },
  { key: "dateTested", label: "dateTested" },
  { key: "createdAt", label: "createdAt" },
  { key: "updatedAt", label: "updatedAt" },
];
export const MAX_COLS = 4;

export const ROW_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-50",
  SUBMITTED_BY_CLIENT: "bg-amber-50",
  UNDER_DRAFT_REVIEW: "bg-sky-50",
  UNDER_TESTING_REVIEW: "bg-cyan-50",
  UNDER_RESUBMISSION_TESTING_REVIEW: "bg-cyan-50",
  UNDER_QA_REVIEW: "bg-violet-50",
  UNDER_ADMIN_REVIEW: "bg-fuchsia-50",
  UNDER_CLIENT_REVIEW: "bg-emerald-50",

  CLIENT_NEEDS_CORRECTION: "bg-yellow-50",
  FRONTDESK_NEEDS_CORRECTION: "bg-yellow-50",
  TESTING_NEEDS_CORRECTION: "bg-yellow-50",
  QA_NEEDS_CORRECTION: "bg-yellow-50",
  ADMIN_NEEDS_CORRECTION: "bg-yellow-50",

  CHANGE_REQUESTED: "bg-orange-50",
  CORRECTION_REQUESTED: "bg-rose-50",
  UNDER_CHANGE_UPDATE: "bg-orange-50",
  UNDER_CORRECTION_UPDATE: "bg-rose-50",

  APPROVED: "bg-green-50",
  FINAL_APPROVED: "bg-green-50",
  PRELIMINARY_APPROVED: "bg-green-50",

  LOCKED: "bg-zinc-100",
  VOID: "bg-red-50",

  FRONTDESK_ON_HOLD: "bg-neutral-50",
  TESTING_ON_HOLD: "bg-neutral-50",
  PRELIMINARY_TESTING_ON_HOLD: "bg-neutral-50",
  FINAL_TESTING_ON_HOLD: "bg-neutral-50",
};

export function isTerminalStatus(status?: string) {
  const s = String(status || "").toUpperCase();
  return (
    s === "VOID" || s === "LOCKED" || s === "FINAL_APPROVED" || s === "APPROVED"
  );
}

export const AUDIT_ACTION_COLORS: Record<string, string> = {
  // Authentication
  LOGIN: "bg-blue-50 text-blue-800 border border-blue-200",

  LOGIN_FAILED: "bg-rose-50 text-rose-800 border border-rose-200",

  LOGOUT: "bg-slate-50 text-slate-700 border border-slate-200",

  PASSWORD_CHANGE: "bg-indigo-50 text-indigo-800 border border-indigo-200",

  // Workflow
  STATUS_CHANGE: "bg-violet-50 text-violet-800 border border-violet-200",

  APPROVED: "bg-emerald-50 text-emerald-800 border border-emerald-200",

  REJECTED: "bg-red-50 text-red-800 border border-red-200",

  HOLD: "bg-slate-100 text-slate-800 border border-slate-300",

  // Corrections
  CORRECTION_CREATED: "bg-amber-50 text-amber-800 border border-amber-200",

  CORRECTION_REQUESTED: "bg-orange-50 text-orange-800 border border-orange-200",

  CORRECTION_RESOLVED: "bg-teal-50 text-teal-800 border border-teal-200",

  CORRECTION_RESOLVED_BY_SYSTEMADMIN:
    "bg-cyan-50 text-cyan-800 border border-cyan-300",

  CHANGE_REQUESTED: "bg-yellow-50 text-yellow-800 border border-yellow-300",

  // E-sign
  ESIGN_VERIFIED: "bg-green-50 text-green-800 border border-green-200",

  ESIGN_REJECTED: "bg-rose-50 text-rose-800 border border-rose-300",

  // Data
  CREATED: "bg-sky-50 text-sky-800 border border-sky-200",

  UPDATED: "bg-indigo-50 text-indigo-800 border border-indigo-200",

  DELETED: "bg-red-100 text-red-900 border border-red-300",

  VOIDED: "bg-neutral-200 text-neutral-900 border border-neutral-400",

  PRINT: "bg-purple-50 text-purple-800 border border-purple-200",

  VIEW: "bg-slate-50 text-slate-700 border border-slate-200",

  EXPORT: "bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200",

  DEFAULT: "bg-slate-100 text-slate-700 border border-slate-300",
};
