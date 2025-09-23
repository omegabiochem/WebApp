// utils/reportValidation.ts
import { useCallback, useMemo, useState } from "react";

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
    | "FRONTDESK_REJECTED"
    | "UNDER_TESTING_REVIEW"
    | "TESTING_ON_HOLD"
    | "TESTING_REJECTED"
    | "UNDER_QA_REVIEW"
    | "QA_NEEDS_CORRECTION"
    | "QA_REJECTED"
    | "UNDER_ADMIN_REVIEW"
    | "ADMIN_NEEDS_CORRECTION"
    | "ADMIN_REJECTED"
    | "APPROVED"
    | "LOCKED";

// The values your form passes into validation
export type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    result: "Absent" | "Present" | "";
    spec: "Absent" | "Present" | "";
};
export type ReportFormValues = {
    client: string;
    dateSent: string;
    typeOfTest: string;
    sampleType: string;
    formulaNo: string;
    description: string;
    lotNo: string;
    manufactureDate: string;

    testSopNo: string;
    dateTested: string;
    preliminaryResults: string;
    preliminaryResultsDate: string;

    tbc_gram: string;
    tbc_result: string;
    tbc_spec: string;
    tmy_gram: string;
    tmy_result: string;
    tmy_spec: string;

    comments: string;
    testedBy: string;
    testedDate: string;
    dateCompleted: string;
    reviewedBy: string;
    reviewedDate: string;

    pathogens: PathRow[];
};

// Centralized field requirements per role (no layout impact)
export const ROLE_FIELDS: Record<Role, string[]> = {
    SYSTEMADMIN: [],
    ADMIN: ["testSopNo", "dateTested", "preliminaryResults", "preliminaryResultsDate",
        "tbc_gram", "tbc_result", "tbc_spec",
        "tmy_gram", "tmy_result", "tmy_spec",
        "pathogens", "comments", "testedBy", "testedDate",
        "dateCompleted", "reviewedBy", "reviewedDate"],
    FRONTDESK: [
        "dateSent", "typeOfTest", "sampleType",
        "formulaNo", "description", "lotNo", "manufactureDate",
    ],
    MICRO: [
        "testSopNo", "dateTested", "preliminaryResults", "preliminaryResultsDate",
        "tbc_gram", "tbc_result", "tbc_spec",
        "tmy_gram", "tmy_result", "tmy_spec",
        "pathogens", "comments", "testedBy", "testedDate",
    ],
    QA: ["dateCompleted", "reviewedBy", "reviewedDate"],
    CLIENT: [
        "dateSent", "typeOfTest", "sampleType",
        "formulaNo", "description", "lotNo", "manufactureDate", "tmy_spec", "tbc_spec"
    ],
};

// Small helper you can use instead of a local canEdit()
export function canEditBy(
    role: Role | undefined,
    status: ReportStatus | undefined,
    statusTransitions: Record<
        ReportStatus,
        { canSet: Role[]; next: ReportStatus[]; nextEditableBy: Role[]; canEdit: Role[] }
    >,
    field: string
) {
    if (!role || !status) return false;
    const t = statusTransitions[status];
    if (!t || !t.canEdit?.includes(role)) return false;
    const list = ROLE_FIELDS[role] ?? [];
    return list.includes("*") || list.includes(field);
}

// Non-layout error badge (absolute positioned)
import React from "react";

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
        msg
    );
}


// Hook that validates based on ROLE_FIELDS and returns boolean
export function useReportValidation(role?: Role) {
    const [errors, setErrors] = useState<Record<string, string>>({});

    const clearError = useCallback((name: string) => {
        setErrors(prev => {
            if (!(name in prev)) return prev;
            const { [name]: _omit, ...rest } = prev;
            return rest;
        });
    }, []);

    // How to check emptiness using provided values
    const isEmpty = useCallback((field: string, v: ReportFormValues): boolean => {
        switch (field) {
            // case "client": return !v.client?.trim();
            case "dateSent": return !v.dateSent;
            case "typeOfTest": return !v.typeOfTest?.trim();
            case "sampleType": return !v.sampleType?.trim();
            case "formulaNo": return !v.formulaNo?.trim();
            case "description": return !v.description?.trim();
            case "lotNo": return !v.lotNo?.trim();
            case "manufactureDate": return !v.manufactureDate;

            case "testSopNo": return !v.testSopNo?.trim();
            case "dateTested": return !v.dateTested;
            case "preliminaryResults": return !v.preliminaryResults?.trim();
            case "preliminaryResultsDate": return !v.preliminaryResultsDate;
            case "tbc_gram": return !v.tbc_gram?.trim();
            case "tbc_result": return !v.tbc_result?.trim();
            case "tbc_spec": return !v.tbc_spec?.trim();
            case "tmy_gram": return !v.tmy_gram?.trim();
            case "tmy_result": return !v.tmy_result?.trim();
            case "tmy_spec": return !v.tmy_spec?.trim();
            case "comments": return !v.comments?.trim();
            case "testedBy": return !v.testedBy?.trim();
            case "testedDate": return !v.testedDate;

            case "dateCompleted": return !v.dateCompleted;
            case "reviewedBy": return !v.reviewedBy?.trim();
            case "reviewedDate": return !v.reviewedDate;

            case "pathogens":
                return !v.pathogens?.some(p => p.result === "Absent" || p.result === "Present");
            default:
                return false;
        }
    }, []);

    const requiredList = useMemo(
        () => (ROLE_FIELDS[(role as Role) || "CLIENT"] ?? []).filter(f => f !== "*"),
        [role]
    );

    /** returns true when valid; sets errors + scrolls to first error */
    const validateAndSetErrors = useCallback((values: ReportFormValues): boolean => {
        const next: Record<string, string> = {};
        requiredList.forEach(f => {
            if (isEmpty(f, values)) next[f] = "Required";
        });
        setErrors(next);

        const firstKey = Object.keys(next)[0];
        if (firstKey) {
            // try to scroll to the field if it exists
            const el = document.getElementById("f-" + firstKey);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return Object.keys(next).length === 0;
    }, [isEmpty, requiredList]);

    return { errors, clearError, validateAndSetErrors };
}



// import React, { useState } from "react";
// import {
//     type Role,
//     type ReportStatus,
//     STATUS_TRANSITIONS,
//     // If you already export FIELD_EDIT_MAP from reportWorkflow, alias it here.
//     FIELD_EDIT_MAP as ROLE_FIELDS,
// } from "../utils/microMixReportFormWorkflow";

// // If FIELD_EDIT_MAP isn't exported, either export it from reportWorkflow,
// // or copy the same object into this file and export ROLE_FIELDS from here.

// export type PathRow = {
//     checked: boolean;
//     key: string;
//     label: string;
//     result: "Absent" | "Present" | "";
//     spec: "Absent" | "";
// };

// export type ReportFormValues = {
//     client?: string;
//     dateSent?: string;
//     typeOfTest?: string;
//     sampleType?: string;
//     formulaNo?: string;
//     description?: string;
//     lotNo?: string;
//     manufactureDate?: string;

//     testSopNo?: string;
//     dateTested?: string;
//     preliminaryResults?: string;
//     preliminaryResultsDate?: string;

//     tbc_gram?: string;
//     tbc_result?: string;
//     tbc_spec?: string;

//     tmy_gram?: string;
//     tmy_result?: string;
//     tmy_spec?: string;

//     comments?: string;

//     testedBy?: string;
//     testedDate?: string;

//     dateCompleted?: string;
//     reviewedBy?: string;
//     reviewedDate?: string;

//     pathogens?: PathRow[];
// };

// // ---- Permissions helper (pure) ----
// export function canEditBy(
//     role: Role | undefined,
//     field: string,
//     status?: ReportStatus
// ) {
//     if (!role || !status) return false;
//     const t = STATUS_TRANSITIONS[status];
//     if (!t || !t.canEdit?.includes(role)) return false;
//     const list = ROLE_FIELDS[role] ?? [];
//     return list.includes("*") || list.includes(field);
// }

// // ---- Validation (pure) ----
// function isEmpty(field: string, v: ReportFormValues): boolean {
//     switch (field) {
//         case "client": return !v.client?.trim();
//         case "dateSent": return !v.dateSent;
//         case "typeOfTest": return !v.typeOfTest?.trim();
//         case "sampleType": return !v.sampleType?.trim();
//         case "formulaNo": return !v.formulaNo?.trim();
//         case "description": return !v.description?.trim();
//         case "lotNo": return !v.lotNo?.trim();
//         case "manufactureDate": return !v.manufactureDate;

//         case "testSopNo": return !v.testSopNo?.trim();
//         case "dateTested": return !v.dateTested;
//         case "preliminaryResults": return !v.preliminaryResults?.trim();
//         case "preliminaryResultsDate": return !v.preliminaryResultsDate;

//         case "tbc_gram": return !v.tbc_gram?.trim();
//         case "tbc_result": return !v.tbc_result?.trim();
//         case "tbc_spec": return !v.tbc_spec?.trim();

//         case "tmy_gram": return !v.tmy_gram?.trim();
//         case "tmy_result": return !v.tmy_result?.trim();
//         case "tmy_spec": return !v.tmy_spec?.trim();

//         case "comments": return !v.comments?.trim();

//         case "testedBy": return !v.testedBy?.trim();
//         case "testedDate": return !v.testedDate;

//         case "dateCompleted": return !v.dateCompleted;
//         case "reviewedBy": return !v.reviewedBy?.trim();
//         case "reviewedDate": return !v.reviewedDate;

//         case "pathogens":
//             return !(v.pathogens ?? []).some(
//                 (p) => p.result === "Absent" || p.result === "Present"
//             );

//         default:
//             return false;
//     }
// }

// export type Errors = Record<string, string>;

// export function requiredErrorsForRole(
//     role: Role | undefined,
//     values: ReportFormValues
// ): Errors {
//     const mustHave = (ROLE_FIELDS[role || "CLIENT"] ?? []).filter((f) => f !== "*");
//     const errs: Errors = {};
//     mustHave.forEach((f) => {
//         if (isEmpty(f, values)) errs[f] = "Required";
//     });
//     return errs;
// }

// // ---- React hook wrapper (state + helpers) ----
// export function useReportValidation(role: Role | undefined) {
//     const [errors, setErrors] = useState<Errors>({});

//     function clearError(name: string) {
//         setErrors((prev) => {
//             const { [name]: _, ...rest } = prev;
//             return rest;
//         });
//     }

//     function validateAndSetErrors(values: ReportFormValues) {
//         const next = requiredErrorsForRole(role, values);
//         setErrors(next);

//         if (Object.keys(next).length) {
//             const firstKey = Object.keys(next)[0];
//             const el = document.getElementById("f-" + firstKey);
//             if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
//             return false;
//         }
//         return true;
//     }

//     return { errors, clearError, validateAndSetErrors, setErrors };
// }

// // ---- Tiny presentational helper ----
// export function FieldErrorBadge({
//     name,
//     errors,
// }: {
//     name: string;
//     errors: Record<string, string>;
// }) {
//     return errors[name] ? (
//         <span
//             className="absolute -top-2 right-1 text-[10px] leading-none text-red-600 bg-white px-1 rounded no-print pointer-events-none"
//             title={errors[name]}
//         >
//             {errors[name]}
//         </span>
//     ) : null;
// }

