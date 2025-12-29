import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useBlocker } from "react-router-dom";
import { api } from "../../lib/api";
import {
  DEFAULT_CHEM_ACTIVES,
  FieldErrorBadge,
  useChemistryReportValidation,
  type ChemActiveRow,
  type ChemistryMixReportFormValues,
} from "../../utils/chemistryReportValidation";
import {
  FIELD_EDIT_MAP,
  STATUS_TRANSITIONS,
  type ChemistryReportStatus,
  type Role,
} from "../../utils/chemistryReportFormWorkflow";

import toast from "react-hot-toast";

// ---------- tiny hook to warn on unsaved ----------
function useConfirmOnLeave(isDirty: boolean) {
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("⚠️ You have unsaved changes. Leave anyway?")) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}

// --------- helper for date <-> input value ----------
function formatDateForInput(value: string | null) {
  if (!value) return "";
  if (value === "NA") return "NA";
  return new Date(value).toISOString().split("T")[0];
}

const PrintStyles = () => (
  <style>{`
    @media print {
      @page { size: A4 portrait; margin: 14mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .sheet { box-shadow: none !important; border: none !important; }
    }
  `}</style>
);

type ChemistryReportFormProps = {
  report?: any; // same pattern as Micro
  onClose?: () => void;
};

const statusButtons: Record<string, { label: string; color: string }> = {
  SUBMITTED_BY_CLIENT: { label: "Submit", color: "bg-green-600" },
  UNDER_CLIENT_REVIEW: { label: "Approve", color: "bg-green-600" },

  CLIENT_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },

  RECEIVED_BY_FRONTDESK: { label: "Approve", color: "bg-green-600" },
  FRONTDESK_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  FRONTDESK_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-red-600",
  },
  UNDER_TESTING_REVIEW: { label: "Approve", color: "bg-green-600" },
  TESTING_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  TESTING_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-500",
  },
  RESUBMISSION_BY_TESTING: {
    label: "Resubmit",
    color: "bg-blue-600",
  },
  RESUBMISSION_BY_CLIENT: {
    label: "Resubmit",
    color: "bg-blue-600",
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    label: "Approve",
    color: "bg-blue-600",
  },

  UNDER_QA_REVIEW: { label: "Approve", color: "bg-green-600" },
  QA_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-500" },
  UNDER_ADMIN_REVIEW: { label: "Approve", color: "bg-green-700" },
  ADMIN_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-600" },
  ADMIN_REJECTED: { label: "Reject", color: "bg-red-700" },
  APPROVED: { label: "Approve", color: "bg-green-700" },
};

// A small helper to lock fields per role (frontend hint; backend is the source of truth)
function canEdit(
  role: Role | undefined,
  field: string,
  status?: ChemistryReportStatus
) {
  if (!role || !status) return false;
  const transition = STATUS_TRANSITIONS[status];
  if (!transition || !transition.canEdit?.includes(role)) {
    return false;
  }

  if (!role) return false;

  if (FIELD_EDIT_MAP[role]?.includes("*")) return true;
  return FIELD_EDIT_MAP[role]?.includes(field) ?? false;
}

export default function ChemistryMixReportForm({
  report,
  onClose,
}: ChemistryReportFormProps) {
  const { user } = useAuth();

  const role = user?.role as Role | undefined;
  const navigate = useNavigate();

  const [isDirty, setIsDirty] = useState(false);

  const [status, setStatus] = useState(report?.status || "DRAFT");

  const markDirty = () => !isDirty && setIsDirty(true);
  useConfirmOnLeave(isDirty);

  // ---- core report identity ----
  const [reportId, setReportId] = useState<string | null>(report?.id ?? null);
  const [reportNumber, setReportNumber] = useState<string>(
    report?.reportNumber ?? ""
  );

  // ---- header fields (same as micro) ----
  const [client, setClient] = useState(
    report?.client ?? (user?.role === "CLIENT" ? user?.clientCode ?? "" : "")
  );
  const [dateSent, setDateSent] = useState(report?.dateSent || "");

  // ---- SAMPLE DESCRIPTION BLOCK ----
  const [sampleDescription, setSampleDescription] = useState(
    report?.sampleDescription || ""
  );

  // type of test: ID / Percent Assay / Content Uniformity
  type TestType = "ID" | "PERCENT_ASSAY" | "CONTENT_UNIFORMITY";
  const [testTypes, setTestTypes] = useState<TestType[]>(
    report?.testTypes || []
  );

  // sample collected position: top / mid / bottom
  type SampleCollected = "TOP_BEG" | "MID" | "BOTTOM_END";

  const [sampleCollected, setSampleCollected] = useState<SampleCollected | "">(
    report?.sampleCollected ?? ""
  );

  const [lotBatchNo, setLotBatchNo] = useState(report?.lotBatchNo || "");
  const [manufactureDate, setManufactureDate] = useState(
    report?.manufactureDate || ""
  );

  const [formulaId, setFormulaId] = useState(report?.formulaId || "");
  const [sampleSize, setSampleSize] = useState(report?.sampleSize || "");
  const [numberOfActives, setNumberOfActives] = useState(
    report?.numberOfActives || ""
  );
  const [dateReceived, setDateReceived] = useState(report?.dateReceived || "");

  // sample type checkboxes
  type SampleTypeKey =
    | "BULK"
    | "FINISHED_GOOD"
    | "RAW_MATERIAL"
    | "PROCESS_VALIDATION"
    | "CLEANING_VALIDATION"
    | "COMPOSITE"
    | "DI_WATER_SAMPLE";

  const [sampleTypes, setSampleTypes] = useState<SampleTypeKey[]>(
    report?.sampleTypes || []
  );

  const toggleSampleType = (key: SampleTypeKey) => {
    setSampleTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    markDirty();
  };

  const toggleTestType = (key: TestType) => {
    setTestTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    markDirty();
  };

  // ---- ACTIVES TABLE ----
  const [actives, setActives] = useState<ChemActiveRow[]>(
    report?.actives || DEFAULT_CHEM_ACTIVES
  );

  const updateActive = (index: number, patch: Partial<ChemActiveRow>) => {
    setActives((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
    markDirty();
  };

  // ---- comments / signatures ----
  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");

  const { errors, clearError, validateAndSetErrors } =
    useChemistryReportValidation(role, {
      status: status as ChemistryReportStatus,
    });

  const makeValues = (): ChemistryMixReportFormValues => ({
    client,
    dateSent,
    sampleDescription,
    testTypes,
    sampleCollected,
    lotBatchNo,
    manufactureDate,
    formulaId,
    sampleSize,
    numberOfActives,
    sampleTypes,
    dateReceived,
    actives,
    comments,
    testedBy,
    testedDate,
    reviewedBy,
    reviewedDate,
  });

  type SavedReport = {
    id: string;
    status: ChemistryReportStatus;
    reportNumber?: number | string;
  };

  const lock = (f: string) =>
    !canEdit(role, f, status as ChemistryReportStatus);

  type ActiveRowError = {
    formulaContent?: string;
    sopNo?: string;
    result?: string;
    dateTestedInitial?: string;
  };

  const [activeRowErrors, setActiveRowErrors] = useState<ActiveRowError[]>([]);
  const [activesTableError, setActivesTableError] = useState<string | null>(
    null
  );

  useEffect(() => {
    setActiveRowErrors((prev) =>
      Array.from({ length: actives.length }, (_, i) => prev[i] ?? {})
    );
  }, [actives.length]);

  useEffect(() => {
    validateActiveRows(actives, role);
  }, [actives, role, status]);

  function validateActiveRows(
    rows: ChemActiveRow[],
    who: Role | undefined = role
  ) {
    const rowErrs: ActiveRowError[] = rows.map(() => ({}));
    let tableErr: string | null = null;

    const checkedRows = rows.filter((r) => r.checked);
    const anyChecked = checkedRows.length > 0;

    // If nothing selected, only CLIENT should be blocked (per your example)
    if (!anyChecked) {
      if (who === "CLIENT") {
        tableErr = "Select at least 1 active to be tested";
      }
      setActiveRowErrors(rowErrs);
      setActivesTableError(tableErr);
      return !tableErr;
    }

    if (who === "CLIENT") {
      rows.forEach((r, i) => {
        if (r.checked && !r.formulaContent?.trim()) {
          rowErrs[i].formulaContent = "Required";
        }
      });
    }

    if (who === "CHEMISTRY" || who === "ADMIN") {
      rows.forEach((r, i) => {
        if (!r.checked) return;

        if (!r.sopNo?.trim()) rowErrs[i].sopNo = "Required";
        if (!r.result?.trim()) rowErrs[i].result = "Required";
        if (!r.dateTestedInitial?.trim())
          rowErrs[i].dateTestedInitial = "Required";
      });
    }

    setActiveRowErrors(rowErrs);
    setActivesTableError(tableErr);

    return (
      !tableErr &&
      rowErrs.every(
        (e) =>
          !e.formulaContent && !e.sopNo && !e.result && !e.dateTestedInitial
      )
    );
  }

  function setActiveChecked(idx: number, checked: boolean) {
    setActives((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], checked };
      validateActiveRows(copy, role);
      return copy;
    });

    // clear row errors if unchecked
    setActiveRowErrors((prev) => {
      const c = [...prev];
      c[idx] = checked ? c[idx] : {};
      return c;
    });

    markDirty();
  }

  function setActiveField(idx: number, patch: Partial<ChemActiveRow>) {
    setActives((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      validateActiveRows(copy, role);
      return copy;
    });

    // clear the specific row error when user types
    setActiveRowErrors((prev) => {
      const c = [...prev];
      c[idx] = {
        ...c[idx],
        ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])),
      };
      return c;
    });

    markDirty();
  }

  // ------------- SAVE -------------
  const handleSave = async (): Promise<SavedReport | null> => {
    const values = makeValues();

    const okFields = validateAndSetErrors(values);
    const okRows = validateActiveRows(values.actives || [], role);

    if (!okFields) {
      alert("⚠️ Please fix the highlighted fields before saving.");
      return null;
    }
    if (!okRows) {
      alert("⚠️ Please fix the highlighted actives before saving.");
      return null;
    }

    const payload = {
      client,
      dateSent,
      formType: "CHEMISTRY_MIX" as const, // important for backend
      sampleDescription,
      testTypes,
      sampleCollected,
      lotBatchNo,
      manufactureDate: manufactureDate?.trim() || "NA",
      formulaId,
      sampleSize,
      numberOfActives,
      sampleTypes,
      dateReceived,
      actives,
      comments,
      testedBy,
      testedDate,
      reviewedBy,
      reviewedDate,
    };

    try {
      let saved: SavedReport;

      if (reportId) {
        saved = await api<SavedReport>(`/chemistry-reports/${reportId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        saved = await api<SavedReport>("/chemistry-reports/chemistry-mix", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setReportId(saved.id); // 👈 keep the new id
      setStatus(saved.status); // in case backend changed it
      setReportNumber(String(saved.reportNumber ?? ""));
      setIsDirty(false);
      alert("✅ Chemistry report saved");
      return saved;
    } catch (err: any) {
      console.error(err);
      alert("❌ Error saving chemistry report: " + err.message);
      return null;
    }
  };

  type UpdatedReport = {
    status?: ChemistryReportStatus;
    reportNumber?: number | string;
  };

  async function handleStatusChange(newStatus: ChemistryReportStatus) {
    const cur = status as ChemistryReportStatus;

    // ✅ permission guard
    const t = STATUS_TRANSITIONS[cur];
    if (!role || !t?.canSet?.includes(role) || !t.next?.includes(newStatus)) {
      toast.error("Not allowed to change status.");
      return;
    }

    const savingToast = toast.loading("Saving...");

    try {
      // ✅ save first if needed
      let saved: SavedReport | null = null;
      if (!reportId || isDirty) {
        saved = await handleSave();
        if (!saved) {
          toast.dismiss(savingToast);
          return;
        }
      }

      const effectiveId = reportId ?? saved?.id;
      if (!effectiveId) {
        toast.dismiss(savingToast);
        toast.error("Missing report id.");
        return;
      }

      toast.dismiss(savingToast);
      const statusToast = toast.loading("Updating status...");

      const updated = await api<UpdatedReport>(
        `/chemistry-reports/${effectiveId}/status`,
        { method: "PATCH", body: JSON.stringify({ status: newStatus }) }
      );

      toast.dismiss(statusToast);

      setStatus(updated.status ?? newStatus);
      setReportNumber(String(updated.reportNumber ?? reportNumber));
      setIsDirty(false);

      toast.success(`✅ Status updated to ${newStatus}`);

      // navigate
      if (role === "CLIENT") navigate("/clientDashboard");
      else if (role === "FRONTDESK") navigate("/frontdeskDashboard");
      else if (role === "CHEMISTRY") navigate("/chemistryDashboard");
      else if (role === "QA") navigate("/qaDashboard");
      else if (role === "ADMIN") navigate("/adminDashboard");
      else if (role === "SYSTEMADMIN") navigate("/systemAdminDashboard");
    } catch (err: any) {
      toast.dismiss(savingToast);
      toast.error(err?.message || "❌ Failed to update status");
      console.error(err);
    }
  }

  const handleClose = () => {
    if (onClose) onClose();
    else navigate(-1);
  };

  // Above component body (or inside, before return)
  const sampleTypeColumns: [SampleTypeKey, string][][] = [
    [
      ["BULK", "BULK"],
      ["FINISHED_GOOD", "FINISHED GOOD"],
    ],
    [
      ["RAW_MATERIAL", "RAW MATERIAL"],
      ["COMPOSITE", "COMPOSITE"],
    ],
    [
      ["PROCESS_VALIDATION", "PROCESS VALIDATION (PV)"],
      ["DI_WATER_SAMPLE", "DI WATER SAMPLE"],
    ],
  ];

  const inputClass = (name: keyof typeof errors, extra = "") =>
    `input-editable px-1 py-[2px] text-[12px] leading-snug border ${
      errors[name] ? "border-red-500 ring-1 ring-red-500" : "border-black/70"
    } ${extra}`;

  // ---------------- RENDER ----------------
  return (
    <>
      <PrintStyles />

      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow p-4">
        {/* Top buttons */}
        <div className="no-print mb-4 flex justify-end gap-2">
          <button
            className="px-3 py-1 rounded-md border bg-gray-600 text-white"
            onClick={handleClose}
          >
            Close
          </button>
          <button
            className="px-3 py-1 rounded-md border bg-blue-600 text-white"
            onClick={handleSave}
          >
            {reportId ? "Update Report" : "Save Report"}
          </button>
        </div>

        {/* Letterhead – same look as Micro */}
        <div className="mb-2 text-center">
          <div
            className="font-bold tracking-wide text-[22px]"
            style={{ color: "blue" }}
          >
            OMEGA BIOLOGICAL LABORATORY, INC.
          </div>
          <div className="text-[16px]" style={{ color: "blue" }}>
            (FDA REG.)
          </div>
          <div className="text-[12px]">
            56 PARK AVENUE, LYNDHURST, NJ 07071 <br />
            Tel: (201) 883 1222 • Fax: (201) 883 0449
          </div>
          <div className="text-[12px]">
            Email: <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
          </div>
          <div className="mt-1 grid grid-cols-3 items-center">
            <div />
            <div className="text-[18px] font-bold text-center underline">
              Report
            </div>
            <div className="text-right text-[12px] font-bold">
              {reportNumber}
            </div>
          </div>
        </div>

        {/* CLIENT / DATE SENT */}
        <div className="w-full border border-black text-[12px]">
          <div className="grid grid-cols-[67%_33%] border-b border-black">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">CLIENT :</div>
              {lock("client") ? (
                <div className="flex-1  min-h-[14px]">{client}</div>
              ) : (
                <input
                  className="flex-1 border-none  text-[12px]"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value.toUpperCase());
                    markDirty();
                  }}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">DATE SENT :</div>
              <FieldErrorBadge name="dateSent" errors={errors} />
              {lock("dateSent") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(dateSent)}
                </div>
              ) : (
                <input
                  className={inputClass("dateSent", "flex-1")}
                  type="date"
                  value={formatDateForInput(dateSent)}
                  onChange={(e) => {
                    setDateSent(e.target.value);
                    clearError("dateSent");
                    markDirty();
                  }}
                  aria-invalid={!!errors.dateSent}
                />
              )}
            </div>
          </div>

          {/* SAMPLE DESCRIPTION line */}
          <div className="border-b border-black flex items-center gap-2 px-2">
            <div className="w-40 font-medium">SAMPLE DESCRIPTION :</div>
            <FieldErrorBadge name="sampleDescription" errors={errors} />
            {lock("sampleDescription") ? (
              <div className="flex-1 min-h-[14px]"> {sampleDescription}</div>
            ) : (
              <input
                className={inputClass("sampleDescription", "flex-1")}
                value={sampleDescription}
                onChange={(e) => {
                  setSampleDescription(e.target.value);
                  clearError("sampleDescription");
                  markDirty();
                }}
                aria-invalid={!!errors.sampleDescription}
              />
            )}
          </div>

          {/* TYPE OF TEST / SAMPLE COLLECTED */}
          <div className="grid grid-cols-[47%_53%] border-b border-black text-[11px]">
            <div className="px-2 border-r border-black flex items-center gap-2 text-[11px]">
              <span className="font-medium mr-1 whitespace-nowrap">
                TYPE OF TEST :
              </span>

              <div
                id="f-testTypes"
                className={`
      inline-flex items-center gap-2 whitespace-nowrap px-1
      ${
        errors.testTypes
          ? "border border-red-500 ring-1 ring-red-500"
          : "border border-transparent"
      }
    `}
              >
                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={testTypes.includes("ID")}
                    onChange={() => {
                      if (lock("testTypes")) return;
                      toggleTestType("ID");
                      clearError("testTypes");
                    }}
                    className={
                      lock("testTypes") ? "accent-black" : "accent-blue-600"
                    }
                  />
                  ID
                </label>

                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={testTypes.includes("PERCENT_ASSAY")}
                    onChange={() => {
                      if (lock("testTypes")) return;
                      toggleTestType("PERCENT_ASSAY");
                      clearError("testTypes");
                    }}
                    className={
                      lock("testTypes") ? "accent-black" : "accent-blue-600"
                    }
                  />
                  Percent Assay
                </label>

                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={testTypes.includes("CONTENT_UNIFORMITY")}
                    onChange={() => {
                      if (lock("testTypes")) return;
                      toggleTestType("CONTENT_UNIFORMITY");
                      clearError("testTypes");
                    }}
                    className={
                      lock("testTypes") ? "accent-black" : "accent-blue-600"
                    }
                  />
                  Content Uniformity
                </label>
              </div>

              <FieldErrorBadge name="testTypes" errors={errors} />
            </div>

            <div className="px-2 flex items-center gap-2 text-[11px]">
              <span className="font-medium mr-1 whitespace-nowrap">
                SAMPLE COLLECTED :
              </span>

              {/* 🔴 this wrapper gets the red border (doesn't change layout) */}
              <div
                id="f-sampleCollected"
                className={`
      inline-flex items-center gap-2 whitespace-nowrap px-1
      ${
        errors.sampleCollected
          ? "border border-red-500 ring-1 ring-red-500"
          : "border border-transparent"
      }
    `}
              >
                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input
                    type="radio"
                    name="sampleCollected"
                    checked={sampleCollected === "TOP_BEG"}
                    onChange={() => {
                      if (lock("sampleCollected")) return;
                      setSampleCollected("TOP_BEG");
                      clearError("sampleCollected");
                      markDirty();
                    }}
                    className={
                      lock("sampleCollected")
                        ? "accent-black"
                        : "accent-blue-600"
                    }
                  />
                  Top / Beg
                </label>

                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input
                    type="radio"
                    name="sampleCollected"
                    checked={sampleCollected === "MID"}
                    onChange={() => {
                      if (lock("sampleCollected")) return;
                      setSampleCollected("MID");
                      clearError("sampleCollected");
                      markDirty();
                    }}
                    className={
                      lock("sampleCollected")
                        ? "accent-black"
                        : "accent-blue-600"
                    }
                  />
                  Mid
                </label>

                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input
                    type="radio"
                    name="sampleCollected"
                    checked={sampleCollected === "BOTTOM_END"}
                    onChange={() => {
                      if (lock("sampleCollected")) return;
                      setSampleCollected("BOTTOM_END");
                      clearError("sampleCollected");
                      markDirty();
                    }}
                    className={
                      lock("sampleCollected")
                        ? "accent-black"
                        : "accent-blue-600"
                    }
                  />
                  Bottom / End
                </label>
              </div>

              <FieldErrorBadge name="sampleCollected" errors={errors} />
            </div>
          </div>

          {/* LOT / MFG DATE */}
          <div className="grid grid-cols-[50%_50%] border-b border-black text-[12px]">
            <div className="px-2 border-r border-black flex items-center gap-2">
              <span className="font-medium">LOT / BATCH # :</span>
              <FieldErrorBadge name="lotBatchNo" errors={errors} />
              {lock("lotBatchNo") ? (
                <div className="flex-1 min-h-[14px]"> {lotBatchNo}</div>
              ) : (
                <input
                  className={inputClass("lotBatchNo", "flex-1")}
                  value={lotBatchNo}
                  onChange={(e) => {
                    setLotBatchNo(e.target.value);
                    clearError("lotBatchNo");
                    markDirty();
                  }}
                  aria-invalid={!!errors.lotBatchNo}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-2">
              <span className="font-medium">MANUFACTURE DATE :</span>
              <FieldErrorBadge name="manufactureDate" errors={errors} />
              {lock("manufactureDate") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(manufactureDate)}
                </div>
              ) : (
                <input
                  className={inputClass("manufactureDate", "flex-1")}
                  type="date"
                  value={formatDateForInput(manufactureDate)}
                  onChange={(e) => {
                    setManufactureDate(e.target.value);
                    clearError("manufactureDate");
                    markDirty();
                  }}
                  aria-invalid={!!errors.manufactureDate}
                />
              )}
            </div>
          </div>

          {/* FORMULA / SAMPLE SIZE / NUMBER OF ACTIVES */}
          <div className="grid grid-cols-[35%_30%_35%] border-b border-black text-[12px]">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                FORMULA # / ID # :
              </span>
              <FieldErrorBadge name="formulaId" errors={errors} />
              {lock("formulaId") ? (
                <div className="flex-1 min-h-[14px]">{formulaId}</div>
              ) : (
                <input
                  className={inputClass("formulaId", "w-[140px]")}
                  value={formulaId}
                  onChange={(e) => {
                    setFormulaId(e.target.value);
                    clearError("formulaId");
                    markDirty();
                  }}
                  aria-invalid={!!errors.formulaId}
                />
              )}
            </div>

            <div className="px-2 border-r border-black flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                SAMPLE SIZE :
              </span>
              <FieldErrorBadge name="sampleSize" errors={errors} />
              {lock("sampleSize") ? (
                <div className="flex-1 min-h-[14px]">{sampleSize}</div>
              ) : (
                <input
                  className={inputClass("sampleSize", "w-[140px]")}
                  value={sampleSize}
                  onChange={(e) => {
                    setSampleSize(e.target.value);
                    clearError("sampleSize");
                    markDirty();
                  }}
                  aria-invalid={!!errors.sampleSize}
                />
              )}
            </div>

            <div className="px-2 flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                NUMBER OF ACTIVES :
              </span>
              <FieldErrorBadge name="numberOfActives" errors={errors} />
              {lock("numberOfActives") ? (
                <div className="flex-1 min-h-[14px]">{numberOfActives}</div>
              ) : (
                <input
                  className={inputClass("numberOfActives", "w-[125px]")}
                  value={numberOfActives}
                  onChange={(e) => {
                    setNumberOfActives(e.target.value);
                    clearError("numberOfActives");
                    markDirty();
                  }}
                  aria-invalid={!!errors.numberOfActives}
                />
              )}
            </div>
          </div>

          {/* SAMPLE TYPE checkboxes */}
          {/* SAMPLE TYPE checkboxes */}
          <div className="px-2 text-[11px] flex items-stretch gap-3">
            {/* LEFT: Sample type */}
            <div className="flex w-fit pr-7 py-1 self-stretch border-r border-black">
              <span className="font-medium mr-4 whitespace-nowrap">
                SAMPLE TYPE :
              </span>

              {/* 🔴 group error wrapper (no layout change) */}
              <div
                id="f-sampleTypes"
                className={`
        inline-flex
        ${
          errors.sampleTypes
            ? "border border-red-500 ring-1 ring-red-500 rounded-[2px] px-1"
            : "border border-transparent"
        }
      `}
              >
                <div className="grid grid-cols-3 gap-x-1 gap-y-1 -ml-2 w-fit">
                  {sampleTypeColumns.map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-[2px] w-fit">
                      {col.map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-1 whitespace-nowrap"
                        >
                          <input
                            type="checkbox"
                            checked={sampleTypes.includes(key)}
                            onChange={() => {
                              if (lock("sampleTypes")) return;
                              toggleSampleType(key);
                              clearError("sampleTypes");
                              markDirty();
                            }}
                            className={
                              lock("sampleTypes")
                                ? "accent-black"
                                : "accent-blue-600"
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <FieldErrorBadge name="sampleTypes" errors={errors} />
            </div>

            {/* RIGHT: Date received */}
            <div className="flex items-center gap-2 whitespace-nowrap ml-1 py-1">
              <span className="whitespace-nowrap font-medium">
                DATE RECEIVED :
              </span>

              {lock("dateReceived") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(dateReceived)}
                </div>
              ) : (
                <input
                  id="f-dateReceived"
                  type="date"
                  className={`
          w-[130px] border-0 border-b outline-none text-[11px]
          ${
            errors.dateReceived
              ? "border-b-red-500 ring-1 ring-red-500"
              : "border-b-black/60"
          }
        `}
                  value={formatDateForInput(dateReceived)}
                  onChange={(e) => {
                    setDateReceived(e.target.value);
                    clearError("dateReceived");
                    markDirty();
                  }}
                  aria-invalid={!!errors.dateReceived}
                />
              )}

              <FieldErrorBadge name="dateReceived" errors={errors} />
            </div>
          </div>
        </div>

        {/* ---- ACTIVE TO BE TESTED TABLE ---- */}

        <div
          className={`mt-3 border text-[11px] ${
            activesTableError
              ? "border-red-500 ring-1 ring-red-500"
              : "border-black"
          }`}
        >
          <FieldErrorBadge name="actives" errors={errors} />

          {activesTableError && (
            <div className="px-2 py-1 text-[11px] text-red-600">
              {activesTableError}
            </div>
          )}

          <div className="grid grid-cols-[25%_15%_23%_20%_17%] font-semibold text-center border-b border-black">
            <div className="p-1 border-r border-black">ACTIVE TO BE TESTED</div>
            <div className="p-1 border-r border-black">SOP #</div>
            <div className="p-1 border-r border-black">FORMULA CONTENT</div>
            <div className="p-1 border-r border-black">RESULTS</div>
            <div className="p-1">DATE TESTED / INITIAL</div>
          </div>

          {actives.map((row, idx) => {
            const rowErr = activeRowErrors[idx] || {};
            const showRowRing = !!(
              rowErr.formulaContent ||
              rowErr.sopNo ||
              rowErr.result ||
              rowErr.dateTestedInitial
            );

            const inputErrClass = (hasErr?: boolean) =>
              hasErr ? "ring-1 ring-red-500" : "";

            return (
              <div
                key={row.key}
                className={`grid grid-cols-[25%_15%_23%_20%_17%] border-b last:border-b-0 border-black ${
                  showRowRing ? "ring-1 ring-red-500" : ""
                }`}
              >
                {/* active name + checkbox */}
                <div className="flex items-center gap-2 border-r border-black px-1">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => setActiveChecked(idx, e.target.checked)}
                    disabled={lock("actives") || role !== "CLIENT"}
                    className={
                      lock("actives") || role !== "CLIENT"
                        ? "accent-black"
                        : "accent-blue-600"
                    }
                  />
                  <span>{row.label}</span>
                </div>

                {/* SOP # */}
                <div
                  className={`border-r border-black px-1 ${inputErrClass(
                    !!rowErr.sopNo
                  )}`}
                >
                  <input
                    className="w-full border-none outline-none text-[11px]"
                    value={row.sopNo}
                    onChange={(e) =>
                      setActiveField(idx, { sopNo: e.target.value })
                    }
                    disabled={lock("actives") || role === "CLIENT"}
                  />
                </div>

                {/* formula content % */}
                <div
                  className={`border-r border-black px-1 flex items-center gap-1 ${inputErrClass(
                    !!rowErr.formulaContent
                  )}`}
                >
                  <input
                    className="flex-1 border-none outline-none text-[11px]"
                    value={row.formulaContent}
                    onChange={(e) =>
                      setActiveField(idx, { formulaContent: e.target.value })
                    }
                    disabled={lock("actives") || role !== "CLIENT"}
                  />
                  <span>%</span>
                </div>

                {/* result % */}
                <div
                  className={`border-r border-black px-1 flex items-center gap-1 ${inputErrClass(
                    !!rowErr.result
                  )}`}
                >
                  <input
                    className="flex-1 border-none outline-none text-[11px]"
                    value={row.result}
                    onChange={(e) =>
                      setActiveField(idx, { result: e.target.value })
                    }
                    disabled={lock("actives") || role === "CLIENT"}
                  />
                  <span>%</span>
                </div>

                {/* date tested / initials */}
                <div
                  className={`px-1 ${inputErrClass(
                    !!rowErr.dateTestedInitial
                  )}`}
                >
                  <input
                    className="w-full border-none outline-none text-[11px]"
                    placeholder="MM/DD/YYYY / AB"
                    value={row.dateTestedInitial}
                    onChange={(e) =>
                      setActiveField(idx, { dateTestedInitial: e.target.value })
                    }
                    disabled={lock("actives") || role === "CLIENT"}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* NOTE line (you can make this static text) */}
        <div className="mt-2 text-[10px]">
          NOTE : Turn Over time is at least 1 week. Biochem, Inc is not
          responsible for the release of any product not in the Biochem
          stability program.
        </div>

        {/* Comments + signatures */}
        <div className="mt-2 text-[12px]">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium">Comments :</span>
            <FieldErrorBadge name="comments" errors={errors} />

            {lock("comments") ? (
              <div className="flex-1 min-h-[14px]">{comments}</div>
            ) : (
              <input
                className={inputClass("comments", "flex-1")}
                value={comments}
                onChange={(e) => {
                  setComments(e.target.value);
                  clearError("comments");
                  markDirty();
                }}
                aria-invalid={!!errors.comments}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">TESTED BY :</span>
                <FieldErrorBadge name="testedBy" errors={errors} />
                <input
                  className={inputClass(
                    "testedBy",
                    "flex-1 border-0 border-b border-black/60 outline-none"
                  )}
                  value={testedBy}
                  onChange={(e) => {
                    setTestedBy(e.target.value.toUpperCase());
                    clearError("testedBy");
                    markDirty();
                  }}
                  aria-invalid={!!errors.testedBy}
                  readOnly={lock("testedBy")}
                  placeholder="Name"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">DATE :</span>
                <FieldErrorBadge name="testedDate" errors={errors} />
                <input
                  className={inputClass(
                    "testedDate",
                    "flex-1 border-0 border-b border-black/60 outline-none"
                  )}
                  type="date"
                  value={formatDateForInput(testedDate)}
                  onChange={(e) => {
                    setTestedDate(e.target.value);
                    clearError("testedDate");
                    markDirty();
                  }}
                  aria-invalid={!!errors.testedDate}
                  readOnly={lock("testedDate")}
                  placeholder="MM/DD/YYYY"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">REVIEWED BY :</span>
                <FieldErrorBadge name="reviewedBy" errors={errors} />
                <input
                  className={inputClass(
                    "reviewedBy",
                    "flex-1 border-0 border-b border-black/60 outline-none"
                  )}
                  value={reviewedBy}
                  onChange={(e) => {
                    setReviewedBy(e.target.value.toUpperCase());
                    clearError("reviewedBy");
                    markDirty();
                  }}
                  aria-invalid={!!errors.reviewedBy}
                  readOnly={lock("reviewedBy")}
                  placeholder="Name"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">DATE :</span>
                <FieldErrorBadge name="reviewedDate" errors={errors} />
                <input
                  className={inputClass(
                    "reviewedDate",
                    "flex-1 border-0 border-b border-black/60 outline-none"
                  )}
                  type="date"
                  value={formatDateForInput(reviewedDate)}
                  onChange={(e) => {
                    setReviewedDate(e.target.value);
                    clearError("reviewedDate");
                    markDirty();
                  }}
                  aria-invalid={!!errors.reviewedDate}
                  readOnly={lock("reviewedDate")}
                  placeholder="MM/DD/YYYY"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions row: submit/reject on left, close on right */}
      <div className="no-print mt-4 flex items-center justify-between">
        {/* Left: status action buttons */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TRANSITIONS[status as ChemistryReportStatus]?.next.map(
            (targetStatus: ChemistryReportStatus) => {
              if (
                STATUS_TRANSITIONS[
                  status as ChemistryReportStatus
                ].canSet.includes(role!) &&
                statusButtons[targetStatus]
              ) {
                const { label, color } = statusButtons[targetStatus];
                return (
                  <button
                    key={targetStatus}
                    className={`px-4 py-2 rounded-md border text-white ${color}`}
                    // onClick={() => requestStatusChange(targetStatus)}
                    onClick={() => handleStatusChange(targetStatus)}

                    // disabled={role === "SYSTEMADMIN"}
                  >
                    {label}
                  </button>
                );
              }
              return null;
            }
          )}
        </div>
      </div>
    </>
  );
}
