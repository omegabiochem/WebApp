import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useBlocker } from "react-router-dom";
import { api } from "../../lib/api";
import {
  DEFAULT_CHEM_ACTIVES,
  type ChemActiveRow,
} from "../../utils/chemistryReportValidation";
import {
  STATUS_TRANSITIONS,
  type ChemistryReportStatus,
  type Role,
} from "../../utils/chemistryReportFormWorkflow";
import { set } from "zod";
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
    report?.sampleCollected || null
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

  type SavedReport = {
    id: string;
    status: ChemistryReportStatus;
    reportNumber?: number | string;
  };

  // ------------- SAVE -------------
  const handleSave = async (): Promise<SavedReport | null> => {
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
    let id;
    if (!reportId) {
      toast.loading("Saving report...");
      const saved = await handleSave();
      id = saved?.id;
      toast.success("Report saved successfully");
      if (!saved) return;
    }
    try {
      let updated: UpdatedReport;

      updated = await api<UpdatedReport>(`/chemistry-reports/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });

      setStatus(updated.status ?? newStatus);
      setReportNumber(String(updated.reportNumber || reportNumber));
      setIsDirty(false);
      alert("✅ Report status updated to " + newStatus);
    } catch (err: any) {
      console.error(err);
      alert("❌ Error updating report status: " + err.message);
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
              <input
                className="flex-1 border-none  text-[12px]"
                value={client}
                onChange={(e) => {
                  setClient(e.target.value.toUpperCase());
                  markDirty();
                }}
              />
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">DATE SENT :</div>
              <input
                className="flex-1 border-none outline-none text-[12px]"
                type="date"
                value={formatDateForInput(dateSent)}
                onChange={(e) => {
                  setDateSent(e.target.value);
                  markDirty();
                }}
              />
            </div>
          </div>

          {/* SAMPLE DESCRIPTION line */}
          <div className="border-b border-black flex items-center gap-2 px-2">
            <div className="w-40 font-medium">SAMPLE DESCRIPTION :</div>
            <input
              className="flex-1 border-none outline-none text-[12px]"
              value={sampleDescription}
              onChange={(e) => {
                setSampleDescription(e.target.value);
                markDirty();
              }}
            />
          </div>

          {/* TYPE OF TEST / SAMPLE COLLECTED */}
          <div className="grid grid-cols-[47%_53%] border-b border-black text-[11px]">
            <div className="px-2 border-r border-black flex items-center gap-2">
              <span className="font-medium mr-1">TYPE OF TEST :</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={testTypes.includes("ID")}
                  onChange={() => toggleTestType("ID")}
                />
                ID
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={testTypes.includes("PERCENT_ASSAY")}
                  onChange={() => toggleTestType("PERCENT_ASSAY")}
                />
                Percent Assay
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={testTypes.includes("CONTENT_UNIFORMITY")}
                  onChange={() => toggleTestType("CONTENT_UNIFORMITY")}
                />
                Content Uniformity
              </label>
            </div>
            <div className="px-2 flex items-center gap-2">
              <span className="font-medium mr-1">SAMPLE COLLECTED :</span>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="sampleCollected"
                  checked={sampleCollected === "TOP_BEG"}
                  onChange={() => {
                    setSampleCollected("TOP_BEG");
                    markDirty();
                  }}
                />
                Top / Beg
              </label>

              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="sampleCollected"
                  checked={sampleCollected === "MID"}
                  onChange={() => {
                    setSampleCollected("MID");
                    markDirty();
                  }}
                />
                Mid
              </label>

              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="sampleCollected"
                  checked={sampleCollected === "BOTTOM_END"}
                  onChange={() => {
                    setSampleCollected("BOTTOM_END");
                    markDirty();
                  }}
                />
                Bottom / End
              </label>
            </div>
          </div>

          {/* LOT / MFG DATE */}
          <div className="grid grid-cols-[50%_50%] border-b border-black text-[12px]">
            <div className="px-2 border-r border-black flex items-center gap-2">
              <span className="font-medium">LOT / BATCH # :</span>
              <input
                className="flex-1 border-none outline-none"
                value={lotBatchNo}
                onChange={(e) => {
                  setLotBatchNo(e.target.value);
                  markDirty();
                }}
              />
            </div>
            <div className="px-2 flex items-center gap-2">
              <span className="font-medium">MANUFACTURE DATE :</span>
              <input
                className="flex-1 border-none outline-none"
                type="date"
                value={formatDateForInput(manufactureDate)}
                onChange={(e) => {
                  setManufactureDate(e.target.value);
                  markDirty();
                }}
              />
            </div>
          </div>

          {/* FORMULA / SAMPLE SIZE / NUMBER OF ACTIVES */}
          <div className="grid grid-cols-[35%_30%_35%] border-b border-black text-[12px]">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                FORMULA # / ID # :
              </span>
              <input
                className="w-[80px] border-none outline-none shrink-0"
                value={formulaId}
                onChange={(e) => {
                  setFormulaId(e.target.value);
                  markDirty();
                }}
              />
            </div>

            <div className="px-2 border-r border-black flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                SAMPLE SIZE :
              </span>
              <input
                className="w-[80px] border-none outline-none shrink-0"
                value={sampleSize}
                onChange={(e) => {
                  setSampleSize(e.target.value);
                  markDirty();
                }}
              />
            </div>

            <div className="px-2 flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                NUMBER OF ACTIVES :
              </span>
              <input
                className="w-[80px] border-none outline-none shrink-0"
                value={numberOfActives}
                onChange={(e) => {
                  setNumberOfActives(e.target.value);
                  markDirty();
                }}
              />
            </div>
          </div>

          {/* SAMPLE TYPE checkboxes */}
          <div className="border-b border-black px-2 py-1 text-[11px] flex">
            {/* Left label */}
            <span className="font-medium mr-2 whitespace-nowrap">
              SAMPLE TYPE :
            </span>

            {/* Right side: 3 columns, 2 rows */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-1 flex-1">
              {sampleTypeColumns.map((col, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-[2px]">
                  {col.map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-1 whitespace-nowrap"
                    >
                      <input
                        type="checkbox"
                        checked={sampleTypes.includes(key)}
                        onChange={() => toggleSampleType(key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---- ACTIVE TO BE TESTED TABLE ---- */}
        <div className="mt-3 border border-black text-[11px]">
          <div className="grid grid-cols-[25%_15%_23%_20%_17%] font-semibold text-center border-b border-black">
            <div className="p-1 border-r border-black">ACTIVE TO BE TESTED</div>
            <div className="p-1 border-r border-black">SOP #</div>
            <div className="p-1 border-r border-black">FORMULA CONTENT</div>
            <div className="p-1 border-r border-black">RESULTS</div>
            <div className="p-1">DATE TESTED / INITIAL</div>
          </div>

          {actives.map((row, idx) => (
            <div
              key={row.key}
              className="grid grid-cols-[25%_15%_23%_20%_17%] border-b last:border-b-0 border-black"
            >
              {/* active name + checkbox */}
              <div className="flex items-center gap-2 border-r border-black px-1 ">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={(e) =>
                    updateActive(idx, { checked: e.target.checked })
                  }
                />
                <span>{row.label}</span>
              </div>

              {/* SOP # */}
              <div className="border-r border-black px-1 ">
                <input
                  className="w-full border-none outline-none text-[11px]"
                  value={row.sopNo}
                  onChange={(e) => updateActive(idx, { sopNo: e.target.value })}
                />
              </div>

              {/* formula content % */}
              <div className="border-r border-black px-1  flex items-center gap-1">
                <input
                  className="flex-1 border-none outline-none text-[11px]"
                  value={row.formulaContent}
                  onChange={(e) =>
                    updateActive(idx, { formulaContent: e.target.value })
                  }
                />
                <span>%</span>
              </div>

              {/* result % */}
              <div className="border-r border-black px-1  flex items-center gap-1">
                <input
                  className="flex-1 border-none outline-none text-[11px]"
                  value={row.result}
                  onChange={(e) =>
                    updateActive(idx, { result: e.target.value })
                  }
                />
                <span>%</span>
              </div>

              {/* date tested / initials */}
              <div className="px-1 ">
                <input
                  className="w-full border-none outline-none text-[11px]"
                  placeholder="MM/DD/YYYY / AB"
                  value={row.dateTestedInitial}
                  onChange={(e) =>
                    updateActive(idx, { dateTestedInitial: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
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
            <input
              className="flex-1 border-0 border-b border-black/60 outline-none"
              value={comments}
              onChange={(e) => {
                setComments(e.target.value);
                markDirty();
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">TESTED BY :</span>
                <input
                  className="flex-1 border-0 border-b border-black/60 outline-none"
                  value={testedBy}
                  onChange={(e) => {
                    setTestedBy(e.target.value.toUpperCase());
                    markDirty();
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">DATE :</span>
                <input
                  className="flex-1 border-0 border-b border-black/60 outline-none"
                  type="date"
                  value={formatDateForInput(testedDate)}
                  onChange={(e) => {
                    setTestedDate(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">REVIEWED BY :</span>
                <input
                  className="flex-1 border-0 border-b border-black/60 outline-none"
                  value={reviewedBy}
                  onChange={(e) => {
                    setReviewedBy(e.target.value.toUpperCase());
                    markDirty();
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">DATE :</span>
                <input
                  className="flex-1 border-0 border-b border-black/60 outline-none"
                  type="date"
                  value={formatDateForInput(reviewedDate)}
                  onChange={(e) => {
                    setReviewedDate(e.target.value);
                    markDirty();
                  }}
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
