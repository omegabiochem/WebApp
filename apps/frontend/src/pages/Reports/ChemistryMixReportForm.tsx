import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useBlocker } from "react-router-dom";
import { api } from "../../lib/api";
import {
  DEFAULT_CHEM_ACTIVES,
  type ChemActiveRow,
} from "../../utils/chemistryReportValidation";

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

export default function ChemistryMixReportForm({
  report,
  onClose,
}: ChemistryReportFormProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isDirty, setIsDirty] = useState(false);
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
  type SamplePosition = "TOP" | "MID" | "BOTTOM";
  const [samplePosition, setSamplePosition] = useState<SamplePosition | "">(
    report?.samplePosition || ""
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




  // ------------- SAVE -------------
  const handleSave = async () => {
    const payload = {
      client,
      dateSent,
      formType: "CHEMISTRY" as const, // important for backend
      sampleDescription,
      testTypes,
      samplePosition,
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
      // you can also send status: "DRAFT" here if needed
    };

    try {
      if (reportId) {
        const updated = await api<{ id: string; reportNumber?: string }>(
          `/reports/${reportId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setReportId(updated.id);
        setReportNumber(String(updated.reportNumber ?? reportNumber));
      } else {
        const created = await api<{ id: string; reportNumber?: string }>(
          "/reports",
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        setReportId(created.id);
        setReportNumber(String(created.reportNumber ?? ""));
      }
      setIsDirty(false);
      alert("✅ Chemistry report saved");
    } catch (err: any) {
      console.error(err);
      alert("❌ Error saving chemistry report: " + err.message);
    }
  };

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
                className="flex-1 border-0 border-b border-black/70  text-[12px]"
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
                className="flex-1 border-0 border-b border-black/70 outline-none text-[12px]"
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
              className="flex-1 border-0 border-b border-black/70 outline-none text-[12px]"
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
                  name="samplePosition"
                  checked={samplePosition === "TOP"}
                  onChange={() => {
                    setSamplePosition("TOP");
                    markDirty();
                  }}
                />
                Top / Beg
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="samplePosition"
                  checked={samplePosition === "MID"}
                  onChange={() => {
                    setSamplePosition("MID");
                    markDirty();
                  }}
                />
                Mid
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="samplePosition"
                  checked={samplePosition === "BOTTOM"}
                  onChange={() => {
                    setSamplePosition("BOTTOM");
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
                className="flex-1 border-0 border-b border-black/70 outline-none"
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
                className="flex-1 border-0 border-b border-black/70 outline-none"
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
                className="w-[80px] border-0 border-b border-black/70 outline-none shrink-0"
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
                className="w-[80px] border-0 border-b border-black/70 outline-none shrink-0"
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
                className="w-[80px] border-0 border-b border-black/70 outline-none shrink-0"
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
                  className="w-full border-0 border-b border-black/60 outline-none text-[11px]"
                  value={row.sopNo}
                  onChange={(e) => updateActive(idx, { sopNo: e.target.value })}
                />
              </div>

              {/* formula content % */}
              <div className="border-r border-black px-1  flex items-center gap-1">
                <input
                  className="flex-1 border-0 border-b border-black/60 outline-none text-[11px]"
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
                  className="flex-1 border-0 border-b border-black/60 outline-none text-[11px]"
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
                  className="w-full border-0 border-b border-black/60 outline-none text-[11px]"
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
              className="flex-1 border-0 border-b border-black/70 outline-none"
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
                  className="flex-1 border-0 border-b border-black/70 outline-none"
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
                  className="flex-1 border-0 border-b border-black/70 outline-none"
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
                  className="flex-1 border-0 border-b border-black/70 outline-none"
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
                  className="flex-1 border-0 border-b border-black/70 outline-none"
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
    </>
  );
}

// const PrintStyles = () => (
//   <style>{`
//   @media print {
//     @page { size: A4 portrait; margin: 14mm; }
//     body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
//     .no-print { display: none !important; }
//     .sheet { box-shadow: none !important; border: none !important; }
//   }
// `}</style>
// );

// export default function ChemistryMixReportForm() {
//   return (
//     <>
//       <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
//         <PrintStyles />

//         {/* Header + print controls */}
//         <div className="no-print mb-4 flex justify-end gap-2">
//           <button
//             className="px-3 py-1 rounded-md border bg-gray-600 text-white"
//             // onClick={handleClose}
//           >
//             Close
//           </button>

//           <button
//             className="px-3 py-1 rounded-md border bg-blue-600 text-white"
//             // onClick={handleSave}
//             // disabled={role === "SYSTEMADMIN"}
//           >
//             Save Report
//           </button>

//           {/* {!HIDE_SAVE_FOR.has(status as ReportStatus) && (
//           <button
//             className="px-3 py-1 rounded-md border bg-blue-600 text-white"
//             // onClick={handleSave}
//             // disabled={role === "SYSTEMADMIN"}
//           >
//             {reportId ? "Update Report" : "Save Report"}
//           </button>
//         )} */}
//         </div>

//         <div className="mb-2 text-center">
//           <div
//             className="font-bold tracking-wide text-[22px]"
//             style={{ color: "blue" }}
//           >
//             OMEGA BIOLOGICAL LABORATORY, INC.
//           </div>
//           <div className="text-[16px]" style={{ color: "blue" }}>
//             (FDA REG | ISO 17025 ACC)
//           </div>
//           <div className="text-[12px]">
//             56 PARK AVENUE, LYNDHURST, NJ 07071 <br></br>
//             Tel: (201) 883 1222 • Fax: (201) 883 0449
//           </div>
//           <div className="text-[12px]">
//             Email: <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
//           </div>
//           <div className="mt-1 grid grid-cols-3 items-center">
//             <div />
//             <div className="text-[18px] font-bold text-center underline">
//               REPORT
//             </div>
//           </div>
//         </div>
//         <div className="w-full border border-black text-[15px]">
//           <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
//             <div className="px-2 border-r border-black flex items-center gap-1">
//               <div className="whitespace-nowrap font-medium">CLIENT :</div>
//               <input
//                 className="flex-1 input-editable py-[2px] text-[12px] leading-snug"

//                 // disabled={role === "CLIENT"}
//               />
//             </div>
//             <div className="px-2 flex items-center gap-1">
//               <div className="whitespace-nowrap font-medium">DATESENT :</div>
//               <input className="flex-1 input-editable py-[2px] text-[12px] leading-snug"></input>
//             </div>
//           </div>
//           <div className="grid grid-cols-[47%_53%] border-b border-black text-[12px] leading-snug py-[3.5px]">
//             <div className="px-2 border-r border-black flex items-center gap-2">
//               <div className="whitespace-nowrap font-medium">
//                 TYPE OF TEST :
//               </div>
//               <label className="flex items-center gap-1 ">
//                 <input type="checkbox" />
//                 ID
//               </label>
//               <label className="flex items-center gap-1">
//                 <input type="checkbox" />
//                 Percent Assay
//               </label>
//               <label className="flex items-center gap-1">
//                 <input type="checkbox" />
//                 Content Uniformity
//               </label>
//             </div>
//             <div className="px-2 flex items-center gap-1">
//               <div className="whitespace-nowrap font-medium">
//                 SAMPLE COLLECTED :
//               </div>
//               <label className="flex items-center gap-1 ">
//                 <input type="checkbox" />
//                 Top / Beg
//               </label>
//               <label className="flex items-center gap-1">
//                 <input type="checkbox" />
//                 Mid
//               </label>
//               <label className="flex items-center gap-1">
//                 <input type="checkbox" />
//                 Bottom / End
//               </label>
//             </div>
//           </div>

//           <div className="border-black text-[12px] leading-snug">
//             <div className="px-2 border-r border-black flex items-center gap-1">
//               <div className="whitespace-nowrap font-medium">
//                 SAMPLE DESCRIPTION :
//               </div>
//               <input
//                 className="flex-1 input-editable py-[2px] text-[12px] leading-snug"

//                 // disabled={role === "CLIENT"}
//               />
//             </div>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// }
