import { DEFAULT_CHEM_ACTIVES } from "../../utils/chemistryReportValidation";

type ChemistryMixReportFormProps = {
  report: any;
  onClose: () => void;
};

function formatDateForInput(value: string | null) {
  if (!value) return "";

  return new Date(value).toISOString().split("T")[0];
}

// sample type checkboxes
type SampleTypeKey =
  | "BULK"
  | "FINISHED_GOOD"
  | "RAW_MATERIAL"
  | "PROCESS_VALIDATION"
  | "CLEANING_VALIDATION"
  | "COMPOSITE"
  | "DI_WATER_SAMPLE";

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

export default function ChemistryMixReportFormView(
  props: ChemistryMixReportFormProps
) {
  const { report, onClose } = props;
  return (
    <>
      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow p-4">
        {/* Top buttons */}
        {/* <div className="no-print mb-4 flex justify-end gap-2">
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
        </div> */}

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
              {report.reportNumber ? <> {report.reportNumber}</> : null}
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
                value={report?.client || ""}
                readOnly
                disabled
              />
            </div>
            <div className="px-2 flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">DATE SENT :</div>
              <input
                className="flex-1 border-0 border-b border-black/70 outline-none text-[12px]"
                type="date"
                value={formatDateForInput(report?.dateSent) || ""}
                readOnly
                disabled
              />
            </div>
          </div>

          {/* SAMPLE DESCRIPTION line */}
          <div className="border-b border-black flex items-center gap-2 px-2">
            <div className="w-40 font-medium">SAMPLE DESCRIPTION :</div>
            <input
              className="flex-1 border-0 border-b border-black/70 outline-none text-[12px]"
              value={report?.sampleDescription || ""}
              readOnly
              disabled
            />
          </div>

          {/* TYPE OF TEST / SAMPLE COLLECTED */}
          <div className="grid grid-cols-[47%_53%] border-b border-black text-[11px]">
            <div className="px-2 border-r border-black flex items-center gap-2">
              <span className="font-medium mr-1">TYPE OF TEST :</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={report?.testTypes.includes("ID")}
                  readOnly
                  disabled
                />
                ID
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={report?.testTypes.includes("PERCENT_ASSAY")}
                  readOnly
                  disabled
                />
                Percent Assay
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={report?.testTypes.includes("CONTENT_UNIFORMITY")}
                  readOnly
                  disabled
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
                  checked={report?.sampleCollected === "TOP_BEG"}
                  readOnly
                  disabled
                />
                Top / Beg
              </label>

              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="sampleCollected"
                  checked={report?.sampleCollected === "MID"}
                  readOnly
                  disabled
                />
                Mid
              </label>

              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="sampleCollected"
                  checked={report?.sampleCollected === "BOTTOM_END"}
                  readOnly
                  disabled
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
                value={report?.lotBatchNo || ""}
                readOnly
                disabled
              />
            </div>
            <div className="px-2 flex items-center gap-2">
              <span className="font-medium">MANUFACTURE DATE :</span>
              <input
                className="flex-1 border-0 border-b border-black/70 outline-none"
                type="date"
                value={formatDateForInput(report?.manufactureDate) || ""}
                readOnly
                disabled
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
                value={report?.formulaId || ""}
                readOnly
                disabled
              />
            </div>

            <div className="px-2 border-r border-black flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                SAMPLE SIZE :
              </span>
              <input
                className="w-[80px] border-0 border-b border-black/70 outline-none shrink-0"
                value={report?.sampleSize || ""}
                readOnly
                disabled
              />
            </div>

            <div className="px-2 flex items-center gap-1">
              <span className="whitespace-nowrap font-medium">
                NUMBER OF ACTIVES :
              </span>
              <input
                className="w-[80px] border-0 border-b border-black/70 outline-none shrink-0"
                value={report?.numberOfActives || ""}
                readOnly
                disabled
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
                        checked={report?.sampleTypes.includes(key)}
                        readOnly
                        disabled
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

          {DEFAULT_CHEM_ACTIVES.map((row, idx) => (
            <div
              key={row.key}
              className="grid grid-cols-[25%_15%_23%_20%_17%] border-b last:border-b-0 border-black"
            >
              {/* active name + checkbox */}
              <div className="flex items-center gap-2 border-r border-black px-1 ">
                <input
                  type="checkbox"
                  checked={row.checked}
                  readOnly
                  disabled
                />
                <span>{row.label}</span>
              </div>

              {/* SOP # */}
              <div className="border-r border-black px-1 ">
                <input
                  className="w-full border-0 border-b border-black/60 outline-none text-[11px]"
                  value={row.sopNo}
                  readOnly
                  disabled
                />
              </div>

              {/* formula content % */}
              <div className="border-r border-black px-1  flex items-center gap-1">
                <input
                  className="flex-1 border-0 border-b border-black/60 outline-none text-[11px]"
                  value={row.formulaContent}
                  readOnly
                  disabled
                />
                <span>%</span>
              </div>

              {/* result % */}
              <div className="border-r border-black px-1  flex items-center gap-1">
                <input
                  className="flex-1 border-0 border-b border-black/60 outline-none text-[11px]"
                  value={row.result}
                  readOnly
                  disabled
                />
                <span>%</span>
              </div>

              {/* date tested / initials */}
              <div className="px-1 ">
                <input
                  className="w-full border-0 border-b border-black/60 outline-none text-[11px]"
                  placeholder="MM/DD/YYYY / AB"
                  value={row.dateTestedInitial}
                  readOnly
                  disabled
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
              value={report?.comments || ""}
              readOnly
              disabled
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">TESTED BY :</span>
                <input
                  className="flex-1 border-0 border-b border-black/70 outline-none"
                  value={report?.testedBy || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">DATE :</span>
                <input
                  className="flex-1 border-0 border-b border-black/70 outline-none"
                  type="date"
                  value={formatDateForInput(report?.testedDate) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">REVIEWED BY :</span>
                <input
                  className="flex-1 border-0 border-b border-black/70 outline-none"
                  value={report?.reviewedBy || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">DATE :</span>
                <input
                  className="flex-1 border-0 border-b border-black/70 outline-none"
                  type="date"
                  value={formatDateForInput(report?.reviewedDate) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
