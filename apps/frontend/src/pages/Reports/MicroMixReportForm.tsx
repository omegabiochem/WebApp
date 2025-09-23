import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useBlocker, useNavigate } from "react-router-dom";
import { useReportValidation, FieldErrorBadge, type ReportFormValues } from "../../utils/reportValidation";

// Hook for confirming navigation
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
}


// ----- Roles (keep in sync with backend) -----
type Role = "SYSTEMADMIN" | "ADMIN" | "FRONTDESK" | "MICRO" | "QA" | "CLIENT";

// ----- ReportStatus (mirror backend) -----
export type ReportStatus =
  | "DRAFT"
  | "SUBMITTED_BY_CLIENT"
  | "CLIENT_NEEDS_CORRECTION"
  | "RECEIVED_BY_FRONTDESK"
  | "FRONTDESK_ON_HOLD"
  | "FRONTDESK_NEEDS_CORRECTION"
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

// ---- Mirror of backend STATUS_TRANSITIONS ----
const STATUS_TRANSITIONS: Record<
  ReportStatus,
  {
    canSet: Role[];
    next: ReportStatus[];
    nextEditableBy: Role[];
    canEdit: Role[];
  }
> = {
  DRAFT: {
    canSet: ["CLIENT", "FRONTDESK", "ADMIN", "SYSTEMADMIN"],
    next: ["SUBMITTED_BY_CLIENT", "CLIENT_NEEDS_CORRECTION"],
    nextEditableBy: ["CLIENT", "FRONTDESK"],
    canEdit: ["CLIENT"],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ['FRONTDESK', 'MICRO'],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["FRONTDESK", "MICRO"],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ["FRONTDESK"],
    next: ["UNDER_TESTING_REVIEW", "FRONTDESK_ON_HOLD", "FRONTDESK_REJECTED"],
    nextEditableBy: ["MICRO"],
    canEdit: ["FRONTDESK"],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ["FRONTDESK"],
    next: ["RECEIVED_BY_FRONTDESK", "FRONTDESK_REJECTED"],
    nextEditableBy: ["FRONTDESK"],
    canEdit: [],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ['FRONTDESK', 'ADMIN'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  FRONTDESK_REJECTED: {
    canSet: ["FRONTDESK"],
    next: ["CLIENT_NEEDS_CORRECTION"],
    nextEditableBy: ["CLIENT", "FRONTDESK"],
    canEdit: [],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["SUBMITTED_BY_CLIENT"],
    nextEditableBy: ["FRONTDESK"],
    canEdit: ['CLIENT'],
  },
  UNDER_TESTING_REVIEW: {
    canSet: ["MICRO"],
    next: ["TESTING_ON_HOLD", "TESTING_NEEDS_CORRECTION", "UNDER_QA_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: ['MICRO'],
  },
  TESTING_ON_HOLD: {
    canSet: ["MICRO"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: [],
  },
  TESTING_NEEDS_CORRECTION: {
    canSet: ['MICRO', 'ADMIN', 'CLIENT'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['CLIENT'],
  },
  TESTING_REJECTED: {
    canSet: ["MICRO"],
    next: ["FRONTDESK_ON_HOLD", "FRONTDESK_REJECTED"],
    nextEditableBy: ["FRONTDESK"],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ["QA"],
    next: ["QA_NEEDS_CORRECTION", "QA_REJECTED", "UNDER_ADMIN_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: ['QA'],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ["QA"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: [],
  },
  QA_REJECTED: {
    canSet: ["QA"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: [],
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
    canEdit: [],
  },
  APPROVED: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["LOCKED"],
    nextEditableBy: [],
    canEdit: [],
  },
  LOCKED: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
};

// ---- Map each transition to buttons ----

const statusButtons: Record<string, { label: string; color: string }> = {
  SUBMITTED_BY_CLIENT: { label: "Submit", color: "bg-green-600" },
  CLIENT_NEEDS_CORRECTION: { label: "Reject", color: "bg-red-600" },
  RECEIVED_BY_FRONTDESK: { label: "Approve", color: "bg-green-600" },
  FRONTDESK_ON_HOLD: { label: "Hold", color: "bg-yellow-500" },
  FRONTDESK_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-red-600" },
  FRONTDESK_REJECTED: { label: "Reject", color: "bg-red-600" },
  UNDER_TESTING_REVIEW: { label: "Approve", color: "bg-green-600" },
  TESTING_ON_HOLD: { label: "Hold", color: "bg-yellow-500" },
  TESTING_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-red-600" },
  // TESTING_REJECTED: { label: "Reject", color: "bg-red-600" },
  UNDER_QA_REVIEW: { label: "Approve", color: "bg-green-600" },
  QA_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-500" },
  QA_REJECTED: { label: "Reject", color: "bg-red-600" },
  UNDER_ADMIN_REVIEW: { label: "Approve", color: "bg-green-700" },
  ADMIN_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-600" },
  ADMIN_REJECTED: { label: "Reject", color: "bg-red-700" },
  APPROVED: { label: "Approve", color: "bg-green-700" },
};

// A small helper to lock fields per role (frontend hint; backend is the source of truth)
function canEdit(role: Role | undefined, field: string, status?: ReportStatus) {
  if (!role || !status) return false;
  const transition = STATUS_TRANSITIONS[status]; // ✅ safe now
  if (!transition || !transition.canEdit?.includes(role)) {
    return false;
  }
  const map: Record<Role, string[]> = {
    SYSTEMADMIN: [],
    ADMIN: ["testSopNo", "dateTested", "preliminaryResults", "preliminaryResultsDate",
      "tbc_gram", "tbc_result", "tbc_spec",
      "tmy_gram", "tmy_result", "tmy_spec",
      "pathogens", "comments", "testedBy", "testedDate",
      "dateCompleted", "reviewedBy", "reviewedDate"],
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
      // "tbc_dilution",
      "tbc_gram",
      "tbc_result",
      // "tmy_dilution",
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
    ], // read-only
  };
  if (!role) return false;
  // special rule: client can edit anything in DRAFT
  // if (role === "CLIENT" && status === "DRAFT") {
  //   return true;
  // }

  if (map[role]?.includes("*")) return true;
  return map[role]?.includes(field) ?? false;
}

// // Simple input wrapper that locks by role
// function Field({
//   label,
//   value,
//   onChange,
//   readOnly,
//   className = "",
//   inputClass = "",
//   placeholder = " ", // placeholder space keeps boxes visible when empty
// }: {
//   label: string;
//   value: string;
//   onChange: (v: string) => void;
//   readOnly?: boolean;
//   className?: string;
//   inputClass?: string;
//   placeholder?: string;
// }) {
//   return (
//     <div className={`flex gap-2 items-center ${className}`}>
//       <div className="w-48 shrink-0 text-[12px] font-medium">{label}</div>
//       <input
//         className={`flex-1 border border-black/70 px-2 py-1 text-[12px] leading-tight ${inputClass}`}
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         readOnly={readOnly}
//         placeholder={placeholder}
//       />
//     </div>
//   );
// }

// Print styles: A4-ish, monochrome borders, hide controls when printing
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

export default function MicroMixReportForm({ report, onClose }: { report?: any; onClose?: () => void }) {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  const navigate = useNavigate();

  // const initialData = JSON.stringify(report || {});
  const [isDirty, setIsDirty] = useState(false);

  const [status, setStatus] = useState(report?.status || "DRAFT");
  // inside MicroMixReportForm
  const [reportId, setReportId] = useState(report?.id || null);

  const [reportNumber, setReportNumber] = useState<string>(report?.reportNumber || "");


  // //To set clientCode automatically when creating a new report
  // const initialClientValue = report?.client || (role === "CLIENT" ? user?.clientCode || "" : "");

  // ---- local state (prefill from report if editing) ----
  // const [client, setClient] = useState(initialClientValue);
  const [client, setClient] = useState(
    report?.client ?? (!report?.id && role === "CLIENT" ? user?.clientCode ?? "" : "")
  );
  const [dateSent, setDateSent] = useState(report?.dateSent || "");
  const [typeOfTest, setTypeOfTest] = useState(report?.typeOfTest || "");
  const [sampleType, setSampleType] = useState(report?.sampleType || "");
  const [formulaNo, setFormulaNo] = useState(report?.formulaNo || "");
  const [description, setDescription] = useState(report?.description || "");
  const [lotNo, setLotNo] = useState(report?.lotNo || "");
  const [manufactureDate, setManufactureDate] = useState(
    report?.manufactureDate || ""
  );
  const [testSopNo, setTestSopNo] = useState(report?.testSopNo || "");
  const [dateTested, setDateTested] = useState(report?.dateTested || "");
  const [preliminaryResults, setPreliminaryResults] = useState(
    report?.preliminaryResults || ""
  );
  const [preliminaryResultsDate, setPreliminaryResultsDate] = useState(
    report?.preliminaryResultsDate || ""
  );
  const [dateCompleted, setDateCompleted] = useState(
    report?.dateCompleted || ""
  );

  // TBC/TFC blocks
  //   const [tbc_dilution, set_tbc_dilution] = useState("x 10^1");
  const [tbc_gram, set_tbc_gram] = useState(report?.tbc_gram || "");
  const [tbc_result, set_tbc_result] = useState(report?.tbc_result || "");
  const [tbc_spec, set_tbc_spec] = useState(report?.tbc_spec || "");

  //   const [tmy_dilution, set_tmy_dilution] = useState("x 10^1"); // Total Mold & Yeast
  const [tmy_gram, set_tmy_gram] = useState(report?.tmy_gram || "");
  const [tmy_result, set_tmy_result] = useState(report?.tmy_result || "");
  const [tmy_spec, set_tmy_spec] = useState(report?.tmy_spec || "");


  type PathogenSpec = "Absent" | "Present" | "";

  // Pathogens (Absent/Present + sample grams)
  type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    // grams: string;
    result: "Absent" | "Present" | "";
    spec: PathogenSpec;
  };
  const pathogenDefaults: PathRow[] = useMemo(
    () => [
      {
        checked: false,
        key: "E_COLI",
        label: "E.coli",
        //grams: "11g",
        result: "",
        spec: ""
      },
      {
        checked: false,
        key: "P_AER",
        label: "P.aeruginosa",
        //grams: "11g",
        result: "",
        spec: ""
      },
      {
        checked: false,
        key: "S_AUR",
        label: "S.aureus",
        //grams: "11g",
        result: "",
        spec: ""
      },
      {
        checked: false,
        key: "SALM",
        label: "Salmonella",
        //grams: "11g",
        result: "",
        spec: ""
      },
      {
        checked: false,
        key: "CLOSTRIDIA",
        label: "Clostridia species",
        grams: "3g",
        result: "",
        spec: ""
      },
      {
        checked: false,
        key: "C_ALB",
        label: "C.albicans",
        ////grams: "11g",
        result: "",
        spec: ""
      },
      {
        checked: false,
        key: "B_CEP",
        label: "B.cepacia",
        //grams: "11g",
        result: "",
        spec: ""
      },
      {
        checked: false,
        key: "OTHER",
        label: "Other",
        grams: "",
        result: "",
        spec: ""
      },
    ],
    []
  );



  // const [pathogens, setPathogens] = useState<PathRow[]>(pathogenDefaults);
  const [pathogens, setPathogens] = useState<PathRow[]>(
    report?.pathogens || pathogenDefaults
  );


  // --- Row-level errors for pathogens ---
  type PathogenRowError = { result?: string, spec?: string };
  const [pathogenRowErrors, setPathogenRowErrors] = useState<PathogenRowError[]>(
    []
  );

  const [pathogensTableError, setPathogensTableError] = useState<string | null>(null);





  function organismDisabled() {
    // Only CLIENT decides which organisms to test
    return role !== "CLIENT";
  }

  function resultDisabled(p: PathRow) {
    // Only MICRO can set results, and only if the organism is checked
    return !p.checked || (role !== "MICRO" && role !== "ADMIN");
  }



  // replace your validatePathogenRows with this:
  function validatePathogenRows(rows: PathRow[], who: Role | undefined = role) {
    const rowErrs: PathogenRowError[] = rows.map(() => ({}));
    let tableErr: string | null = null;

    if (who === "CLIENT") {
      if (!rows.some(r => r.checked)) {
        tableErr = "Select at least one organism.";
      }
      rows.forEach((r, i) => {
        if (r.checked && (r.spec !== "Absent" && r.spec !== "Present")) {
          rowErrs[i].spec = "Choose Absent or Present";
        }
      });
    }

    if (who === "MICRO" ||who === "ADMIN") {
      rows.forEach((r, i) => {
        if (r.checked && !r.result) rowErrs[i].result = "Select Absent or Present";
      });
    }

    setPathogenRowErrors(rowErrs);
    setPathogensTableError(tableErr);
    return !tableErr && rowErrs.every(e => !e.result && !e.spec);
  }


  function setPathogenChecked(idx: number, checked: boolean) {
    setPathogens((prev) => {
      const copy = [...prev];
      copy[idx] = { ...prev[idx], checked, ...(checked ? {} : { result: "" }) };
      validatePathogenRows(copy, role);
      return copy;
    });
    // Clear the row error if we unchecked (no result required anymore)
    setPathogenRowErrors(prev => { const c = [...prev]; c[idx] = {}; return c; });
    markDirty();
  }

  function setPathogenResult(idx: number, value: "Absent" | "Present") {
    setPathogens(prev => {
      const row = prev[idx];
      if (!row.checked) return prev; // ignore if organism not selected
      const copy = [...prev];
      copy[idx] = { ...row, result: value };
      validatePathogenRows(copy, role);
      return copy;
    });
    // Clear the row error once result is set
    setPathogenRowErrors((prev) => {
      const copy = [...prev];
      copy[idx] = {};
      return copy;
    });
    clearError("pathogens"); // optional if you still keep a table-level error elsewhere
    markDirty();
  }

  function clearPathogenResult(idx: number) {
    setPathogens((prev) => {
      const copy = [...prev];
      copy[idx] = { ...prev[idx], result: "" };
      validatePathogenRows(copy, role);
      return copy;
    });
    // Keep/restore the row error because a checked row without result is invalid
    setPathogenRowErrors((prev) => {
      const copy = [...prev];
      // if the row is still checked, show the error again
      copy[idx] = pathogens[idx]?.checked ? { result: "Select Absent or Present" } : {};
      return copy;
    });
    markDirty();
  }


  function setPathogenSpec(idx: number, value: PathogenSpec) {
    setPathogens(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], spec: value };
      return copy;
    });
    markDirty();
  }





  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");





  // const lock = (f: string) => !canEdit(role, f);
  // use:
  const lock = (f: string) => !canEdit(role, f, status as ReportStatus);

  const { errors, clearError, validateAndSetErrors } = useReportValidation(role);

  // Current values snapshot (use inside handlers)
  const makeValues = (): ReportFormValues => ({
    client, dateSent, typeOfTest, sampleType, formulaNo, description, lotNo, manufactureDate,
    testSopNo, dateTested, preliminaryResults, preliminaryResultsDate,
    tbc_gram, tbc_result, tbc_spec, tmy_gram, tmy_result, tmy_spec,
    comments, testedBy, testedDate, dateCompleted, reviewedBy, reviewedDate,
    pathogens,
  });


  // ----------- Save handler -----------

  const handleSave = async (): Promise<boolean> => {
    const values = makeValues();

    validateAndSetErrors(values);
    validatePathogenRows(values.pathogens, role);

    const token = localStorage.getItem("token");
    const API_BASE = "http://localhost:3000";

    const ALLOWED_FIELDS: Record<Role, string[]> = {
      ADMIN: ["*"],
      SYSTEMADMIN: [],
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
        "tbc_dilution",
        "tbc_gram",
        "tbc_result",
        "tmy_dilution",
        "tmy_gram",
        "tmy_result",
        "pathogens",
        "dateTested",
        "preliminaryResults",
        "preliminaryResultsDate",
        "testedBy",
        "testedDate",
        "comments",
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

    // Build full payload
    const fullPayload: any = {
      client,
      dateSent,
      typeOfTest,
      sampleType,
      formulaNo,
      description,
      lotNo,
      manufactureDate,
      testSopNo,
      dateTested,
      preliminaryResults,
      preliminaryResultsDate,
      dateCompleted,
      tbc_gram,
      tbc_result,
      tbc_spec,
      tmy_gram,
      tmy_result,
      tmy_spec,
      pathogens,
      comments,
      testedBy,
      reviewedBy,
      testedDate,
      reviewedDate,
    };
    // Filter fields based on role
    const allowed = ALLOWED_FIELDS[role || "CLIENT"] || [];
    const payload = allowed.includes("*")
      ? fullPayload
      : Object.fromEntries(
        Object.entries(fullPayload).filter(([k]) => allowed.includes(k))
      );

    // New reports always start as DRAFT
    if (!reportId) {
      payload.status = "DRAFT";
    }

    try {
      let res;

      if (reportId) {
        console.log("Updating report", reportId);
        // update
        res = await fetch(`${API_BASE}/reports/micro-mix/${reportId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({...payload,reason:"Saving"}),
        });
      } else {
        // create
        res = await fetch(`${API_BASE}/reports/micro-mix`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error("Failed to save draft");
      const saved = await res.json();
      setIsDirty(false);

      setReportId(saved.id); // 👈 keep the new id
      setStatus(saved.status); // in case backend changed it
      setReportNumber(saved.reportNumber || "");
      alert("✅ Report saved as '" + saved.status + "'");
      return true;
    } catch (err: any) {
      console.error(err);
      alert("❌ Error saving draft: " + err.message);
      return false;
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const token = localStorage.getItem("token");


    const API_BASE = "http://localhost:3000";

    const values = makeValues();
    const okFields = validateAndSetErrors(values);
    const okRows = validatePathogenRows(values.pathogens, role);
    if (newStatus === "SUBMITTED_BY_CLIENT" || newStatus === "RECEIVED_BY_FRONTDESK" ||
      newStatus === "UNDER_TESTING_REVIEW" || newStatus === "UNDER_QA_REVIEW" || newStatus === "UNDER_ADMIN_REVIEW" ||
      newStatus === "APPROVED") {

      if (!okFields) {
        alert("⚠️ Please fix the highlighted fields before changing status.");
        return;
      }

      if (!okRows) {
        alert("⚠️ Please fix the highlighted rows before changing status.");
        return;
      }
    }

    // 1) Always validate (role-based). Block status change if invalid.
    // const ok = validateAndSetErrors(makeValues());
    // if (!ok) {
    //   alert("⚠️ Please fix the highlighted fields before changing status.");
    //   return;
    // }

    // 2) Ensure latest data is saved before status change.
    //    If the report is new or has unsaved edits, save first.
    if (!reportId || isDirty) {
      const saved = await handleSave(); // this also paints errors if any
      if (!saved) return;               // stop if save failed
    }


    try {
      const url = `${API_BASE}/reports/micro-mix/${reportId}/status`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({reason:"Changing Status",status: newStatus }),
      });

      if (!res.ok) throw new Error(`Status update failed: ${res.statusText}`);
      const updated: { status?: ReportStatus; reportNumber?: string } = await res.json();
      setStatus(updated.status ?? newStatus);
      setReportNumber(updated.reportNumber || reportNumber); // capture when backend assigns it

      alert(`✅ Status changed to ${newStatus}`);
    } catch (err: any) {
      console.error(err);
      alert("❌ Error changing status: " + err.message);
    }
  };

  function markDirty() {
    if (!isDirty) setIsDirty(true);
  }

  function formatDateForInput(value: string | null) {
    if (!value) return "";
    // Convert ISO to yyyy-MM-dd
    return new Date(value).toISOString().split("T")[0];
  }




  // Block tab close / refresh
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

  // Block in-app navigation
  useConfirmOnLeave(isDirty);

  // // For in-app navigation (react-router)
  // useBeforeUnload(isDirty, (event) => {
  //   event.preventDefault();
  // });


  const handleClose = () => {
    // Your useBlocker(isDirty) hook will intercept this navigation if there are unsaved changes.
    if (onClose) onClose();
    else navigate(-1);
  };






  return (
    <>
      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
        <PrintStyles />

        {/* Header + print controls */}
        <div className="no-print mb-4 flex justify-end gap-2">
          <button
            className="px-3 py-1 rounded-md border bg-gray-600 text-white"
            onClick={handleClose}
          >
            Close
          </button>
          {/* <button
            className="px-3 py-1 rounded-md border"
            onClick={() => window.print()}
            disabled={role === "SYSTEMADMIN"}
          >
            Print
          </button> */}
          <button
            className="px-3 py-1 rounded-md border bg-blue-600 text-white"
            onClick={handleSave}
            disabled={role === "SYSTEMADMIN"}
          >
            {reportId ? "Update Report" : "Save Report"}
          </button>
        </div>


        {/* Letterhead */}
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
            56 PARK AVENUE, LYNDHURST, NJ 07071 <br></br>
            Tel: (201) 883 1222 • Fax: (201) 883 0449
          </div>
          <div>
            <div className="text-[12px]">
              Email: <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
            </div>
            {/* <div className="font-medium">Report No: {report.fullNumber}</div> */}
          </div>
          {/* <div
            className="text-[18px] font-bold mt-1"
            style={{ textDecoration: "underline" }}
          >
            Report
          </div> */}
          {/* Report title + number */}
          <div className="mt-1 grid grid-cols-3 items-center">
            <div /> {/* left spacer */}
            <div className="text-[18px] font-bold text-center underline">Report</div>
            <div className="text-right text-[12px] font-bold font-medium">
              {reportNumber ? <> {reportNumber}</> : null}
            </div>
          </div>

        </div>

        {/* Top meta block */}
        <div className="w-full border border-black text-[15px]">
          {/* CLIENT / DATE SENT */}
          <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">CLIENT:</div>
              {lock("client") ? (
                <div className="flex-1  min-h-[14px]">{client}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    markDirty();
                  }}
                  disabled={role === "CLIENT"}
                />
              )}
            </div>
            {/* <div id="f-dateSent" className="px-2 flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>
               <FieldError name="dateSent"  errors={errors}/>
              {lock("dateSent") || role === "CLIENT" ? (
                <div className="flex-1 min-h-[14px]">{formatDateForInput(dateSent)}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  type="date"
                  value={formatDateForInput(dateSent)}
                  onChange={(e) => {
                    setDateSent(e.target.value);
                    markDirty();
                  }}
                />
              )}
            </div> */}

            <div id="f-dateSent" className="px-2 flex items-center gap-1 relative">
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>

              {/* tiny floating badge; does not affect layout */}
              <FieldErrorBadge name="dateSent" errors={errors} />

              {lock("dateSent") ? (
                <div className="flex-1 min-h-[14px]">{formatDateForInput(dateSent)}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.dateSent ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    }`}
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

          {/* TYPE OF TEST / SAMPLE TYPE / FORMULA # */}
          <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
            <div id="f-typeOfTest" className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>
              {/* tiny floating badge; does not affect layout */}
              <FieldErrorBadge name="typeOfTest" errors={errors} />
              {lock("typeOfTest") ? (
                <div className="flex-1  min-h-[14px]">{typeOfTest}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.typeOfTest ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    }`}
                  value={typeOfTest}
                  onChange={(e) => { setTypeOfTest(e.target.value); clearError("typeOfTest"); markDirty(); }}
                  aria-invalid={!!errors.typeOfTest}
                />
              )}
            </div>
            <div id="f-sampleType" className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>
              <FieldErrorBadge name="sampleType" errors={errors} />
              {lock("sampleType") ? (
                <div className="flex-1  min-h-[14px]">{sampleType}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.sampleType ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  value={sampleType}
                  onChange={(e) => { setSampleType(e.target.value); markDirty(); clearError("sampleType"); }}
                  aria-invalid={!!errors.sampleType}
                />
              )}
            </div>
            <div id="f-formulaNo" className="px-2 flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">FORMULA #:</div>
              <FieldErrorBadge name="formulaNo" errors={errors} />
              {lock("formulaNo") ? (
                <div className="flex-1 min-h-[14px]">{formulaNo}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.formulaNo ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  value={formulaNo}
                  onChange={(e) => { setFormulaNo(e.target.value); clearError("formulaNo"); markDirty(); }}
                  aria-invalid={!!errors.formulaNo}
                />
              )}
            </div>
          </div>

          {/* DESCRIPTION (full row) */}
          <div id="f-description" className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug relative">
            <div className="w-28 font-medium">DESCRIPTION:</div>
            <FieldErrorBadge name="description" errors={errors} />
            {lock("description") ? (
              <div className="flex-1  min-h-[14px]">{description}</div>
            ) : (
              <input
                className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.description ?
                  "border-red-500 ring-1 ring-red-500" : "border-black/70"
                  } `}
                value={description}
                onChange={(e) => { setDescription(e.target.value); markDirty(); clearError("description"); }}
                aria-invalid={!!errors.description}
              />
            )}
          </div>

          {/* LOT # / MANUFACTURE DATE */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div id="f-lotNo" className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">LOT #:</div>
              <FieldErrorBadge name="lotNo" errors={errors} />
              {lock("lotNo") ? (
                <div className="flex-1  min-h-[14px]">{lotNo}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.lotNo ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  value={lotNo}
                  onChange={(e) => { setLotNo(e.target.value); markDirty(); clearError("lotNo"); }}
                  aria-invalid={!!errors.lotNo}
                />
              )}
            </div>
            <div id="f-manufactureDate" className="px-2 flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">
                MANUFACTURE DATE:
              </div>
              <FieldErrorBadge name="manufactureDate" errors={errors} />
              {lock("manufactureDate") ? (
                <div className="flex-1  min-h-[14px]">{formatDateForInput(manufactureDate)}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.manufactureDate ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  type="date"
                  value={formatDateForInput(manufactureDate)}
                  onChange={(e) => { setManufactureDate(e.target.value); markDirty(); clearError("manufactureDate"); }}
                  aria-invalid={!!errors.manufactureDate}
                />
              )}
            </div>
          </div>

          {/* TEST SOP # / DATE TESTED */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div id="f-testSopNo" className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">TEST SOP #:</div>
              <FieldErrorBadge name="testSopNo" errors={errors} />
              {lock("testSopNo") ? (
                <div className="flex-1  min-h-[14px]">{testSopNo}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug  border ${errors.testSopNo ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  value={testSopNo}
                  onChange={(e) => { setTestSopNo(e.target.value); clearError("testSopNo"); markDirty(); }}
                  aria-invalid={!!errors.testSopNo}
                />
              )}
            </div>
            <div id="f-dateTested" className="px-2 flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">DATE TESTED:</div>
              <FieldErrorBadge name="dateTested" errors={errors} />
              {lock("dateTested") ? (
                <div className="flex-1  min-h-[14px]">{formatDateForInput(dateTested)}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.dateTested ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  type="date"
                  value={formatDateForInput(dateTested)}
                  onChange={(e) => { setDateTested(e.target.value); clearError("dateTested"); markDirty(); }}
                  aria-invalid={!!errors.dateTested}
                />
              )}
            </div>
          </div>

          {/* PRELIMINARY RESULTS / PRELIMINARY RESULTS DATE */}
          <div className="grid grid-cols-[45%_55%] border-b border-black text-[12px] leading-snug">
            <div id="f-preliminaryResults" className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium">PRELIMINARY RESULTS:</div>
              <FieldErrorBadge name="preliminaryResults" errors={errors} />
              {lock("preliminaryResults") ? (
                <div className="flex-1  min-h-[14px]">{preliminaryResults}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.preliminaryResults ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  value={preliminaryResults}
                  onChange={(e) => { setPreliminaryResults(e.target.value); clearError("preliminaryResults"); markDirty(); }}
                  aria-invalid={!!errors.preliminaryResults}
                />
              )}
            </div>
            <div id="f-preliminaryResultsDate" className="px-2 flex items-center gap-1 relative">
              <div className="font-medium">PRELIMINARY RESULTS DATE:</div>
              <FieldErrorBadge name="preliminaryResultsDate" errors={errors} />
              {lock("preliminaryResultsDate") ? (
                <div className="flex-1  min-h-[14px]">{formatDateForInput(preliminaryResultsDate)}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.preliminaryResultsDate ?
                    "border-red-500 ring-1 ring-red-500" : "border-black/70"
                    } `}
                  type="date"
                  value={formatDateForInput(preliminaryResultsDate)}
                  onChange={(e) => { setPreliminaryResultsDate(e.target.value); clearError("preliminaryResultsDate"); markDirty(); }}
                  aria-invalid={!!errors.preliminaryResultsDate}
                />
              )}
            </div>
          </div>

          {/* DATE COMPLETED (full row, label + input) */}
          <div id="f-dateCompleted" className=" flex items-center gap-2 px-2 text-[12px] leading-snug relative">
            <div className="font-medium whitespace-nowrap">DATE COMPLETED:</div>
            <FieldErrorBadge name="dateCompleted" errors={errors} />
            {lock("dateCompleted") ? (
              <div className=" min-h-[14px] flex-1">{formatDateForInput(dateCompleted)}</div>
            ) : (
              <input
                className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${errors.dateCompleted ?
                  "border-red-500 ring-1 ring-red-500" : "border-black/70"
                  } `}
                type="date"
                value={formatDateForInput(dateCompleted)}
                onChange={(e) => { setDateCompleted(e.target.value); clearError("dateCompleted"); markDirty(); }}
                aria-invalid={!!errors.dateCompleted}
              />
            )}
          </div>
        </div>

        <div className="p-2 font-bold">TBC / TFC RESULTS:</div>



        {/* TBC/TFC table */}
        <div className="mt-2 border border-black">
          <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] text-center items-center font-semibold border-b border-black">
            <div className="p-2  border-r border-black">TYPE OF TEST</div>
            <div className="p-2 border-r border-black">DILUTION</div>
            <div className="p-2 border-r border-black">GRAM STAIN</div>
            <div className="p-2 border-r border-black">RESULT</div>
            <div className="p-2">SPECIFICATION</div>
          </div>

          {/* Row 1: Total Bacterial Count */}
          <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] border-b border-black">
            <div className="py-1 px-2 font-bold border-r border-black">
              Total Bacterial Count:
            </div>

            {/* DILUTION (static) */}
            <div className="py-1 px-2 border-r border-black">
              <div className="py-1 px-2 text-center"> x 10^0</div>
            </div>

            {/* GRAM STAIN */}
            <div id="f-tbc_gram" className="py-1 px-2 border-r border-black flex relative">
              <FieldErrorBadge name="tbc_gram" errors={errors} />
              <input
                className={`w-full input-editable px-1 border ${!lock("tbc_gram") && errors.tbc_gram ? "border-red-500 ring-1 ring-red-500" : "border-black/70"}`}
                value={tbc_gram}
                onChange={(e) => {
                  set_tbc_gram(e.target.value);
                  clearError("tbc_gram");
                }}
                readOnly={lock("tbc_gram")}
                aria-invalid={!!errors.tbc_gram}
              />
            </div>

            {/* RESULT */}
            <div id="f-tbc_result" className="py-1 px-2 border-r border-black flex relative">
              <FieldErrorBadge name="tbc_result" errors={errors} />
              <input
                className={`w-1/2 input-editable px-1 border ${!lock("tbc_result") && errors.tbc_result ? "border-red-500 ring-1 ring-red-500" : "border-black/70"}`}
                value={tbc_result}
                onChange={(e) => {
                  set_tbc_result(e.target.value);
                  clearError("tbc_result");
                }}
                readOnly={lock("tbc_result")}
                placeholder="CFU/ml"
                aria-invalid={!!errors.tbc_result}
              />
              <div className="py-1 px-2 text-center">CFU/ml</div>
            </div>

            {/* SPECIFICATION */}
            <div id="f-tbc_spec" className="py-1 px-2 flex relative">
              <FieldErrorBadge name="tbc_spec" errors={errors} />
              <input
                className={`w-full input-editable px-1 border ${!lock("tbc_spec") && errors.tbc_spec ? "border-red-500 ring-1 ring-red-500" : "border-black/70"}`}
                value={tbc_spec}
                onChange={(e) => {
                  set_tbc_spec(e.target.value);
                  clearError("tbc_spec");
                }}
                readOnly={lock("tbc_spec")}
                aria-invalid={!!errors.tbc_spec}
              />
            </div>
          </div>

          {/* Row 2: Total Mold & Yeast Count */}
          <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px]">
            <div className="py-1 px-2 font-bold border-r border-black">
              Total Mold & Yeast Count:
            </div>

            {/* DILUTION (static) */}
            <div className="py-1 px-2 border-r border-black">
              <div className="py-1 px-2 text-center"> x 10^0</div>
            </div>

            {/* GRAM STAIN */}
            <div id="f-tmy_gram" className="py-1 px-2 border-r border-black flex relative">
              <FieldErrorBadge name="tmy_gram" errors={errors} />
              <input
                className={`w-full input-editable px-1 border ${!lock("tmy_gram") && errors.tmy_gram ? "border-red-500 ring-1 ring-red-500" : "border-black/70"}`}
                value={tmy_gram}
                onChange={(e) => {
                  set_tmy_gram(e.target.value);
                  clearError("tmy_gram");
                }}
                readOnly={lock("tmy_gram")}
                aria-invalid={!!errors.tmy_gram}
              />
            </div>

            {/* RESULT */}
            <div id="f-tmy_result" className="py-1 px-2 border-r border-black flex relative">
              <FieldErrorBadge name="tmy_result" errors={errors} />
              <input
                className={`w-1/2 input-editable px-1 border ${!lock("tmy_result") && errors.tmy_result ? "border-red-500 ring-1 ring-red-500" : "border-black/70"}`}
                value={tmy_result}
                onChange={(e) => {
                  set_tmy_result(e.target.value);
                  clearError("tmy_result");
                }}
                readOnly={lock("tmy_result")}
                placeholder="CFU/ml"
                aria-invalid={!!errors.tmy_result}
              />
              <div className="py-1 px-2 text-center">CFU/ml</div>
            </div>

            {/* SPECIFICATION */}
            <div id="f-tmy_spec" className="py-1 px-2 flex relative">
              <FieldErrorBadge name="tmy_spec" errors={errors} />
              <input
                className={`w-full input-editable px-1 border ${!lock("tmy_spec") && errors.tmy_spec ? "border-red-500 ring-1 ring-red-500" : "border-black/70"}`}
                value={tmy_spec}
                onChange={(e) => {
                  set_tmy_spec(e.target.value);
                  clearError("tmy_spec");
                }}
                readOnly={lock("tmy_spec")}
                aria-invalid={!!errors.tmy_spec}
              />
            </div>
          </div>
        </div>



        <div className="p-2 font-bold">
          PATHOGEN SCREENING (Please check the organism to be tested)
        </div>

        {/* Pathogen screening */}
        {/* Pathogen screening */}
        <div
          id="f-pathogens"
          className={`mt-3 relative border ${pathogensTableError} ? "border-red-500 ring-1 ring-red-500" : "border-black"}`}
          aria-invalid={!!errors.pathogens}
        >
          {/* floating badge; doesn't affect layout */}
          {/* <FieldErrorBadge name="pathogens" errors={errors} /> */}

          {/* Header */}
          <div className="grid grid-cols-[25%_55%_20%] text-[12px] text-center font-semibold border-b border-black">
            <div className="p-2 border-r border-black"></div>
            <div className="p-2 border-r border-black">RESULT</div>
            <div className="p-2">SPECIFICATION</div>
          </div>

          {pathogensTableError && (
            <div className="px-2 py-1 text-[11px] text-red-600">{pathogensTableError}</div>
          )}

          {/* Rows */}



          {pathogens.map((p, idx) => {
            const rowErr = pathogenRowErrors[idx]?.result;
            return (
              <div
                key={p.key}
                className={`grid grid-cols-[25%_55%_20%] text-[11px] leading-tight border-b last:border-b-0 border-black ${rowErr ? "ring-1 ring-red-500" : ""
                  }`}
              >
                {/* First column: checkbox + label (unchanged except using setPathogenChecked) */}
                <div className="py-[2px] px-2 border-r border-black flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="thick-box"
                    checked={!!p.checked}
                    onChange={(e) => setPathogenChecked(idx, e.target.checked)}
                    disabled={organismDisabled()
                    }
                  />
                  <span className="font-bold">{p.label}</span>
                  {p.key === "OTHER" && (
                    <input className="input-editable leading-tight" placeholder="(specify)" readOnly />
                  )}
                </div>

                {/* Second column: Result + per-row error */}
                <div className="py-[2px] px-2 border-r border-black flex items-center gap-2 whitespace-nowrap">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="thick-box"
                      checked={p.result === "Absent"}
                      onChange={() => setPathogenResult(idx, "Absent")}
                      onDoubleClick={() => clearPathogenResult(idx)}
                      title="Click to set Absent. Double-click to clear."
                      disabled={resultDisabled(p)}
                    // disabled={
                    //   role === "ADMIN" || role === "FRONTDESK" || role === "CLIENT" ||
                    //   role === "QA" || role === "SYSTEMADMIN"
                    // }
                    />
                    Absent
                  </label>

                  <span className="mx-1">/</span>

                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="thick-box"
                      checked={p.result === "Present"}
                      onChange={() => setPathogenResult(idx, "Present")}
                      onDoubleClick={() => clearPathogenResult(idx)}
                      disabled={resultDisabled(p)}
                      title={resultDisabled(p) ? "Check the organism first" : "Click to set Present. Double-click to clear."}
                    // disabled={
                    //   role === "ADMIN" || role === "FRONTDESK" || role === "CLIENT" ||
                    //   role === "QA" || role === "SYSTEMADMIN"
                    // }
                    />
                    Present
                  </label>

                  {/* inline note, no huge gap */}
                  <span className="ml-2">in 11g of sample</span>

                  {/* optional row error */}
                  {pathogenRowErrors[idx]?.result && (
                    <span className="ml-2 text-[11px] text-red-600">{pathogenRowErrors[idx].result}</span>
                  )}
                </div>


                {/* Third column (spec) */}
                {/* Third column (spec) */}
                {/* Third column (spec) */}
                <div className={`py-[2px] px-2 text-center ${pathogenRowErrors[idx]?.spec ? "ring-1 ring-red-500" : ""}`}>
                  <select
                    className={`input-editable border text-[11px] px-1 py-[1px] ${pathogenRowErrors[idx]?.spec ? "border-red-500" : "border-black/70"
                      }`}
                    value={p.spec}
                    onChange={(e) => setPathogenSpec(idx, e.target.value as PathogenSpec)}
                    disabled={!p.checked || lock("pathogens") || role !== "CLIENT"}
                    aria-invalid={!!pathogenRowErrors[idx]?.spec}
                  >
                    <option value="">{/* placeholder */}-- Select --</option>
                    <option value="Absent">Absent</option>
                    <option value="Present">Present</option>
                  </select>
                  {pathogenRowErrors[idx]?.spec && (
                    <div className="mt-1 text-[11px] text-red-600">{pathogenRowErrors[idx]?.spec}</div>
                  )}
                </div>


              </div>
            );
          })}


        </div>


        {/* Legends / Comments */}
        <div className="mt-2 text-[11px]">
          <div
            className=" font-bold border-black p-2"
            style={{ textDecoration: "underline" }}
          >
            DENOTES: NA (Not Applicable) / N.G. (No Growth) / GM.(+)B Gram (+)
            Bacilli / GM.(+)C Gram (+) Cocci / GM.NEG Gram Negative / NT (Not
            Tested) / TNTC (Too Numerous To Count)
          </div>
        </div>

        {/* Comments + Signatures */}
        {/* Comments + Signatures */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div id="f-comments" className="p2 col-span-2 flex relative">
            <div className="mb-1 font-medium">Comments:</div>
            <FieldErrorBadge name="testedBy" errors={errors} />
            <input
              className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${errors.testedBy ? "border-b-red-500" : "border-b-black/70"
                }`}
              value={comments}
              onChange={(e) => { setComments(e.target.value); clearError("comments"); markDirty(); }}
              aria-invalid={!!errors.comments}
              readOnly={lock("comments")}
              placeholder="Comments"
            />
          </div>

          {/* TESTED BY */}
          <div id="f-testedBy" className="p-2 relative">
            <div className="font-medium mb-2 flex items-center gap-2">
              TESTED BY:
              {/* floating badge; doesn't affect layout */}
              <FieldErrorBadge name="testedBy" errors={errors} />
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${errors.testedBy ? "border-b-red-500" : "border-b-black/70"
                  }`}
                value={(testedBy).toUpperCase()}
                onChange={(e) => {
                  setTestedBy(e.target.value);
                  clearError("testedBy");
                  markDirty();
                }}
                readOnly={lock("testedBy")}
                placeholder="Name"
                aria-invalid={!!errors.testedBy}
              />
            </div>

            <div id="f-testedDate" className="font-medium mt-2 flex items-center gap-2 relative">
              DATE:
              <FieldErrorBadge name="testedDate" errors={errors} />
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${errors.testedDate ? "border-b-red-500" : "border-b-black/70"
                  }`}
                type="date"
                value={formatDateForInput(testedDate)}
                onChange={(e) => {
                  setTestedDate(e.target.value);
                  clearError("testedDate");
                }}
                readOnly={lock("testedDate")}
                placeholder="MM/DD/YYYY"
                aria-invalid={!!errors.testedDate}
              />
            </div>
          </div>

          {/* REVIEWED BY */}
          <div id="f-reviewedBy" className="p-2 relative">
            <div className="font-medium mb-2 flex items-center gap-2">
              REVIEWED BY:
              <FieldErrorBadge name="reviewedBy" errors={errors} />
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${errors.reviewedBy ? "border-b-red-500" : "border-b-black/70"
                  }`}
                value={
                  (reviewedBy).toUpperCase()}
                onChange={(e) => {
                  setReviewedBy(e.target.value);
                  clearError("reviewedBy");
                }}
                readOnly={lock("reviewedBy")}
                placeholder="Name"
                aria-invalid={!!errors.reviewedBy}
              />
            </div>

            <div id="f-reviewedDate" className="font-medium mt-2 flex items-center gap-2 relative">
              DATE:
              <FieldErrorBadge name="reviewedDate" errors={errors} />
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${errors.reviewedDate ? "border-b-red-500" : "border-b-black/70"
                  }`}
                type="date"
                value={formatDateForInput(reviewedDate)}
                onChange={(e) => {
                  setReviewedDate(e.target.value);
                  clearError("reviewedDate");
                }}
                readOnly={lock("reviewedDate")}
                placeholder="MM/DD/YYYY"
                aria-invalid={!!errors.reviewedDate}
              />
            </div>
          </div>
        </div>

      </div>
      {/* Role-based actions */}
      {/* Role-based actions OUTSIDE the report */}
      {/* Role-based actions OUTSIDE the report */}
      {/* {STATUS_TRANSITIONS[status as ReportStatus]?.next.map(
        (targetStatus: ReportStatus) => {
          if (
            STATUS_TRANSITIONS[status as ReportStatus].canSet.includes(role!) &&
            statusButtons[targetStatus]
          ) {
            const { label, color } = statusButtons[targetStatus];
            return (
              <button
                key={targetStatus}
                className={`px-4 py-2 rounded-md border text-white ${color}`}
                onClick={() => handleStatusChange(targetStatus)}
                // 👇 disable submit until report is saved
                disabled={isDirty || !reportId}
              >
                {label}
              </button>

            );
          }
          return null;
        }
      )} */}
      {/* Actions row: submit/reject on left, close on right */}
      <div className="no-print mt-4 flex items-center justify-between">
        {/* Left: status action buttons */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TRANSITIONS[status as ReportStatus]?.next.map(
            (targetStatus: ReportStatus) => {
              if (
                STATUS_TRANSITIONS[status as ReportStatus].canSet.includes(role!) &&
                statusButtons[targetStatus]
              ) {
                const { label, color } = statusButtons[targetStatus];
                return (
                  <button
                    key={targetStatus}
                    className={`px-4 py-2 rounded-md border text-white ${color}`}
                    onClick={() => handleStatusChange(targetStatus)}
                    // disabled={isDirty || !reportId}
                    disabled={role === "SYSTEMADMIN"}
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


