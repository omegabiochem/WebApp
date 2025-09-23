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
    | "CLIENT_NEEDS_CORRECTION"
    | "RECEIVED_BY_FRONTDESK"
    | "FRONTDESK_ON_HOLD"
    |"FRONTDESK_NEEDS_CORRECTION"
    | "FRONTDESK_REJECTED"
    | "UNDER_TESTING_REVIEW"
    | "TESTING_ON_HOLD"
    | "TESTING_NEEDS_CORRECTION"
    | "TESTING_REJECTED"
    | "UNDER_QA_REVIEW"
    | "QA_NEEDS_CORRECTION"
    | "QA_REJECTED"
    | "UNDER_ADMIN_REVIEW"
    | "ADMIN_NEEDS_CORRECTION"
    | "ADMIN_REJECTED"
    | "APPROVED"
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
        canSet: ["CLIENT", "SYSTEMADMIN"],
        next: ["SUBMITTED_BY_CLIENT", "CLIENT_NEEDS_CORRECTION"],
        nextEditableBy: ["CLIENT", "FRONTDESK"],
        canEdit: ["CLIENT"],
    },
    SUBMITTED_BY_CLIENT: {
        canSet: ["FRONTDESK", "MICRO"],
        next: ["UNDER_TESTING_REVIEW"],
        nextEditableBy: ["FRONTDESK", "MICRO"],
        canEdit: [],
    },
    RECEIVED_BY_FRONTDESK: {
        canSet: ["FRONTDESK", 'ADMIN'],
        next: ["UNDER_TESTING_REVIEW", "FRONTDESK_ON_HOLD", "FRONTDESK_REJECTED"],
        nextEditableBy: ["MICRO"],
        canEdit: ["FRONTDESK","ADMIN"],
    },
    FRONTDESK_ON_HOLD: {
        canSet: ["FRONTDESK", 'ADMIN'],
        next: ["RECEIVED_BY_FRONTDESK", "FRONTDESK_REJECTED"],
        nextEditableBy: ["FRONTDESK"],
        canEdit: ["ADMIN"],
    },
    FRONTDESK_NEEDS_CORRECTION: {
        canSet: ['FRONTDESK', 'ADMIN'],
        next: ['SUBMITTED_BY_CLIENT'],
        nextEditableBy: ['CLIENT'],
        canEdit: ["ADMIN"],
    },
    FRONTDESK_REJECTED: {
        canSet: ["FRONTDESK", 'ADMIN'],
        next: ["CLIENT_NEEDS_CORRECTION"],
        nextEditableBy: ["CLIENT", "FRONTDESK"],
        canEdit: ["ADMIN"],
    },
    CLIENT_NEEDS_CORRECTION: {
        canSet: ["CLIENT", 'ADMIN'],
        next: ["SUBMITTED_BY_CLIENT"],
        nextEditableBy: ["FRONTDESK"],
        canEdit: ["CLIENT"],
    },
    UNDER_TESTING_REVIEW: {
        canSet: ["MICRO", 'ADMIN'],
        next: ["TESTING_ON_HOLD", "TESTING_NEEDS_CORRECTION", "UNDER_QA_REVIEW"],
        nextEditableBy: ["MICRO"],
        canEdit: ["MICRO","ADMIN"],
    },
    TESTING_ON_HOLD: {
        canSet: ["MICRO", 'ADMIN'],
        next: ["UNDER_TESTING_REVIEW"],
        nextEditableBy: ["MICRO"],
        canEdit: ["ADMIN"],
    },
    TESTING_NEEDS_CORRECTION: {
        canSet: ['MICRO', 'ADMIN', 'CLIENT'],
        next: ['UNDER_TESTING_REVIEW'],
        nextEditableBy: ['CLIENT'],
        canEdit: ['CLIENT',"ADMIN"],
    },
    TESTING_REJECTED: {
        canSet: ["MICRO", 'ADMIN'],
        next: ["FRONTDESK_ON_HOLD", "FRONTDESK_REJECTED"],
        nextEditableBy: ["FRONTDESK"],
        canEdit: ["ADMIN"],
    },
    UNDER_QA_REVIEW: {
        canSet: ["QA", 'ADMIN'],
        next: ["QA_NEEDS_CORRECTION", "QA_REJECTED", "UNDER_ADMIN_REVIEW"],
        nextEditableBy: ["QA"],
        canEdit: ["QA","ADMIN"],
    },
    QA_NEEDS_CORRECTION: {
        canSet: ["QA", 'ADMIN'],
        next: ["UNDER_TESTING_REVIEW"],
        nextEditableBy: ["MICRO"],
        canEdit: ["ADMIN"],
    },
    QA_REJECTED: {
        canSet: ["QA", 'ADMIN'],
        next: ["UNDER_TESTING_REVIEW"],
        nextEditableBy: ["MICRO"],
        canEdit: ["ADMIN"],
    },
    UNDER_ADMIN_REVIEW: {
        canSet: ["ADMIN", "SYSTEMADMIN"],
        next: ["ADMIN_NEEDS_CORRECTION", "ADMIN_REJECTED", "APPROVED"],
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
        canEdit: ["ADMIN"],
    },
    APPROVED: {
        canSet: ["ADMIN", "SYSTEMADMIN"],
        next: ["LOCKED"],
        nextEditableBy: [],
        canEdit: ["ADMIN"],
    },
    LOCKED: {
        canSet: ["ADMIN", "SYSTEMADMIN"],
        next: [],
        nextEditableBy: [],
        canEdit: ["ADMIN"],
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
    return !!t?.canEdit?.includes(role);
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
