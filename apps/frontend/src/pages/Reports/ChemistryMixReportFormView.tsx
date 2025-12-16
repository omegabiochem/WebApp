import { useEffect, useState } from "react";
import { DEFAULT_CHEM_ACTIVES } from "../../utils/chemistryReportValidation";
import * as QRCode from "qrcode";

type ChemistryMixReportFormProps = {
  report: any;
  onClose: () => void;
  isBulkPrint?: boolean;
  isSingleBulk?: boolean;
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

const PrintStyles = () => (
  <style>{`
    @media print {
      @page { size: A4 portrait; margin: 6mm 10mm 12mm 10mm; }

      html, body { margin: 0 !important; padding: 0 !important; }
      .no-print { display: none !important; }

      .sheet {
        width: 100% !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
        max-height: none !important;
        overflow: visible !important;
      }

      .letterhead { margin-top: 0 !important; margin-bottom: 4px !important; }
      .print-footer { break-inside: avoid; page-break-inside: avoid; margin-top: 6px !important; }

      .tight-row { line-height: 1.1 !important; }

      .print-center {
    display: grid !important;
    align-items: center !important;
  }

      img, svg {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      /* If we ever render QR as <img>, keep it crisp */
      img { image-rendering: pixelated; image-rendering: crisp-edges; }
    }
  `}</style>
);

export default function ChemistryMixReportFormView(
  props: ChemistryMixReportFormProps
) {
  const { report, onClose, isBulkPrint = false, isSingleBulk = false } = props;

  const isBulk = isBulkPrint === true;

  const qrValue = report?.id
    ? JSON.stringify({
        t: "report",
        id: report.id, // ← the only thing the watcher needs
        // url: `${appBase}/reports/micro-mix/${report.id}`, // nice-to-have for humans
      })
    : "";

  // const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrSvg, setQrSvg] = useState<string>("");

  useEffect(() => {
    let alive = true;
    if (!qrValue) {
      setQrSvg("");
      return;
    }

    QRCode.toString(qrValue, {
      type: "svg",
      errorCorrectionLevel: "H", // stronger ECC helps with print/scan damage
      margin: 4, // 4-module quiet zone is the standard
      // version: 7,                // optional: fix version to keep modules coarse (see note below)
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((svg) => {
        if (alive) setQrSvg(svg);
      })
      .catch(() => {
        if (alive) setQrSvg("");
      });
    return () => {
      alive = false;
    };
  }, [qrValue]);

  // ...
  useEffect(() => {
    if (isBulkPrint) return;
    const onAfterPrint = () => onClose?.();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [onClose, isBulkPrint]);

  return (
    <div
      className={
        isBulk
          ? "sheet bg-white text-black p-0 m-0"
          : "sheet relative mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4"
      }
    >
      {/* only inject styles when NOT bulk-printing from dashboard */}
      {!isBulk && <PrintStyles />}

      {!isBulk &&
        // any floating / sticky UI
        null}

      {/* View switcher */}

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
          {/* Left: Form Number */}
          <div className="text-left text-[12px] font-bold">
            {report.formNumber && report.formNumber}
          </div>

          {/* Center: Title */}
          <div className="text-center text-[18px] font-bold underline">
            Report
          </div>

          {/* Right: Report Number */}
          <div className="text-right text-[12px] font-bold">
            {report.reportNumber && report.reportNumber}
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
              value={report?.client || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="whitespace-nowrap font-medium">DATE SENT :</div>
            <input
              className="flex-1 border-none outline-none text-[12px]"
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
            className="flex-1 border-none outline-none text-[12px]"
            value={report?.sampleDescription || ""}
            readOnly
            disabled
          />
        </div>

        {/* TYPE OF TEST / SAMPLE COLLECTED */}
        <div className="grid grid-cols-[47%_53%] border-b border-black text-[11px] min-h-[20px]">
          {/* LEFT */}
          <div className="px-2 border-r border-black grid items-center">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-medium mr-1 shrink-0">TYPE OF TEST :</span>

              <label className="inline-flex items-center gap-1 shrink-0">
                <input
                  type="checkbox"
                  className="thick-box2"
                  checked={report?.testTypes?.includes("ID")}
                  readOnly
                  disabled
                />
                <span>ID</span>
              </label>

              <label className="inline-flex items-center gap-1 shrink-0">
                <input
                  type="checkbox"
                  className="thick-box2"
                  checked={report?.testTypes?.includes("PERCENT_ASSAY")}
                  readOnly
                  disabled
                />
                <span>Percent Assay</span>
              </label>

              <label className="inline-flex items-center gap-1 shrink-0">
                <input
                  type="checkbox"
                  className="thick-box2"
                  checked={report?.testTypes?.includes("CONTENT_UNIFORMITY")}
                  readOnly
                  disabled
                />
                <span>Content Uniformity</span>
              </label>
            </div>
          </div>

          {/* RIGHT */}
          <div className="px-2 grid items-center">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-medium mr-1 shrink-0">
                SAMPLE COLLECTED :
              </span>

              <label className="inline-flex items-center gap-1 shrink-0">
                <input
                  type="radio"
                  name="sampleCollected"
                  className="thick-radio"
                  checked={report?.sampleCollected === "TOP_BEG"}
                  readOnly
                  disabled
                />
                <span>Top / Beg</span>
              </label>

              <label className="inline-flex items-center gap-1 shrink-0">
                <input
                  type="radio"
                  name="sampleCollected"
                  className="thick-radio"
                  checked={report?.sampleCollected === "MID"}
                  readOnly
                  disabled
                />
                <span>Mid</span>
              </label>

              <label className="inline-flex items-center gap-1 shrink-0">
                <input
                  type="radio"
                  name="sampleCollected"
                  className="thick-radio"
                  checked={report?.sampleCollected === "BOTTOM_END"}
                  readOnly
                  disabled
                />
                <span>Bottom / End</span>
              </label>
            </div>
          </div>
        </div>

        {/* LOT / MFG DATE */}
        <div className="grid grid-cols-[50%_50%] border-b border-black text-[12px]">
          <div className="px-2 border-r border-black flex items-center gap-2">
            <span className="font-medium">LOT / BATCH # :</span>
            <input
              className="flex-1 border-none outline-none"
              value={report?.lotBatchNo || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 flex items-center gap-2">
            <span className="font-medium">MANUFACTURE DATE :</span>
            <input
              className="flex-1 border-none outline-none"
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
              className="w-[80px] border-none outline-none shrink-0"
              value={report?.formulaId || ""}
              readOnly
              disabled
            />
          </div>

          <div className="px-2 border-r border-black flex items-center gap-1">
            <span className="whitespace-nowrap font-medium">SAMPLE SIZE :</span>
            <input
              className="w-[80px] border-none outline-none shrink-0"
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
              className="w-[80px] border-none outline-none shrink-0"
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
                      className="thick-box2"
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
      <div className="mt-4 border border-black text-[11px]">
        <div className="grid grid-cols-[25%_15%_23%_17%_20%] font-semibold text-center border-b border-black">
          <div className="p-1 border-r border-black">ACTIVE TO BE TESTED</div>
          <div className="p-1 border-r border-black">SOP #</div>
          <div className="p-1 border-r border-black">FORMULA CONTENT</div>
          <div className="p-1 border-r border-black">RESULTS</div>
          <div className="p-1 whitespace-nowrap">DATE TESTED / INITIAL</div>
        </div>

        {(report?.actives || DEFAULT_CHEM_ACTIVES).map((row: any) => (
          <div
            key={row.key}
            className="grid grid-cols-[25%_15%_23%_17%_20%] border-b last:border-b-0 border-black"
          >
            {/* active name + checkbox */}
            <div className="flex items-center gap-2 border-r border-black px-1 ">
              <input
                type="checkbox"
                className="thick-box2"
                checked={row.checked}
                readOnly
                disabled
              />
              <span>{row.label}</span>
            </div>

            {/* SOP # */}
            <div className="border-r border-black px-1 ">
              <input
                className="w-full border-none outline-none text-[11px]"
                value={row.sopNo}
                readOnly
                disabled
              />
            </div>

            {/* formula content % */}
            <div className="border-r border-black px-1 flex items-center">
              <div className="flex w-full items-center gap-1 whitespace-nowrap">
                <input
                  className="min-w-0 flex-1 border-none outline-none text-[11px]"
                  value={row.formulaContent}
                  readOnly
                  disabled
                />
                <span className="shrink-0">%</span>
              </div>
            </div>

            {/* result % */}
            <div className="border-r border-black px-1 flex items-center">
              <div className="flex w-full items-center gap-1 whitespace-nowrap">
                <input
                  className="min-w-0 flex-1 border-none outline-none text-[11px]"
                  value={row.result}
                  readOnly
                  disabled
                />
                <span className="shrink-0">%</span>
              </div>
            </div>

            {/* date tested / initials */}
            <div className="px-1 ">
              <input
                className="w-full border-none outline-none text-[11px]"
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
        responsible for the release of any product not in the Biochem stability
        program.
      </div>

      {/* Comments + signatures */}
      <div className="mt-2 text-[12px]">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium">Comments :</span>
          <input
            className="flex-1 border-0 border-b border-black/60 outline-none"
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
                className="flex-1 border-0 border-b border-black/60 outline-none"
                value={report?.testedBy || ""}
                readOnly
                disabled
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">DATE :</span>
              <input
                className="flex-1 border-0 border-b border-black/60 outline-none"
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
                className="flex-1 border-0 border-b border-black/60 outline-none"
                value={report?.reviewedBy || ""}
                readOnly
                disabled
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">DATE :</span>
              <input
                className="flex-1 border-0 border-b border-black/60 outline-none"
                type="date"
                value={formatDateForInput(report?.reviewedDate) || ""}
                readOnly
                disabled
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Report ID + QR */}
      <div
        className={
          isBulk
            ? "mt-2 flex items-end justify-between print-footer"
            : "mt-2 flex items-end justify-between print-footer"
        }
        style={
          // For normal view → keep avoid
          !isBulk
            ? { pageBreakInside: "avoid", breakInside: "avoid" }
            : // For bulk:
            // - if it's MANY reports → keep avoid
            // - if it's ONLY ONE report → let browser break (no extra page)
            !isSingleBulk
            ? { pageBreakInside: "avoid", breakInside: "avoid" }
            : undefined
        }
      >
        <div className="text-[10px] text-slate-600">
          This report is confidential and intended only for the recipient.
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            {/* <div className="p-1 bg-white"> */}
            <div className="text-[11px] font-semibold">Report ID</div>
            <div className="mono text-[11px]">{report?.id}</div>
            {report?.reportNumber && (
              <div className="text-[11px]">Report # {report.reportNumber}</div>
            )}
            <div className="mt-1 text-[10px] text-slate-600">
              Scan to open in LIMS
            </div>
            {/* </div> */}
          </div>

          {qrSvg ? (
            <div className="p-1 bg-white shrink-0" aria-label="Report QR">
              <div
                // ~28–32mm square is a sweet spot for IDs this length
                style={{ width: "36mm", height: "36mm" }}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>
          ) : (
            <div
              style={{ width: 96, height: 96 }}
              className="flex items-center justify-center border border-black/30 text-[10px] text-slate-500"
            >
              QR
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
