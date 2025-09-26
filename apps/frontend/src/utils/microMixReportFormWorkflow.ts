// src/permissions/reportWorkflow.ts
export type Role =
    | "SYSTEMADMIN"
    | "ADMIN"
    | "FRONTDESK"
    | "MICRO"
    | "QA"
    | "CLIENT";

export type ReportStatus =
  | "DRAFT"
  | "SUBMITTED_BY_CLIENT"
  | "CLIENT_NEEDS_PRELIMINARY_CORRECTION"
  | "CLIENT_NEEDS_FINAL_CORRECTION"
  | "UNDER_CLIENT_PRELIMINARY_CORRECTION"
  | "UNDER_CLIENT_FINAL_CORRECTION"
  | "PRELIMINARY_RESUBMITTION_BY_CLIENT"
  | "FINAL_RESUBMITTION_BY_CLIENT"
  | "UNDER_CLIENT_PRELIMINARY_REVIEW"
  | "UNDER_CLIENT_FINAL_REVIEW"
  | "RECEIVED_BY_FRONTDESK"
  | "FRONTDESK_ON_HOLD"
  | "FRONTDESK_NEEDS_CORRECTION"
  | "UNDER_PRELIMINARY_TESTING_REVIEW"
  | "PRELIMINARY_TESTING_ON_HOLD"
  | "PRELIMINARY_TESTING_NEEDS_CORRECTION"
  | "PRELIMINARY_RESUBMITTION_BY_TESTING"
  | "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW"
  | "FINAL_RESUBMITTION_BY_TESTING"
  | "PRELIMINARY_APPROVED"
  | "UNDER_FINAL_TESTING_REVIEW"
  | "FINAL_TESTING_ON_HOLD"
  | "FINAL_TESTING_NEEDS_CORRECTION"
  | "FINAL_RESUBMITTION_BY_TESTING"
  | "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW"
  | "UNDER_QA_REVIEW"
  | "QA_NEEDS_CORRECTION"
  | "UNDER_ADMIN_REVIEW"
  | "ADMIN_NEEDS_CORRECTION"
  | "ADMIN_REJECTED"
  | "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW"
  | "FINAL_APPROVED"
  | "LOCKED";

// 🔁 Keep this in sync with backend
export const STATUS_TRANSITIONS: Record<
    ReportStatus,
    {
        canSet: Role[];
        next: ReportStatus[];
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
    canSet: ["MICRO"],
    next: ["UNDER_PRELIMINARY_TESTING_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: [],
  },
  UNDER_CLIENT_PRELIMINARY_REVIEW: {
    canSet: ["CLIENT"],
    next: ["CLIENT_NEEDS_PRELIMINARY_CORRECTION", "PRELIMINARY_APPROVED"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  CLIENT_NEEDS_PRELIMINARY_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW"],
    nextEditableBy: ["MICRO", "ADMIN"],
    canEdit: [],
  },
  UNDER_CLIENT_PRELIMINARY_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["PRELIMINARY_RESUBMITTION_BY_CLIENT"],
    nextEditableBy: ["MICRO", "ADMIN"],
    canEdit: ["CLIENT"],
  },
  UNDER_CLIENT_FINAL_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["FINAL_RESUBMITTION_BY_CLIENT"],
    nextEditableBy: ["MICRO", "ADMIN"],
    canEdit: ["CLIENT"],
  },
  UNDER_CLIENT_FINAL_REVIEW: {
    canSet: ["CLIENT"],
    next: ["FINAL_APPROVED", "CLIENT_NEEDS_FINAL_CORRECTION"],
    nextEditableBy: ["ADMIN"],
    canEdit: [],
  },
  PRELIMINARY_RESUBMITTION_BY_CLIENT: {
    canSet: ["CLIENT"],
    next: ["UNDER_PRELIMINARY_TESTING_REVIEW"],
    nextEditableBy: ["ADMIN", "MICRO"],
    canEdit: [],
  },
  CLIENT_NEEDS_FINAL_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["UNDER_FINAL_RESUBMISSION_TESTING_REVIEW"],
    nextEditableBy: ["ADMIN"],
    canEdit: [],
  },
  FINAL_RESUBMITTION_BY_CLIENT: {
    canSet: ["CLIENT"],
    next: ["UNDER_FINAL_TESTING_REVIEW"],
    nextEditableBy: ["ADMIN", "MICRO"],
    canEdit: [],
  },
  PRELIMINARY_APPROVED: {
    canSet: [],
    next: ["UNDER_FINAL_TESTING_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ["FRONTDESK"],
    next: ["UNDER_PRELIMINARY_TESTING_REVIEW", "FRONTDESK_ON_HOLD"],
    nextEditableBy: ["MICRO"],
    canEdit: ["FRONTDESK"],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ["FRONTDESK"],
    next: ["RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["FRONTDESK"],
    canEdit: [],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ["FRONTDESK", "ADMIN"],
    next: ["SUBMITTED_BY_CLIENT"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_PRELIMINARY_TESTING_REVIEW: {
    canSet: ["MICRO"],
    next: [
      "PRELIMINARY_TESTING_ON_HOLD",
      "PRELIMINARY_TESTING_NEEDS_CORRECTION",
      "UNDER_CLIENT_PRELIMINARY_REVIEW",
    ],
    nextEditableBy: ["MICRO"],
    canEdit: ["MICRO", "ADMIN"],
  },
  PRELIMINARY_TESTING_ON_HOLD: {
    canSet: ["MICRO"],
    next: ["UNDER_PRELIMINARY_TESTING_REVIEW"],
    nextEditableBy: ["MICRO", "ADMIN"],
    canEdit: [],
  },
  PRELIMINARY_TESTING_NEEDS_CORRECTION: {
    canSet: ["MICRO", "ADMIN"],
    next: ["UNDER_CLIENT_PRELIMINARY_CORRECTION"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW: {
    canSet: ["MICRO"],
    next: ["PRELIMINARY_RESUBMITTION_BY_TESTING"],
    nextEditableBy: ["CLIENT"],
    canEdit: ["MICRO", "ADMIN"],
  },
  PRELIMINARY_RESUBMITTION_BY_TESTING: {
    canSet: ["MICRO"],
    next: ["UNDER_CLIENT_PRELIMINARY_REVIEW"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_FINAL_TESTING_REVIEW: {
    canSet: ["MICRO"],
    next: [
      "FINAL_TESTING_ON_HOLD",
      "FINAL_TESTING_NEEDS_CORRECTION",
      "UNDER_ADMIN_REVIEW",
    ],
    nextEditableBy: ["QA", "ADMIN"],
    canEdit: [],
  },
  FINAL_TESTING_ON_HOLD: {
    canSet: ["MICRO"],
    next: ["FINAL_TESTING_NEEDS_CORRECTION", "UNDER_FINAL_TESTING_REVIEW"],
    nextEditableBy: ["CLIENT", "MICRO"],
    canEdit: [],
  },
  FINAL_TESTING_NEEDS_CORRECTION: {
    canSet: ["MICRO", "ADMIN"],
    next: ["UNDER_CLIENT_FINAL_CORRECTION"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_TESTING_REVIEW: {
    canSet: ["MICRO"],
    next: ["UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW"],
    nextEditableBy: ["ADMIN"],
    canEdit: ["MICRO", "ADMIN"],
  },
  FINAL_RESUBMITTION_BY_TESTING: {
    canSet: ["MICRO", "ADMIN"],
    next: ["UNDER_ADMIN_REVIEW"],
    nextEditableBy: [],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ["MICRO"],
    next: ["QA_NEEDS_CORRECTION", "UNDER_ADMIN_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: ["QA"],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ["QA"],
    next: ["UNDER_FINAL_TESTING_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: [],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ["MICRO", "ADMIN", "SYSTEMADMIN"],
    next: [
      "ADMIN_NEEDS_CORRECTION",
      "ADMIN_REJECTED",
      "UNDER_CLIENT_FINAL_REVIEW",
    ],
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
  UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW: {
    canSet: ["MICRO"],
    next: ["UNDER_CLIENT_FINAL_REVIEW"],
    nextEditableBy: ["CLIENT"],
    canEdit: ["ADMIN"],
  },
  FINAL_APPROVED: {
    canSet: ["CLIENT"],
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

// Field-level permissions (frontend hint; backend is source of truth)
export const FIELD_EDIT_MAP: Record<Role, string[]> = {
    SYSTEMADMIN: [],
    ADMIN: ["*"],
    FRONTDESK: [
        "client",
        "dateSent",
        "typeOfTest",
        "sampleType",
        "formulaNo",
        "description",
        "lotNo",
        "manufactureDate",
    ],
    MICRO: [
        "testSopNo",
        "dateTested",
        "preliminaryResults",
        "preliminaryResultsDate",
        "tbc_gram",
        "tbc_result",
        "tmy_gram",
        "tmy_result",
        "pathogens",
        "comments",
        "testedBy",
        "testedDate",
    ],
    QA: ["dateCompleted", "reviewedBy", "reviewedDate"],
    CLIENT: [
        "client",
        "dateSent",
        "typeOfTest",
        "sampleType",
        "formulaNo",
        "description",
        "lotNo",
        "manufactureDate",
        "tbc_spec",
        "tmy_spec",
        "pathogens",
    ],
};

// ---------- Helpers ----------
export function canRoleEditInStatus(role?: Role, status?: ReportStatus): boolean {
    if (!role || !status) return false;
    const t = STATUS_TRANSITIONS[status];
    return !!t?.canSet?.includes(role);
}

export function canRoleEditField(
    role: Role | undefined,
    status: ReportStatus | undefined,
    field: string
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
export function canShowUpdateButton(
    role: Role | undefined,
    status: ReportStatus | undefined,
    fieldsToConsider?: string[]
): boolean {
    if (!role || !status) return false;
    if (!canRoleEditInStatus(role, status)) return false;

    const allow = FIELD_EDIT_MAP[role] ?? [];
    const effective = allow.includes("*")
        ? (fieldsToConsider ?? ["*"])
        : (fieldsToConsider ?? allow);
    return effective.length > 0 && (allow.includes("*") || effective.some(f => allow.includes(f)));
}
