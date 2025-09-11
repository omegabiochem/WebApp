import React, { useState } from "react";
import {
    type Role,
    type ReportStatus,
    STATUS_TRANSITIONS,
    // If you already export FIELD_EDIT_MAP from reportWorkflow, alias it here.
    FIELD_EDIT_MAP as ROLE_FIELDS,
} from "../utils/microMixReportFormWorkflow";

// If FIELD_EDIT_MAP isn't exported, either export it from reportWorkflow,
// or copy the same object into this file and export ROLE_FIELDS from here.

export type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    result: "Absent" | "Present" | "";
    spec: "Absent" | "";
};

export type ReportFormValues = {
    client?: string;
    dateSent?: string;
    typeOfTest?: string;
    sampleType?: string;
    formulaNo?: string;
    description?: string;
    lotNo?: string;
    manufactureDate?: string;

    testSopNo?: string;
    dateTested?: string;
    preliminaryResults?: string;
    preliminaryResultsDate?: string;

    tbc_gram?: string;
    tbc_result?: string;
    tbc_spec?: string;

    tmy_gram?: string;
    tmy_result?: string;
    tmy_spec?: string;

    comments?: string;

    testedBy?: string;
    testedDate?: string;

    dateCompleted?: string;
    reviewedBy?: string;
    reviewedDate?: string;

    pathogens?: PathRow[];
};

// ---- Permissions helper (pure) ----
export function canEdit(
    role: Role | undefined,
    field: string,
    status?: ReportStatus
) {
    if (!role || !status) return false;
    const t = STATUS_TRANSITIONS[status];
    if (!t || !t.canEdit?.includes(role)) return false;
    const list = ROLE_FIELDS[role] ?? [];
    return list.includes("*") || list.includes(field);
}

// ---- Validation (pure) ----
function isEmpty(field: string, v: ReportFormValues): boolean {
    switch (field) {
        case "client": return !v.client?.trim();
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
            return !(v.pathogens ?? []).some(
                (p) => p.result === "Absent" || p.result === "Present"
            );

        default:
            return false;
    }
}

export type Errors = Record<string, string>;

export function requiredErrorsForRole(
    role: Role | undefined,
    values: ReportFormValues
): Errors {
    const mustHave = (ROLE_FIELDS[role || "CLIENT"] ?? []).filter((f) => f !== "*");
    const errs: Errors = {};
    mustHave.forEach((f) => {
        if (isEmpty(f, values)) errs[f] = "Required";
    });
    return errs;
}

// ---- React hook wrapper (state + helpers) ----
export function useReportValidation(role: Role | undefined) {
    const [errors, setErrors] = useState<Errors>({});

    function clearError(name: string) {
        setErrors((prev) => {
            const { [name]: _, ...rest } = prev;
            return rest;
        });
    }

    function validateAndSetErrors(values: ReportFormValues) {
        const next = requiredErrorsForRole(role, values);
        setErrors(next);

        if (Object.keys(next).length) {
            const firstKey = Object.keys(next)[0];
            const el = document.getElementById("f-" + firstKey);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            return false;
        }
        return true;
    }

    return { errors, clearError, validateAndSetErrors, setErrors };
}

// ---- Tiny presentational helper ----
export function FieldError({
    name,
    errors,
}: {
    name: string;
    errors: Errors;
}) {
    return errors[name] ? (
        <div className="text-red-600 text-[11px] font-semibold -mt-1 mb-1">
            • {errors[name]}
        </div>
    ) : null;
}
