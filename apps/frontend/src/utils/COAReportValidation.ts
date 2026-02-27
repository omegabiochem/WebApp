import { useCallback, useMemo, useState } from "react";
import type { COAReportStatus } from "./COAReportFormWorkflow";
import React from "react";
import { api } from "../lib/api";

export type CoaVerificationRow = {
  key: string;
  item: string; // fixed label
  Specification: string; // filled by CLIENT
  result: string; // filled by LAB
};

export const DEFAULT_COA_ROWS: CoaVerificationRow[] = [
  { key: "IDENTIFICATION", item: "Identification", Specification: "", result: "" },
  {
    key: "SPECIFIC_ROTATION",
    item: "Specific Rotation",
    Specification: "",
    result: "",
  },
  {
    key: "REFRACTIVE_INDEX",
    item: "Refractive Index",
    Specification: "",
    result: "",
  },
  { key: "WATER", item: "Water Content", Specification: "", result: "" },
  {
    key: "RESIDUE_ON_IGNITION",
    item: "Residue on Ignition",
    Specification: "",
    result: "",
  },
  {
    key: "ASSAY",
    item: "Assay",
    Specification: "",
    result: "",
  },
  { key: "PH_5", item: "PH %", Specification: "", result: "" },
  { key: "OTHER_1", item: "OTHER 1", Specification: "", result: "" },
  { key: "OTHER_2", item: "OTHER 2", Specification: "", result: "" },
  { key: "OTHER_3", item: "OTHER 3", Specification: "", result: "" },
  { key: "OTHER_4", item: "OTHER 4", Specification: "", result: "" },
  { key: "OTHER_5", item: "OTHER 5", Specification: "", result: "" },
];

export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "CHEMISTRY"
  | "MC"
  | "QA"
  | "CLIENT";

export type CoaReportFormValues = {
  client?: string;
  dateSent?: string;

  sampleDescription?: string;

  // keep only one fixed test type
  testTypes?: Array<"COA_VERIFICATION">;

  lotBatchNo?: string;
  manufactureDate?: string;
  formulaId?: string;
  sampleSize?: string;

  dateReceived?: string;

  // ✅ NEW: COA fixed table
  coaRows?: CoaVerificationRow[];

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
    // "dateSent",
    "sampleDescription",
    // "testTypes",
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
  status?: COAReportStatus;
};

export function useCOAReportValidation(role?: Role, opts?: ValidationOpts) {
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

  const isEmpty = useCallback(
    (field: string, v: CoaReportFormValues): boolean => {
      switch (field) {
        case "client":
          return !v.client?.trim();

        case "dateSent":
          return !v.dateSent;

        case "sampleDescription":
          return !v.sampleDescription?.trim();

        case "testTypes": {
          const t = v.testTypes ?? [];
          return !(t.length === 1 && t[0] === "COA_VERIFICATION");
        }
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

        case "dateReceived":
          return !v.dateReceived;

        case "coaRows": {
          const rows = (v.coaRows ?? []) as any[];
          if (rows.length === 0) return true;

          if (role === "CLIENT") {
            // require at least one Specification filled
            return !rows.some((r) => String(r.Specification ?? "").trim());
          }

          if (role === "CHEMISTRY" || role === "MC" || role === "ADMIN") {
            // require all RESULT filled
            return rows.some((r) => !String(r.result ?? "").trim());
          }

          return false;
        }

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

        default:
          return false;
      }
    },
    [role],
  );

  /** returns true when valid; sets errors + scrolls to first error */
  const validateAndSetErrors = useCallback(
    (values: CoaReportFormValues): boolean => {
      const next: Record<string, string> = {};

      // 1) base required fields
      requiredList.forEach((f) => {
        if (isEmpty(f, values)) {
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

      // 2) ✅ extra COA table rules
      const rows = values.coaRows ?? [];

      // Rule B: CLIENT must fill at least one Specification row
      if (role === "CLIENT") {
        const hasAtLeastOneSpecification = rows.some(
          (r) => (r.Specification ?? "").trim().length > 0,
        );
        if (!hasAtLeastOneSpecification) {
          next.coaRows = "Enter at least one Specification in the COA table.";
        }
      }

      // Rule A: OTHER rows - if Specification filled, Item must be filled
      for (const r of rows) {
        if (r.key?.startsWith("OTHER_")) {
          const hasSpecification = (r.Specification ?? "").trim().length > 0;
          const hasItem = (r.item ?? "").trim().length > 0;

          if (hasSpecification && !hasItem) {
            next.coaRows =
              "For OTHER rows: Item is required when Specification is filled.";
            break;
          }
        }
      }

      // 3) set + scroll
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
  oldValue?: any | null;
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
