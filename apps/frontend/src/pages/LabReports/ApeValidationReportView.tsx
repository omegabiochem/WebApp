import { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import pjla from "../../assets/pjla.png";
import ilacmra from "../../assets/ilacmra.png";
import { getCorrections } from "../../utils/apeReportValidation";

type ReportStatus = string;

type CorrectionItem = {
  id: string;
  fieldKey: string;
  message: string;
  status: string;
  oldValue?: unknown;
  recipientSide?: "CLIENT" | "LAB" | "BOTH" | null;
};

type ValidationRow = {
  organism: string;
  control: string;
  avgCfuForTestSample: string;
};

type ValidationSection = {
  key: string;
  title: string;
  rows: ValidationRow[];
};

type ApeValidationReportViewProps = {
  report?: any;
  onClose?: () => void;
  embedded?: boolean;
  pageMode?: "VIEW" | "UPDATE";
  hideTopActions?: boolean;
  hideBottomActions?: boolean;
  forcePageReadOnly?: boolean;
  onSaved?: (updated: any) => void;
  onStatusChanged?: (updated: any) => void;
  beforeParentStatusChange?: (
    targetStatus: ReportStatus,
    currentChild?: any,
  ) => boolean | Promise<boolean>;
};

type ParentApeOrganism = {
  key?: string;
  label?: string;
  checked?: boolean;
};

const REPORT_TYPE = "APE_VALIDATION_REPORT";

const APE_ORGANISM_OPTIONS = [
  { key: "E_COLI", reportLabel: "Escherichia Coli" },
  { key: "S_AUREUS", reportLabel: "Staphylococcus Aureus" },
  { key: "P_AERUGINOSA", reportLabel: "Pseudomonas Aeruginosa" },
  { key: "C_ALBICANS", reportLabel: "Candida Albicans" },
  { key: "A_NIGER", reportLabel: "Aspergillus Niger" },
  { key: "B_CEPACIA", reportLabel: "B. Cepacia" },
] as const;

const DEFAULT_APE_ORGANISMS = APE_ORGANISM_OPTIONS.filter(
  (item) => item.key !== "B_CEPACIA",
).map((item) => item.reportLabel);

function normalizeOrganismToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getSelectedApeOrganismNames(value: unknown): string[] {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source) || source.length === 0) {
    return [...DEFAULT_APE_ORGANISMS];
  }

  const selectedTokens = new Set(
    source
      .filter((item: ParentApeOrganism | string) =>
        typeof item === "string" ? true : item?.checked === true,
      )
      .flatMap((item: ParentApeOrganism | string) => {
        if (typeof item === "string") {
          return [normalizeOrganismToken(item)];
        }

        return [
          normalizeOrganismToken(item?.key),
          normalizeOrganismToken(item?.label),
        ];
      })
      .filter(Boolean),
  );

  const selected = APE_ORGANISM_OPTIONS.filter(
    (option) =>
      selectedTokens.has(normalizeOrganismToken(option.key)) ||
      selectedTokens.has(normalizeOrganismToken(option.reportLabel)),
  ).map((option) => option.reportLabel);

  return selected.length ? selected : [...DEFAULT_APE_ORGANISMS];
}

function makeRows(organismNames: string[]): ValidationRow[] {
  return organismNames.map((organism) => ({
    organism,
    control: "",
    avgCfuForTestSample: "",
  }));
}

function makeDefaultSections(organismNames: string[]): ValidationSection[] {
  return [
    {
      key: "NEUTRALIZER_WITH_PRODUCT",
      title: "VALIDATION DATA FOR NEUTRALIZER WITH PRODUCT",
      rows: makeRows(organismNames),
    },
    {
      key: "DILUENT_WITH_PRODUCT",
      title: "VALIDATION DATA FOR DILUENT WITH PRODUCT",
      rows: makeRows(organismNames),
    },
    {
      key: "MEDIA_WITHOUT_PRODUCT",
      title: "VALIDATION DATA FOR MEDIA WITHOUT PRODUCT",
      rows: makeRows(organismNames),
    },
  ];
}

function normalizeSections(
  value: any,
  organismNames: string[] = DEFAULT_APE_ORGANISMS,
): ValidationSection[] {
  const defaultSections = makeDefaultSections(organismNames);

  if (!Array.isArray(value)) return defaultSections;

  return defaultSections.map((defaultSection) => {
    const existingSection = value.find(
      (section: any) => section?.key === defaultSection.key,
    );

    return {
      key: defaultSection.key,
      title: existingSection?.title || defaultSection.title,
      rows: defaultSection.rows.map((defaultRow) => {
        const existingRow = existingSection?.rows?.find(
          (row: any) => row?.organism === defaultRow.organism,
        );

        return {
          organism: defaultRow.organism,
          control: existingRow?.control ?? "",
          avgCfuForTestSample: existingRow?.avgCfuForTestSample ?? "",
        };
      }),
    };
  });
}

function formatDateForInput(value?: string | null) {
  if (!value) return "";
  if (value === "NA") return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);

  return d.toISOString().split("T")[0];
}

function formatFooterDate(value?: string | null) {
  if (!value) return "03/10/2026";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString("en-US", { timeZone: "UTC" });
}

const PrintStyles = () => (
  <style>{`
    @media print {
      @page { size: A4 portrait; margin: 6mm 10mm 12mm 10mm; }
      html, body { margin: 0 !important; padding: 0 !important; }
      .sheet {
        width: 100% !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
        max-height: none !important;
        overflow: visible !important;
      }
      .no-print { display: none !important; }
      .letterhead { margin-top: 0 !important; margin-bottom: 4px !important; }
      .print-footer { break-inside: avoid; page-break-inside: avoid; margin-top: 6px !important; }
      img, svg {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      img {
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
    }
  `}</style>
);

const DashStyles = () => (
  <style>{`
    .dash { position: relative; z-index: 0; }
    .dash::after{
      content:"";
      position:absolute;
      inset:-4px;
      border-radius:6px;
      pointer-events:none;
      z-index:10;
      background:
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 0 /16px 2px repeat-x,
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 100% /16px 2px repeat-x,
        linear-gradient(0deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 0 /2px 16px repeat-y,
        linear-gradient(0deg, var(--dash-color) 0 8px, transparent 8px 16px) 100% 0 /2px 16px repeat-y;
      opacity:0;
      animation: dash-move 1.05s linear infinite;
    }
    .dash-red::after { --dash-color:#dc2626; opacity:1; }
    @keyframes dash-move {
      to {
        background-position: 16px 0, -16px 100%, 0 16px, 100% -16px;
      }
    }
    @media (prefers-reduced-motion: reduce) { .dash::after { animation:none; } }
    @media print { .dash::after { display:none; } }
  `}</style>
);

export default function ApeValidationReportView(
  props: ApeValidationReportViewProps,
) {
  const { report, onClose, embedded = false, hideTopActions = false } = props;

  const detail = report?.apeValidationReport ?? report ?? {};

  const selectedApeOrganisms = useMemo(
    () =>
      getSelectedApeOrganismNames(
        (report as any)?.organisms ?? detail?.organisms,
      ),
    [(report as any)?.organisms, detail?.organisms],
  );

  const validationSections = useMemo(
    () => normalizeSections(detail?.validationSections, selectedApeOrganisms),
    [detail?.validationSections, selectedApeOrganisms],
  );

  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [showCorrTray, setShowCorrTray] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>("");

  const openCorrections = useMemo(
    () => corrections.filter((c) => String(c.status) === "OPEN"),
    [corrections],
  );

  const reportId = report?.id || null;
  const reportNumber = report?.reportNumber || "";
  const parentReportId =
    report?.parentReportId || report?.workflowReportId || null;

  const qrValue =
    parentReportId || reportId
      ? JSON.stringify({
          t: "ape-validation-report",
          id: parentReportId || reportId,
          childId: reportId,
          reportType: report?.reportType || REPORT_TYPE,
        })
      : "";

  useEffect(() => {
    let alive = true;

    if (!qrValue) {
      setQrSvg("");
      return;
    }

    QRCode.toString(qrValue, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 4,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((svg) => alive && setQrSvg(svg))
      .catch(() => alive && setQrSvg(""));

    return () => {
      alive = false;
    };
  }, [qrValue]);

  useEffect(() => {
    if (!reportId) {
      setCorrections([]);
      return;
    }

    getCorrections(reportId)
      .then((list) => setCorrections(Array.isArray(list) ? list : []))
      .catch(() => setCorrections([]));
  }, [reportId]);

  const hasOpenCorrection = (keyOrPrefix: string) =>
    openCorrections.some(
      (c) =>
        c.fieldKey === keyOrPrefix ||
        c.fieldKey.startsWith(`${keyOrPrefix}.`) ||
        c.fieldKey.startsWith(`${keyOrPrefix}:`),
    );

  const dashClass = (keyOrPrefix: string) =>
    hasOpenCorrection(keyOrPrefix) ? "dash dash-red" : "";

  const inputClass =
    "w-full input-editable py-0 text-[11px] leading-[13px] border border-black/70 bg-transparent px-1 outline-none disabled:cursor-not-allowed disabled:bg-transparent";
  const tableInputClass =
    "w-full input-editable border border-black/70 bg-transparent px-1 py-[1px] text-center text-[10px] leading-tight outline-none disabled:cursor-not-allowed disabled:bg-transparent";
  const signatureInputClass =
    "flex-1 border-0 border-b border-black/70 text-[12px] outline-none bg-transparent disabled:cursor-not-allowed disabled:bg-transparent";

  const footerRevNo = report?.footerRevNo || "Rev-01";
  const footerDateEffective = formatFooterDate(report?.footerDateEffective);
  const footerNote = `${footerRevNo} [Date Effective : ${footerDateEffective}]`;

  const footerImages = [
    { src: pjla, alt: "FDA Registered" },
    { src: ilacmra, alt: "ISO Certified" },
  ];

  const fieldValue = {
    client: detail?.client || "",
    dateSent: formatDateForInput(detail?.dateSent),
    typeOfTest: detail?.typeOfTest || "APE",
    sampleType: detail?.sampleType || "",
    formulaNo: detail?.formulaNo || "",
    description: detail?.description || "",
    lotNo: detail?.lotNo || "",
    manufactureDate: formatDateForInput(detail?.manufactureDate),
    testSopNo: detail?.testSopNo || "",
    testReference: detail?.testReference || "USP <51> CURRENT",
    dateTested: formatDateForInput(detail?.dateTested),
    dateCompleted: formatDateForInput(detail?.dateCompleted),
    testedBy: detail?.testedBy || "",
    testedDate: formatDateForInput(detail?.testedDate),
    reviewedBy: detail?.reviewedBy || "",
    reviewedDate: formatDateForInput(detail?.reviewedDate),
  };

  function validationFieldKey(
    sectionKey: string,
    rowIndex: number,
    field: "control" | "avgCfuForTestSample",
  ) {
    return `validationSections.${sectionKey}.${rowIndex}.${field}`;
  }

  return (
    <>
      <div className="sheet mx-auto max-w-[800px] border border-black bg-white p-4 text-black shadow print:shadow-none">
        <PrintStyles />
        <DashStyles />

        {!hideTopActions && !embedded && (
          <div className="no-print mb-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border bg-gray-600 px-3 py-1 text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}

        <div className="letterhead mb-2 text-center">
          <div
            className="text-[22px] font-bold tracking-wide"
            style={{ color: "blue" }}
          >
            OMEGA / BIOCHEM LABORATORIES, INC.
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

          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0 text-left text-[11px] font-bold">
              {(report as any)?.parentFormNumber ||
              (report as any)?.formNumber ? (
                <span className="whitespace-nowrap">
                  FORM NO:{" "}
                  {String(
                    (report as any)?.parentFormNumber ||
                      (report as any)?.formNumber,
                  )}
                </span>
              ) : null}
            </div>

            <div className="text-center text-[18px] font-bold underline">
              APE VALIDATION REPORT
            </div>

            <div className="min-w-0 text-right text-[11px] font-bold">
              {(report as any)?.parentReportNumber || reportNumber ? (
                <span className="whitespace-nowrap">
                  REPORT NO:{" "}
                  {String((report as any)?.parentReportNumber || reportNumber)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="w-full border border-black text-[15px]">
          <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
            <div
              className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass(
                "client",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">CLIENT:</div>
              <input
                className={inputClass}
                value={fieldValue.client}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative flex items-center gap-1 px-2 ${dashClass(
                "dateSent",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>
              <input
                className={inputClass}
                value={fieldValue.dateSent}
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
            <div
              className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass(
                "typeOfTest",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">TYPE OF TEST:</div>
              <input
                className={inputClass}
                value={fieldValue.typeOfTest}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass(
                "sampleType",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">SAMPLE TYPE:</div>
              <input
                className={inputClass}
                value={fieldValue.sampleType}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative flex items-center gap-1 px-2 ${dashClass(
                "formulaNo",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">FORMULA #:</div>
              <input
                className={inputClass}
                value={fieldValue.formulaNo}
                readOnly
                disabled
              />
            </div>
          </div>

          <div
            className={`relative flex items-center gap-2 border-b border-black px-2 text-[12px] leading-snug ${dashClass(
              "description",
            )}`}
          >
            <div className="w-28 font-medium">DESCRIPTION:</div>
            <input
              className={inputClass}
              value={fieldValue.description}
              readOnly
              disabled
            />
          </div>

          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div
              className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass(
                "lotNo",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">LOT #:</div>
              <input
                className={inputClass}
                value={fieldValue.lotNo}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative flex items-center gap-1 px-2 ${dashClass(
                "manufactureDate",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">
                MANUFACTURE DATE:
              </div>
              <input
                className={inputClass}
                value={fieldValue.manufactureDate || "NA"}
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div
              className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass(
                "testSopNo",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">TEST SOP #:</div>
              <input
                className={inputClass}
                value={fieldValue.testSopNo}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative flex items-center gap-1 px-2 ${dashClass(
                "dateTested",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">DATE TESTED:</div>
              <input
                className={inputClass}
                value={fieldValue.dateTested}
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="grid grid-cols-[55%_45%] text-[12px] leading-snug">
            <div
              className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass(
                "testReference",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">
                TEST REFERENCE:
              </div>
              <input
                className={inputClass}
                value={fieldValue.testReference}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative flex items-center gap-1 px-2 ${dashClass(
                "dateCompleted",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">
                DATE COMPLETED:
              </div>
              <input
                className={inputClass}
                value={fieldValue.dateCompleted}
                readOnly
                disabled
              />
            </div>
          </div>
        </div>

        <div className="mt-3 w-full border border-black text-[11px] leading-[13px]">
          <div className="grid grid-cols-[54%_20%_26%] border-b border-black text-center font-bold">
            <div className="border-r border-black px-1.5 py-[2px]" />

            <div className="flex items-center justify-center border-r border-black px-1.5 py-[2px]">
              <span className="inline-block w-full text-center tracking-[0.18em] whitespace-nowrap">
                CONTROL
              </span>
            </div>

            <div className="flex items-center justify-center px-1.5 py-[2px]">
              <span className="inline-block w-full text-center tracking-[0.08em] leading-[12px]">
                AVG CFU FOR TEST SAMPLE
              </span>
            </div>
          </div>

          {validationSections.map((section, sectionIndex) => (
            <div key={section.key}>
              <div className="grid grid-cols-[54%_20%_26%] border-b border-black text-[10px] leading-[13px]">
                <div className="border-r border-black px-1.5 py-[2px] font-bold">
                  <span className="inline-block w-full tracking-[0.04em]">
                    {section.title}
                  </span>
                </div>

                <div className="border-r border-black" />
                <div />
              </div>

              {section.rows.map((row, rowIndex) => {
                const isLastRow =
                  sectionIndex === validationSections.length - 1 &&
                  rowIndex === section.rows.length - 1;

                const controlKey = validationFieldKey(
                  section.key,
                  rowIndex,
                  "control",
                );
                const avgKey = validationFieldKey(
                  section.key,
                  rowIndex,
                  "avgCfuForTestSample",
                );

                return (
                  <div
                    key={`${section.key}-${row.organism}`}
                    className={`grid grid-cols-[54%_20%_26%] text-[11px] leading-[13px] ${
                      isLastRow ? "" : "border-b border-black"
                    }`}
                  >
                    <div className="flex items-center border-r border-black px-1.5 py-[1px]">
                      <span className="inline-block w-full tracking-[0.03em]">
                        {row.organism}
                      </span>
                    </div>

                    <div
                      className={`relative flex items-center border-r border-black px-1.5 py-[1px] ${dashClass(
                        controlKey,
                      )}`}
                    >
                      <input
                        className={tableInputClass}
                        value={row.control}
                        readOnly
                        disabled
                      />
                    </div>

                    <div
                      className={`relative flex items-center px-1.5 py-[1px] ${dashClass(
                        avgKey,
                      )}`}
                    >
                      <input
                        className={tableInputClass}
                        value={row.avgCfuForTestSample}
                        readOnly
                        disabled
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="relative p-2">
            <div
              className={`relative mb-2 flex items-center gap-2 font-medium ${dashClass(
                "testedBy",
              )}`}
            >
              TESTED BY:
              <input
                className={signatureInputClass}
                value={fieldValue.testedBy}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative mt-2 flex items-center gap-2 font-medium ${dashClass(
                "testedDate",
              )}`}
            >
              DATE:
              <input
                className={signatureInputClass}
                value={fieldValue.testedDate}
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="relative p-2">
            <div
              className={`relative mb-2 flex items-center gap-2 font-medium ${dashClass(
                "reviewedBy",
              )}`}
            >
              REVIEWED BY:
              <input
                className={signatureInputClass}
                value={fieldValue.reviewedBy}
                readOnly
                disabled
              />
            </div>

            <div
              className={`relative mt-2 flex items-center gap-2 font-medium ${dashClass(
                "reviewedDate",
              )}`}
            >
              DATE:
              <input
                className={signatureInputClass}
                value={fieldValue.reviewedDate}
                readOnly
                disabled
              />
            </div>
          </div>
        </div>

        <div
          className="print-footer mt-2 flex items-end justify-between"
          style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {footerImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img.src}
                  alt={img.alt}
                  className="h-[60px] w-[60px] rounded border border-black/10 bg-white object-contain"
                />
              ))}
            </div>

            <div className="w-[136px] text-center text-[8px] font-bold leading-tight text-slate-700">
              Accreditation No: <span className="font-bold">109344</span>
            </div>

            <div className="text-[8px] text-slate-600">
              This report is confidential and intended only for the recipient.
            </div>

            <div className="text-[8px] text-slate-600">{footerNote}</div>
          </div>

          <div className="flex items-end gap-3">
            <div className="text-right leading-tight">
              <div className="text-[11px] font-semibold">Report ID</div>

              <div className="mono text-[11px]">
                {parentReportId || reportId || ""}
              </div>

              {reportNumber && (
                <div className="text-[11px]">Report # {reportNumber}</div>
              )}

              <div className="mt-1 text-[10px] text-slate-600">
                Scan to open in LIMS
              </div>
            </div>

            {qrSvg ? (
              <div className="shrink-0 bg-white p-1" aria-label="Report QR">
                <div
                  className="qr-code-box"
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

      {!embedded && openCorrections.length > 0 && (
        <div className="no-print fixed bottom-20 right-6 z-40">
          <button
            type="button"
            onClick={() => setShowCorrTray((s) => !s)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xl hover:bg-slate-50"
          >
            <span>📝 Corrections</span>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
              {openCorrections.length}
            </span>
          </button>
        </div>
      )}

      {!embedded && showCorrTray && (
        <div className="no-print fixed bottom-20 right-6 z-40 w-[430px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">
          <div className="border-b bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Correction Review
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Open corrections shown for this report.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                onClick={() => setShowCorrTray(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="max-h-[430px] overflow-auto bg-slate-50/60 p-3">
            {openCorrections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
                No open corrections
              </div>
            ) : (
              <div className="space-y-3">
                {openCorrections.map((c, index) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {index + 1}. {c.fieldKey}
                    </div>

                    <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      <span className="font-semibold">Reason:</span> {c.message}
                    </div>

                    {c.recipientSide && (
                      <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                        <span className="font-semibold">To:</span>{" "}
                        {c.recipientSide}
                      </div>
                    )}

                    {c.oldValue != null && String(c.oldValue).trim() !== "" && (
                      <div className="mt-2 rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <span className="font-semibold">Old Value:</span>{" "}
                        {typeof c.oldValue === "string"
                          ? c.oldValue
                          : JSON.stringify(c.oldValue)}
                      </div>
                    )}

                    <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      OPEN
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
