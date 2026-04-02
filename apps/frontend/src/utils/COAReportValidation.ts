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
  {
    key: "IDENTIFICATION",
    item: "Identification",
    Specification: "",
    result: "",
  },
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
  { key: "OTHER_6", item: "OTHER 6", Specification: "", result: "" },
  { key: "OTHER_7", item: "OTHER 7", Specification: "", result: "" },
  { key: "OTHER_8", item: "OTHER 8", Specification: "", result: "" },
  { key: "OTHER_9", item: "OTHER 9", Specification: "", result: "" },
  { key: "OTHER_10", item: "OTHER 10", Specification: "", result: "" },
  { key: "OTHER_11", item: "OTHER 11", Specification: "", result: "" },
  { key: "OTHER_12", item: "OTHER 12", Specification: "", result: "" },
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
    "dateSent",
    "sampleDescription",
    // "testTypes",
    "sampleCollected",
    "lotBatchNo",
    "manufactureDate", // optional by logic below
    "formulaId",
    "sampleSize",
    "coaRows", // special rules inside isEmpty()
  ],

  // CHEMISTRY fills analytical results + signatures
  CHEMISTRY: [
    "dateReceived",
    "coaRows", // special rules inside isEmpty()

    // "comments",
    // "testedBy",
    // "testedDate",
  ],
  MC: ["dateReceived", "coaRows"],

  // QA signs/reviews
  QA: [],

  // ADMIN often just approves/rejects (keep empty unless you want to require review)
  ADMIN: [],
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
          const rows = (v.coaRows ?? []) as CoaVerificationRow[];
          if (rows.length === 0) return true;

          if (role === "CLIENT") {
            // require at least one Specification filled
            return !rows.some((r) => String(r.Specification ?? "").trim());
          }

          if (role === "CHEMISTRY" || role === "MC" || role === "ADMIN") {
            // require Result only for rows where Specification has a value
            return rows.some((r) => {
              const spec = String(r.Specification ?? "").trim();
              const result = String(r.result ?? "").trim();
              return !!spec && !result;
            });
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

      // 1) normal top-level required fields only
      requiredList.forEach((f) => {
        if (f === "coaRows") return; // handled cell-wise below

        if (isEmpty(f, values)) {
          if (f === "testTypes") {
            next[f] = "Select at least one Test Type";
          } else {
            next[f] = "Required";
          }
        }
      });

      // 2) COA table cell-wise validation
      const rows = values.coaRows ?? [];

      if (!rows.length) {
        next["coaRows"] = "COA table is required";
      } else {
        if (role === "CLIENT") {
          // require at least one specification somewhere
          const hasAtLeastOneSpecification = rows.some(
            (r) => (r.Specification ?? "").trim().length > 0,
          );

          if (!hasAtLeastOneSpecification) {
            next["coaRows"] =
              "Enter at least one Specification in the COA table.";
          }

          // validate each row separately
          rows.forEach((r) => {
            const spec = String(r.Specification ?? "").trim();
            const item = String(r.item ?? "").trim();

            // OTHER rows: if specification entered, item required
            if (r.key?.startsWith("OTHER_")) {
              if (spec && !item) {
                next[`coaRows:${r.key}:item`] =
                  "Item is required when Specification is filled.";
              }
            }
          });
        }

        if (role === "CHEMISTRY" || role === "MC" || role === "ADMIN") {
          rows.forEach((r) => {
            const spec = String(r.Specification ?? "").trim();
            const result = String(r.result ?? "").trim();

            // require result only when specification is filled
            if (spec && !result) {
              next[`coaRows:${r.key}:result`] = "Result is required.";
            }
          });
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
  meta?: {
    kinds?: ("REQUEST_CHANGE" | "RAISE_CORRECTION")[];
    previousStatus?: string;
  },
) {
  return api<CorrectionItem[]>(`/chemistry-reports/${reportId}/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      targetStatus,
      reason,
      expectedVersion,
      meta,
    }),
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
