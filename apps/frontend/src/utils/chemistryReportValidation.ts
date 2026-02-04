import { useCallback, useMemo, useState } from "react";
import type { ChemistryReportStatus } from "./chemistryReportFormWorkflow";
import React from "react";
import { api } from "../lib/api";

export type ChemActiveRow = {
  key: string; // internal key, unique
  label: string; // what shows on the form
  checked: boolean; // "ACTIVE TO BE TESTED" checkbox
  bulkActiveLot: string;
  sopNo: string;
  formulaContent: string; // %
  result: string; // %
  dateTestedInitial: string; // "MM/DD/YYYY / AB"
  otherName?: string; // for "OTHER" active
};

// Default actives from the template
export const DEFAULT_CHEM_ACTIVES: ChemActiveRow[] = [
  {
    key: "ACID_VALUE",
    label: "ACID VALUE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "ALCONOX",
    label: "ALCONOX",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "ALCONOX_RESIDUAL",
    label: "ALCONOX RESIDUAL",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "ALLANTOIN",
    label: "ALLANTOIN",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "AVOBENZONE",
    label: "AVOBENZONE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "BISACODYL",
    label: "BISACODYL",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "BENZOPHENONE_3",
    label: "BENZOPHENONE - 3",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "COLLOIDAL_OATMEAL",
    label: "COLLOIDAL OATMEAL",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "DIMETHICONE",
    label: "DIMETHICONE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "DRIED_EXTRACT",
    label: "DRIED EXTRACT",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "GLYCERINE",
    label: "GLYCERINE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "HOMOSALATE",
    label: "HOMOSALATE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "HYDRO_CORTISONE",
    label: "HYDRO CORTISONE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "OCTOCRYLENE",
    label: "OCTOCRYLENE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "OCTYL_METHOXYCINNAMATE",
    label: "OCTYL METHOXYCINNAMATE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "OCTYL_SALICYLATE",
    label: "OCTYL SALICYLATE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "PHENYLEPHRINE",
    label: "PHENYLEPHRINE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "SALICYLIC_ACID",
    label: "SALICYLIC ACID",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "SULFUR",
    label: "SULFUR",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "TITANIUM_DIOXIDE",
    label: "TITANIUM DIOXIDE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "TITER",
    label: "TITER",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "TOC",
    label: "TOC",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "PERCENT_TRANSMISSION",
    label: "% TRANSMISSION",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "VISCOSITY",
    label: "VISCOSITY",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "CONTENT_UNIFORMITY",
    label: "CONTENT UNIFORMITY",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "ZINC_OXIDE",
    label: "ZINC OXIDE",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
  {
    key: "OTHER",
    label: "OTHER",
    checked: false,
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
    otherName: "",
  },
  // ✅ NEW extra OTHER row
  {
    key: "OTHER_2",
    label: "OTHER",
    checked: false,
    otherName: "",
    bulkActiveLot: "",
    sopNo: "",
    formulaContent: "",
    result: "",
    dateTestedInitial: "",
  },
];

export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "CHEMISTRY"
  | "MC"
  | "QA"
  | "CLIENT";

export type ChemistryMixReportFormValues = {
  client?: string;
  dateSent?: string;

  sampleDescription?: string;

  testTypes?: Array<"ID" | "PERCENT_ASSAY" | "CONTENT_UNIFORMITY">;
  sampleCollected?: Array<"TOP_BEG" | "MID" | "BOTTOM_END" | "">;

  lotBatchNo?: string;
  manufactureDate?: string; // allow "" or "NA"
  formulaId?: string;
  sampleSize?: string;
  numberOfActives?: string;

  sampleTypes?: Array<
    | "BULK"
    | "FINISHED_GOOD"
    | "RAW_MATERIAL"
    | "PROCESS_VALIDATION"
    | "CLEANING_VALIDATION"
    | "COMPOSITE"
    | "DI_WATER_SAMPLE"
    | "STABILITY"
  >;

  stabilityNote?: string;

  dateReceived?: string;

  actives?: ChemActiveRow[];

  comments?: string;
  testedBy?: string;
  testedDate?: string;

  reviewedBy?: string;
  reviewedDate?: string;
};

/* =======================
 * Centralized required fields per role
 * ======================= */

export const ROLE_FIELDS: Record<Role, string[]> = {
  SYSTEMADMIN: [],
  FRONTDESK: [],

  // CLIENT fills header info + chooses actives + fills formula content
  CLIENT: [
    "client",
    "dateSent",
    "sampleDescription",
    "testTypes",
    "sampleCollected",
    "lotBatchNo",
    "manufactureDate", // optional by logic below
    "formulaId",
    "sampleSize",
    "numberOfActives",
    "sampleTypes",
    "actives", // special rules inside isEmpty()
  ],

  // CHEMISTRY fills analytical results + signatures
  CHEMISTRY: [
    "dateReceived",
    "actives", // special rules inside isEmpty()
    // "comments",
    // "testedBy",
    // "testedDate",
  ],
  MC: [
    "dateReceived",
    "actives", // special rules inside isEmpty()
  ],

  // QA signs/reviews
  QA: [],

  // ADMIN often just approves/rejects (keep empty unless you want to require review)
  ADMIN: [
    "dateReceived",
    "actives", // special rules inside isEmpty()
    "comments",
    "testedBy",
    "testedDate",
  ],
};

/* =======================
 * Field Error Badge (same as Micro)
 * ======================= */

export function FieldErrorBadge({
  name,
  errors,
}: {
  name: string;
  errors: Record<string, string>;
}): React.ReactElement | null {
  const msg = errors[name];
  if (!msg) return null;

  return React.createElement(
    "span",
    {
      className:
        "absolute -top-2 right-1 text-[10px] leading-none text-red-600 bg-white px-1 rounded no-print pointer-events-none",
      title: msg,
    },
    msg,
  );
}

/* =======================
 * Validation hook
 * ======================= */

type ValidationOpts = {
  /** If provided, this replaces the required list (wins over anything else). */
  requiredOverride?: string[];
  /** Status (optional) if you want to customize rules later. */
  status?: ChemistryReportStatus;
};

export function useChemistryReportValidation(
  role?: Role,
  opts?: ValidationOpts,
) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  const requiredList = useMemo(() => {
    const base = (ROLE_FIELDS[(role as Role) || "CLIENT"] ?? []).filter(
      (f) => f !== "*",
    );
    if (opts?.requiredOverride) return opts.requiredOverride;
    return base;
  }, [role, opts?.requiredOverride]);

  // ----- helpers -----

  const hasAny = (arr?: any[]) => Array.isArray(arr) && arr.length > 0;

  const isEmpty = useCallback(
    (field: string, v: ChemistryMixReportFormValues): boolean => {
      switch (field) {
        case "client":
          return !v.client?.trim();

        case "dateSent":
          return !v.dateSent;

        case "sampleDescription":
          return !v.sampleDescription?.trim();

        case "testTypes": {
          const t = v.testTypes ?? [];
          return !hasAny(t); // at least one checkbox
        }

        case "sampleCollected":
          return !v.sampleCollected; // must choose TOP/MID/BOTTOM

        case "lotBatchNo":
          return !v.lotBatchNo?.trim();

        case "manufactureDate": {
          // allow blank or "NA"
          if (!v.manufactureDate || v.manufactureDate === "NA") return false;

          // if provided, don't treat invalid date as "Required" (format can be validated elsewhere)
          const t = Date.parse(v.manufactureDate);
          if (Number.isNaN(t)) return false;
          return false;
        }

        case "formulaId":
          return !v.formulaId?.trim();

        case "sampleSize":
          return !v.sampleSize?.trim();

        case "numberOfActives":
          return !v.numberOfActives?.trim();

        case "sampleTypes": {
          const s = v.sampleTypes ?? [];
          return !hasAny(s); // at least one
        }

        case "dateReceived":
          return !v.dateReceived;

        case "comments":
          return !v.comments?.trim();

        case "testedBy":
          return !v.testedBy?.trim();

        case "testedDate":
          return !v.testedDate;

        case "reviewedBy":
          return !v.reviewedBy?.trim();

        case "reviewedDate":
          return !v.reviewedDate;

        case "actives": {
          const rows: ChemActiveRow[] = (v.actives ?? []) as ChemActiveRow[];
          const checked = rows.filter((r) => r.checked);

          // If you want CLIENT to always select at least one active:
          if (role === "CLIENT") {
            if (checked.length === 0) return true; // "Required" => select at least one
            // For each checked active, CLIENT must provide formulaContent
            const missingFormula = checked.some(
              (r) => !r.formulaContent?.trim(),
            );
            return missingFormula;
          }

          // CHEMISTRY: validate only checked actives; require SOP/Result/Date+Initial
          if (role === "CHEMISTRY" || role === "MC" || role === "ADMIN") {
            // If none selected, don't block chemistry (client may have selected none)
            if (checked.length === 0) return false;

            const missing = checked.some((r) => {
              const sopMissing = !r.sopNo?.trim();
              const resultMissing = !r.result?.trim();
              const dtiMissing = !r.dateTestedInitial?.trim();
              return sopMissing || resultMissing || dtiMissing;
            });

            return missing;
          }

          // QA / FRONTDESK / SYSTEMADMIN: don't validate table here
          return false;
        }

        default:
          return false;
      }
    },
    [role],
  );

  /** returns true when valid; sets errors + scrolls to first error */
  const validateAndSetErrors = useCallback(
    (values: ChemistryMixReportFormValues): boolean => {
      const next: Record<string, string> = {};

      requiredList.forEach((f) => {
        if (isEmpty(f, values)) {
          // more specific messages for actives/testTypes/sampleTypes if you want
          if (f === "actives" && role === "CLIENT") {
            next[f] = "Select at least 1 active and fill Formula Content";
          } else if (
            f === "actives" &&
            (role === "CHEMISTRY" || role === "MC" || role === "ADMIN")
          ) {
            next[f] =
              "Fill SOP #, Results, and Date Tested/Initial for checked actives";
          } else if (f === "testTypes") {
            next[f] = "Select at least one Test Type";
          } else if (f === "sampleTypes") {
            next[f] = "Select at least one Sample Type";
          } else {
            next[f] = "Required";
          }
        }
      });

      if (
        values.sampleTypes?.includes("STABILITY") &&
        !(values as any).stabilityNote?.trim()
      ) {
        next["stabilityNote"] = "Required when STABILITY is selected";
      }

      setErrors(next);

      const firstKey = Object.keys(next)[0];
      if (firstKey) {
        const el = document.getElementById("f-" + firstKey);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      return Object.keys(next).length === 0;
    },
    [isEmpty, requiredList, role],
  );

  return { errors, clearError, validateAndSetErrors };
}

export type CorrectionItem = {
  id: string;
  fieldKey: string;
  message: "OPEN" | "RESOLVED" extends never ? never : string; // (keep)
  status: "OPEN" | "RESOLVED";
  requestedByRole: Role;
  createdAt: string;
  resolvedAt?: string;
  resolvedByUserId?: string;
};

export async function getCorrections(reportId: string) {
  return await api<CorrectionItem[]>(
    `/chemistry-reports/${reportId}/corrections`,
  );
}

export async function createCorrections(
  reportId: string,
  items: { fieldKey: string; message: string }[],
  targetStatus?: string,
  reason?: string,
  expectedVersion?: number,
) {
  return api<CorrectionItem[]>(`/chemistry-reports/${reportId}/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, targetStatus, reason, expectedVersion }),
  });
}

export async function resolveCorrection(
  reportId: string,
  cid: string,
  resolutionNote?: string,
) {
  return api<CorrectionItem>(
    `/chemistry-reports/${reportId}/corrections/${cid}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionNote }),
    },
  );
}
