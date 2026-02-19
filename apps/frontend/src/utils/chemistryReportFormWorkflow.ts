import React, { useLayoutEffect, useRef } from "react";

// src/permissions/reportWorkflow.ts
export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "CHEMISTRY"
  | "MC"
  | "QA"
  | "CLIENT";

export type CorrectionItem = {
  id: string;
  fieldKey: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  requestedByRole: Role;
  createdAt: string;
  oldValue?: string | null;
  newValue?: string | null;
  resolvedAt?: string | null;
  resolvedByRole?: Role | null;
  resolutionNote?: string | null;
};

export type ChemistryReportStatus =
  | "DRAFT"
  | "SUBMITTED_BY_CLIENT"
  | "CLIENT_NEEDS_CORRECTION"
  | "UNDER_CLIENT_CORRECTION"
  | "RESUBMISSION_BY_CLIENT"
  | "UNDER_CLIENT_REVIEW"
  | "RECEIVED_BY_FRONTDESK"
  | "FRONTDESK_ON_HOLD"
  | "FRONTDESK_NEEDS_CORRECTION"
  | "UNDER_TESTING_REVIEW"
  | "TESTING_ON_HOLD"
  | "TESTING_NEEDS_CORRECTION"
  | "RESUBMISSION_BY_TESTING"
  | "UNDER_RESUBMISSION_TESTING_REVIEW"
  | "UNDER_QA_REVIEW"
  | "QA_NEEDS_CORRECTION"
  | "UNDER_RESUBMISSION_QA_REVIEW"
  | "UNDER_ADMIN_REVIEW"
  | "ADMIN_NEEDS_CORRECTION"
  | "ADMIN_REJECTED"
  | "UNDER_RESUBMISSION_ADMIN_REVIEW"
  | "APPROVED"
  | "LOCKED";

// 🔁 Keep this in sync with backend
export const STATUS_TRANSITIONS: Record<
  ChemistryReportStatus,
  {
    canSet: Role[];
    next: ChemistryReportStatus[];
    nextEditableBy: Role[];
    canEdit: Role[];
  }
> = {
  DRAFT: {
    canSet: ["CLIENT"],
    next: ["SUBMITTED_BY_CLIENT"],
    nextEditableBy: ["CLIENT", "FRONTDESK"],
    canEdit: ["CLIENT"],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ["CHEMISTRY", "MC"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY", "MC"],
    canEdit: [],
  },
  UNDER_CLIENT_REVIEW: {
    canSet: ["CLIENT"],
    next: ["CLIENT_NEEDS_CORRECTION", "APPROVED"],
    nextEditableBy: ["ADMIN", "QA"],
    canEdit: [],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ["CHEMISTRY", "MC"],
    next: ["UNDER_RESUBMISSION_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY", "MC", "ADMIN", "QA"],
    canEdit: [],
  },
  UNDER_CLIENT_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["RESUBMISSION_BY_CLIENT"],
    nextEditableBy: ["CHEMISTRY", "MC", "ADMIN", "QA"],
    canEdit: ["CLIENT"],
  },

  RESUBMISSION_BY_CLIENT: {
    canSet: ["CHEMISTRY", "MC"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["ADMIN", "QA", "CHEMISTRY", "MC"],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ["FRONTDESK"],
    next: ["UNDER_CLIENT_REVIEW", "FRONTDESK_ON_HOLD"],
    nextEditableBy: ["CHEMISTRY", "MC"],
    canEdit: [],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ["FRONTDESK"],
    next: ["RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["FRONTDESK"],
    canEdit: [],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ["FRONTDESK", "ADMIN", "QA"],
    next: ["SUBMITTED_BY_CLIENT"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_TESTING_REVIEW: {
    canSet: ["CHEMISTRY", "MC"],
    next: ["TESTING_ON_HOLD", "TESTING_NEEDS_CORRECTION", "UNDER_QA_REVIEW"],
    nextEditableBy: ["CHEMISTRY", "MC"],
    canEdit: ["CHEMISTRY", "MC", "ADMIN", "QA"],
  },
  TESTING_ON_HOLD: {
    canSet: ["CHEMISTRY", "MC"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY", "MC", "ADMIN", "QA"],
    canEdit: [],
  },
  TESTING_NEEDS_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["UNDER_CLIENT_CORRECTION"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    canSet: ["CHEMISTRY", "MC"],
    next: ["UNDER_RESUBMISSION_QA_REVIEW", "QA_NEEDS_CORRECTION"],
    nextEditableBy: ["CHEMISTRY", "MC"],
    canEdit: ["CHEMISTRY", "MC", "ADMIN", "QA"],
  },
  RESUBMISSION_BY_TESTING: {
    canSet: ["QA"],
    next: ["UNDER_CLIENT_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ["QA"],
    next: ["QA_NEEDS_CORRECTION", "RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["QA"],
    canEdit: ["QA"],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ["QA"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY", "MC"],
    canEdit: [],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["ADMIN_NEEDS_CORRECTION", "ADMIN_REJECTED", "RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["QA", "ADMIN", "SYSTEMADMIN"],
    canEdit: ["ADMIN"],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_QA_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: ["ADMIN"],
  },
  ADMIN_REJECTED: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_QA_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: [],
  },
  UNDER_RESUBMISSION_QA_REVIEW: {
    canSet: ["QA"],
    next: ["RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["CLIENT"],
    canEdit: ["QA"],
  },
  UNDER_RESUBMISSION_ADMIN_REVIEW: {
    canSet: ["ADMIN"],
    next: ["RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["CLIENT"],
    canEdit: ["ADMIN"],
  },
  APPROVED: {
    canSet: [],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
  LOCKED: {
    canSet: ["CLIENT", "ADMIN", "SYSTEMADMIN"],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
};

//  these are designed for readable badges on white UI
export const CHEMISTRY_STATUS_COLORS: Record<ChemistryReportStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",

  SUBMITTED_BY_CLIENT: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",

  UNDER_CLIENT_REVIEW: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",

  CLIENT_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  UNDER_CLIENT_CORRECTION:
    "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",

  RESUBMISSION_BY_CLIENT: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",

  RECEIVED_BY_FRONTDESK: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
  FRONTDESK_ON_HOLD: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  FRONTDESK_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  UNDER_TESTING_REVIEW: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
  TESTING_ON_HOLD: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  TESTING_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  RESUBMISSION_BY_TESTING: "bg-teal-100 text-teal-800 ring-1 ring-teal-200",
  UNDER_RESUBMISSION_TESTING_REVIEW:
    "bg-teal-100 text-teal-900 ring-1 ring-teal-200",

  UNDER_QA_REVIEW: "bg-purple-100 text-purple-800 ring-1 ring-purple-200",
  QA_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  UNDER_ADMIN_REVIEW: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
  ADMIN_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
  ADMIN_REJECTED: "bg-red-100 text-red-800 ring-1 ring-red-200",
  UNDER_RESUBMISSION_ADMIN_REVIEW:
    "bg-violet-100 text-violet-900 ring-1 ring-violet-200",
  UNDER_RESUBMISSION_QA_REVIEW:
    "bg-violet-100 text-violet-900 ring-1 ring-violet-400",

  APPROVED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  LOCKED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
};

// Field-level permissions (frontend hint; backend is source of truth)
export const FIELD_EDIT_MAP: Record<Role, string[]> = {
  SYSTEMADMIN: [],
  ADMIN: ["*"],
  FRONTDESK: [],
  CHEMISTRY: [
    "dateReceived",
    "sop",
    "results",
    "dateTested",
    "initial",
    "comments",
    "testedBy",
    "testedDate",
    "actives",
  ],
  MC: [
    "dateReceived",
    "sop",
    "results",
    "dateTested",
    "initial",
    "comments",
    "testedBy",
    "testedDate",
    "actives",
  ],
  QA: ["dateCompleted", "reviewedBy", "reviewedDate"],
  CLIENT: [
    "client",
    "dateSent",
    "sampleDescription",
    "testTypes",
    "sampleCollected",
    "lotBatchNo",
    "manufactureDate",
    "formulaId",
    "sampleSize",
    "numberOfActives",
    "sampleTypes",
    "comments",
    "actives",
    "formulaContent",
  ],
};

// ---------- Helpers ----------
export function canRoleEditInStatus(
  role?: Role,
  status?: ChemistryReportStatus,
): boolean {
  if (!role || !status) return false;
  const t = STATUS_TRANSITIONS[status];
  return !!t?.canSet?.includes(role);
}

export function canRoleEditField(
  role: Role | undefined,
  status: ChemistryReportStatus | undefined,
  field: string,
): boolean {
  if (!role || !status) return false;
  const t = STATUS_TRANSITIONS[status];
  if (!t || !t.canEdit.includes(role)) return false;

  const fields = FIELD_EDIT_MAP[role] || [];
  if (fields.includes("*")) return true;
  return fields.includes(field);
}

/**
 * Show "Update" button if:
 *  - user can edit in this status (status-level), and
 *  - there is at least one field they’re allowed to edit (field-level).
 * You can pass a list of fields relevant to that screen; default checks any field in the map.
 */
export function canShowChemistryUpdateButton(
  role: Role | undefined,
  status: ChemistryReportStatus | undefined,
  fieldsToConsider?: string[],
): boolean {
  if (!role || !status) return false;
  if (!canRoleEditInStatus(role, status)) return false;

  const allow = FIELD_EDIT_MAP[role] ?? [];
  const effective = allow.includes("*")
    ? (fieldsToConsider ?? ["*"])
    : (fieldsToConsider ?? allow);
  return (
    effective.length > 0 &&
    (allow.includes("*") || effective.some((f) => allow.includes(f)))
  );
}

export function splitDateInitial(value?: string) {
  if (!value) return { date: "", initial: "" };
  const [d, i] = value.split("/").map((s) => s?.trim() ?? "");
  return { date: d ?? "", initial: i ?? "" };
}

export function joinDateInitial(date: string, initial: string) {
  if (!date && !initial) return "";
  return `${date || ""} / ${initial || ""}`.trim();
}

// function cellFontClass(v: string | undefined | null) {
//   const n = (v ?? "").trim().length;
//   if (n > 45) return "text-[9px]";
//   if (n > 24) return "text-[10px]";
//   return "text-[11px]";
// }

// function clampTo3Lines(el: HTMLTextAreaElement) {
//   // reset then measure
//   el.style.height = "0px";

//   const cs = window.getComputedStyle(el);
//   const lineH = Number.parseFloat(cs.lineHeight || "12");
//   const padTop = Number.parseFloat(cs.paddingTop || "0");
//   const padBot = Number.parseFloat(cs.paddingBottom || "0");
//   const maxH = lineH * 3 + padTop + padBot; // ✅ 3 lines max

//   const next = Math.min(el.scrollHeight, maxH);
//   el.style.height = `${next}px`;
//   el.style.overflowY = "hidden";
// }

// ...existing code...
// export function CellTextarea(props: {
//   value: string;
//   onChange: (v: string) => void;
//   readOnly?: boolean;
//   className?: string;
// }) {
//   const { value, onChange, readOnly, className } = props;

//   return (
//     // Changed from <textarea> to React.createElement('textarea', ...)
//     React.createElement("textarea", {
//       rows: 1,
//       value: value ?? "",
//       readOnly: readOnly,
//       onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
//         onChange(e.target.value),
//       onInput: (e: React.FormEvent<HTMLTextAreaElement>) =>
//         clampTo3Lines(e.currentTarget),
//       ref: (el: HTMLTextAreaElement | null) => {
//         if (el) clampTo3Lines(el);
//       },
//       className: [
//         "w-full resize-none border-none outline-none bg-transparent",
//         "text-center leading-tight whitespace-pre-wrap break-words",
//         cellFontClass(value),
//         className ?? "",
//       ].join(" "),
//     })
//   );
// }

export function CellTextarea(props: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const { value, onChange, readOnly, className } = props;

  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    resize();
  }, [value]);

  return React.createElement("textarea", {
    ref: (el: HTMLTextAreaElement | null) => {
      ref.current = el;
      if (el) resize();
    },
    rows: 1,
    value: value ?? "",
    readOnly: !!readOnly,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      onChange?.(e.target.value),
    onInput: () => resize(),
    className: [
      "w-full resize-none border-none outline-none bg-transparent",
      "leading-tight whitespace-pre-wrap break-words",
      "overflow-hidden",
      "text-center",
      className ?? "",
    ].join(" "),
  });
}
