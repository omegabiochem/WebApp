import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useBlocker } from "react-router-dom";

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
    next: ["TESTING_ON_HOLD", "TESTING_REJECTED", "UNDER_QA_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: ['MICRO'],
  },
  TESTING_ON_HOLD: {
    canSet: ["MICRO"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["MICRO"],
    canEdit: [],
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
    canEdit: [],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_QA_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: [],
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
  FRONTDESK_REJECTED: { label: "Reject", color: "bg-red-600" },
  UNDER_TESTING_REVIEW: { label: "Approve", color: "bg-green-600" },
  TESTING_ON_HOLD: { label: "Hold", color: "bg-yellow-500" },
  TESTING_REJECTED: { label: "Reject", color: "bg-red-600" },
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
      // "tbc_dilution",
      "tbc_gram",
      "tbc_result",
      "tbc_spec",
      // "tmy_dilution",
      "tmy_gram",
      "tmy_result",
      "tmy_spec",
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

// Simple input wrapper that locks by role
function Field({
  label,
  value,
  onChange,
  readOnly,
  className = "",
  inputClass = "",
  placeholder = " ", // placeholder space keeps boxes visible when empty
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  className?: string;
  inputClass?: string;
  placeholder?: string;
}) {
  return (
    <div className={`flex gap-2 items-center ${className}`}>
      <div className="w-48 shrink-0 text-[12px] font-medium">{label}</div>
      <input
        className={`flex-1 border border-black/70 px-2 py-1 text-[12px] leading-tight ${inputClass}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
      />
    </div>
  );
}

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

export default function MicroMixReportForm({ report }: { report?: any }) {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  // const initialData = JSON.stringify(report || {});
  const [isDirty, setIsDirty] = useState(false);

  const [status, setStatus] = useState(report?.status || "DRAFT");
  // inside MicroMixReportForm
  const [reportId, setReportId] = useState(report?.id || null);

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

  // Pathogens (Absent/Present + sample grams)
  type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    // grams: string;
    result: "Absent" | "Present" | "";
    spec: "Absent" | "";
  };
  const pathogenDefaults: PathRow[] = useMemo(
    () => [
      {
        checked: false,
        key: "E_COLI",
        label: "E.coli",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "P_AER",
        label: "P.aeruginosa",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "S_AUR",
        label: "S.aureus",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "SALM",
        label: "Salmonella",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "CLOSTRIDIA",
        label: "Clostridia species",
        grams: "3g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "C_ALB",
        label: "C.albicans",
        ////grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "B_CEP",
        label: "B.cepacia",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "OTHER",
        label: "Other",
        grams: "",
        result: "",
        spec: "Absent",
      },
    ],
    []
  );
  // const [pathogens, setPathogens] = useState<PathRow[]>(pathogenDefaults);
  const [pathogens, setPathogens] = useState<PathRow[]>(
    report?.pathogens || pathogenDefaults
  );

  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");

  // const lock = (f: string) => !canEdit(role, f);
  // use:
  const lock = (f: string) => !canEdit(role, f, status as ReportStatus);

  // ----------- Save handler -----------

  const handleSave = async () => {
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
        "tbc_spec",
        "tmy_dilution",
        "tmy_gram",
        "tmy_result",
        "tmy_spec",
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
          body: JSON.stringify(payload),
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
      alert("✅ Report saved as draft");
    } catch (err: any) {
      console.error(err);
      alert("❌ Error saving draft: " + err.message);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const token = localStorage.getItem("token");

    try {
      const API_BASE = "http://localhost:3000";

      // if report not saved → save first
      if (!reportId) {
        await handleSave();
      }
      console.log(reportId);

      const url = `${API_BASE}/reports/micro-mix/${reportId}/status`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error(`Status update failed: ${res.statusText}`);
      setStatus(newStatus);
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

  return (
    <>
      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
        <PrintStyles />

        {/* Header + print controls */}
        <div className="no-print mb-4 flex justify-end gap-2">
          <button
            className="px-3 py-1 rounded-md border"
            onClick={() => window.print()}
            disabled={role === "SYSTEMADMIN"}
          >
            Print
          </button>
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
          <div
            className="text-[18px] font-bold mt-1"
            style={{ textDecoration: "underline" }}
          >
            Report
          </div>
        </div>

        {/* Top meta block */}
        <div className="w-full border border-black text-[15px]">
          {/* CLIENT / DATE SENT */}
          <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">CLIENT:</div>
              {lock("client") || role === "CLIENT" ? (
                <div className="flex-1  min-h-[14px]">{client}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    markDirty();
                  }}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>
              {lock("dateSent") ? (
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
            </div>
          </div>

          {/* TYPE OF TEST / SAMPLE TYPE / FORMULA # */}
          <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>
              {lock("typeOfTest") ? (
                <div className="flex-1  min-h-[14px]">{typeOfTest}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={typeOfTest}
                  onChange={(e) => setTypeOfTest(e.target.value)}
                />
              )}
            </div>
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>
              {lock("sampleType") ? (
                <div className="flex-1  min-h-[14px]">{sampleType}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={sampleType}
                  onChange={(e) => setSampleType(e.target.value)}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="font-medium whitespace-nowrap">FORMULA #:</div>
              {lock("formulaNo") ? (
                <div className="flex-1 min-h-[14px]">{formulaNo}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={formulaNo}
                  onChange={(e) => setFormulaNo(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* DESCRIPTION (full row) */}
          <div className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug">
            <div className="w-28 font-medium">DESCRIPTION:</div>
            {lock("description") ? (
              <div className="flex-1  min-h-[14px]">{description}</div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </div>

          {/* LOT # / MANUFACTURE DATE */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="font-medium whitespace-nowrap">LOT #:</div>
              {lock("lotNo") ? (
                <div className="flex-1  min-h-[14px]">{lotNo}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={lotNo}
                  onChange={(e) => setLotNo(e.target.value)}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="font-medium whitespace-nowrap">
                MANUFACTURE DATE:
              </div>
              {lock("manufactureDate") ? (
                <div className="flex-1  min-h-[14px]">{formatDateForInput(manufactureDate)}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  type="date"
                  value={formatDateForInput(manufactureDate)}
                  onChange={(e) => setManufactureDate(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* TEST SOP # / DATE TESTED */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="font-medium whitespace-nowrap">TEST SOP #:</div>
              {lock("testSopNo") ? (
                <div className="flex-1  min-h-[14px]">{testSopNo}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={testSopNo}
                  onChange={(e) => setTestSopNo(e.target.value)}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="font-medium whitespace-nowrap">DATE TESTED:</div>
              {lock("dateTested") ? (
                <div className="flex-1  min-h-[14px]">{formatDateForInput(dateTested)}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  type="date"
                  value={formatDateForInput(dateTested)}
                  onChange={(e) => setDateTested(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* PRELIMINARY RESULTS / PRELIMINARY RESULTS DATE */}
          <div className="grid grid-cols-[45%_55%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="font-medium">PRELIMINARY RESULTS:</div>
              {lock("preliminaryResults") ? (
                <div className="flex-1  min-h-[14px]">{preliminaryResults}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={preliminaryResults}
                  onChange={(e) => setPreliminaryResults(e.target.value)}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="font-medium">PRELIMINARY RESULTS DATE:</div>
              {lock("preliminaryResultsDate") ? (
                <div className="flex-1  min-h-[14px]">{preliminaryResultsDate}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  type="date"
                  value={formatDateForInput(preliminaryResultsDate)}
                  onChange={(e) => setPreliminaryResultsDate(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* DATE COMPLETED (full row, label + input) */}
          <div className=" flex items-center gap-2 px-2 text-[12px] leading-snug">
            <div className="font-medium whitespace-nowrap">DATE COMPLETED:</div>
            {lock("dateCompleted") ? (
              <div className=" min-h-[14px] flex-1">{formatDateForInput(dateCompleted)}</div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                type="date"
                value={formatDateForInput(dateCompleted)}
                onChange={(e) => setDateCompleted(e.target.value)}
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
            <div className=" py-1 px-2 font-bold border-r border-black">
              Total Bacterial Count:
            </div>
            <div className="py-1 px-2 border-r border-black">
              <div className="py-1 px-2 text-center"> x 10^0</div>
              {/* <input
              className="w-full border border-black/70 px-1"
              value={tbc_dilution}
              onChange={(e) => set_tbc_dilution(e.target.value)}
              readOnly={lock("tbc_dilution")}
            /> */}
            </div>
            <div className="py-1 px-2 border-r border-black flex">
              <input
                className="w-full input-editable  px-1"
                value={tbc_gram}
                onChange={(e) => set_tbc_gram(e.target.value)}
                readOnly={lock("tbc_gram")}
              />
            </div>
            <div className="py-1 px-2 border-r border-black flex">
              <input
                className="w-1/2 input-editable  px-1"
                value={tbc_result}
                onChange={(e) => set_tbc_result(e.target.value)}
                readOnly={lock("tbc_result")}
                placeholder="CFU/ml"
              />
              <div className="py-1 px-2 text-center">CFU/ml</div>
            </div>
            <div className="py-1 px-2 flex">
              <input
                className="w-full input-editable  px-1"
                value={tbc_spec}
                onChange={(e) => set_tbc_spec(e.target.value)}
                readOnly={lock("tbc_spec")}
              />
            </div>
          </div>
          {/* Row 2: Total Mold & Yeast Count */}
          <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px]">
            <div className="py-1 px-2 font-bold border-r border-black">
              Total Mold & Yeast Count:
            </div>
            <div className="py-1 px-2 border-r border-black">
              <div className="py-1 px-2 text-center"> x 10^0</div>
              {/* <input
              className="w-full border border-black/70 px-1"
              value={tmy_dilution}
              onChange={(e) => set_tmy_dilution(e.target.value)}
              readOnly={lock("tmy_dilution")}
            /> */}
            </div>
            <div className="py-1 px-2 border-r border-black flex">
              <input
                className="w-full input-editable  px-1 "
                value={tmy_gram}
                onChange={(e) => set_tmy_gram(e.target.value)}
                readOnly={lock("tmy_gram")}
              />
            </div>
            <div className="py-1 px-2 border-r border-black flex">
              <input
                className="w-1/2 input-editable  px-1"
                value={tmy_result}
                onChange={(e) => set_tmy_result(e.target.value)}
                readOnly={lock("tmy_result")}
                placeholder="CFU/ml"
              />
              <div className="py-1 px-2 text-center">CFU/ml</div>
            </div>
            <div className="py-1 px-2 flex">
              <input
                className="w-full input-editable  px-1"
                value={tmy_spec}
                onChange={(e) => set_tmy_spec(e.target.value)}
                readOnly={lock("tmy_spec")}
              />
            </div>
          </div>
        </div>

        <div className="p-2 font-bold">
          PATHOGEN SCREENING (Please check the organism to be tested)
        </div>

        {/* Pathogen screening */}
        <div className="mt-3 border border-black">
          {/* Header */}
          <div className="grid grid-cols-[25%_55%_20%] text-[12px] text-center font-semibold border-b border-black">
            <div className="p-2 border-r border-black"></div>
            <div className="p-2 border-r border-black">RESULT</div>
            <div className="p-2">SPECIFICATION</div>
          </div>

          {/* Rows */}
          {pathogens.map((p, idx) => (
            <div
              key={p.key}
              className="grid grid-cols-[25%_55%_20%] text-[11px] leading-tight border-b last:border-b-0 border-black"
            >
              {/* First column */}
              <div className="py-[2px] px-2 border-r border-black flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded-full border-2 border-black accent-black focus:ring-0 focus:outline-none"
                  checked={p.checked || false}
                  onChange={(e) => {
                    const copy = [...pathogens];
                    copy[idx] = { ...p, checked: e.target.checked };
                    setPathogens(copy);
                  }}
                  // disabled={lock('pathogens')}
                  disabled={
                    role === "ADMIN" ||
                    role === "FRONTDESK" ||
                    role === "MICRO" ||
                    role === "QA" ||
                    role === "SYSTEMADMIN"
                  }
                />
                <span className="font-bold">{p.label}</span>
                {p.key === "OTHER" && (
                  <input
                    className="input-editable leading-tight"
                    placeholder="(specify)"
                    readOnly
                  />
                )}
              </div>

              {/* Second column */}
              <div className="py-[2px] px-2 border-r border-black flex text-center gap-2 items-center">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded-full border-2 border-black accent-black focus:ring-0 focus:outline-none"
                    checked={p.result === "Absent"}
                    onChange={() => {
                      const copy = [...pathogens];
                      copy[idx] = { ...p, result: "Absent" };
                      setPathogens(copy);
                    }}
                    disabled={
                      role === "ADMIN" ||
                      role === "FRONTDESK" ||
                      role === "CLIENT" ||
                      role === "QA" ||
                      role === "SYSTEMADMIN"
                    }
                  />
                  Absent
                </label>
                <span>/</span>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded-full border-2 border-black accent-black focus:ring-0 focus:outline-none"
                    checked={p.result === "Present"}
                    onChange={() => {
                      const copy = [...pathogens];
                      copy[idx] = { ...p, result: "Present" };
                      setPathogens(copy);
                    }}
                    disabled={
                      role === "ADMIN" ||
                      role === "FRONTDESK" ||
                      role === "CLIENT" ||
                      role === "QA" ||
                      role === "SYSTEMADMIN"
                    }
                  />
                  Present
                </label>
                <span className="ml-1">in 11g of sample</span>
              </div>

              {/* Third column */}
              <div className="py-[2px] px-2 text-center">Absent</div>
            </div>
          ))}
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
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div className="p2 col-span-2 flex">
            <div className="mb-1 font-medium">Comments:</div>
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              readOnly={lock("comments")}
              placeholder="Comments"
            />
          </div>

          {/* TESTED BY */}

          <div className="p-2">
            <div className="font-medium mb-2 flex items-center gap-2">
              TESTED BY:
              <input
                className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                value={testedBy}
                onChange={(e) => setTestedBy(e.target.value)}
                readOnly={lock("testedBy")}
                placeholder="Name"
              />
            </div>

            <div className="font-medium mt-2 flex items-center gap-2">
              DATE:
              <input
                className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                type="date"
                value={formatDateForInput(testedDate)}
                onChange={(e) => setTestedDate(e.target.value)}
                readOnly={lock("testedDate")}
                placeholder="MM/DD/YYYY"
              />
            </div>
          </div>

          {/* REVIEWED BY */}
          <div className="p-2">
            <div className="font-medium mb-2 flex items-center gap-2">
              REVIEWED BY:
              <input
                className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                readOnly={lock("reviewedBy")}
                placeholder="Name"
              />
            </div>

            <div className="font-medium mt-2 flex items-center gap-2">
              DATE:
              <input
                className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                type="date"
                value={formatDateForInput(reviewedDate)}
                onChange={(e) => setReviewedDate(e.target.value)}
                readOnly={lock("reviewedDate")}
                placeholder="MM/DD/YYYY"
              />
            </div>
          </div>
        </div>
      </div>
      {/* Role-based actions */}
      {/* Role-based actions OUTSIDE the report */}
      {/* Role-based actions OUTSIDE the report */}
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
                // 👇 disable submit until report is saved
                disabled={isDirty || !reportId}
              >
                {label}
              </button>
            );
          }
          return null;
        }
      )}
    </>
  );
}
