import { useEffect, useState } from "react";
import { DEFAULT_CHEM_ACTIVES } from "../../utils/chemistryReportValidation";
import * as QRCode from "qrcode";
import { api, API_URL, getToken } from "../../lib/api";
import pjla from "../../assets/pjla.png";
import ilacmra from "../../assets/ilacmra.png";

type Pane = "FORM" | "ATTACHMENTS";

type ChemistryMixReportFormProps = {
  report: any;
  onClose: () => void;
  pane?: Pane; // if provided, component becomes controlled
  onPaneChange?: (p: Pane) => void; // optional callback
  showSwitcher?: boolean; // default true; hide internal switcher when false
  isBulkPrint?: boolean;
  isSingleBulk?: boolean;
};

// ---------------- Attachments panel (web-only; hidden on print) ----------------
type AttachmentItem = {
  id: string;
  filename: string;
  kind: string;
  createdAt: string;
};

const attBase = (id: string) => `/chemistry-reports/${id}/attachments`;

const authHeaders = (): HeadersInit => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function useAttachments(reportId?: string) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setItems([]);
      return;
    }
    setLoading(true);

    (async () => {
      try {
        const list = await api<AttachmentItem[]>(attBase(reportId));
        setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [reportId]);

  return { items, loading };
}

function AttachmentGallery({ reportId }: { reportId?: string }) {
  const { items, loading } = useAttachments(reportId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading)
    return (
      <div className="no-print mt-4 text-sm text-slate-500">
        Loading attachments…
      </div>
    );
  if (!items.length)
    return (
      <div className="no-print mt-4 text-sm text-slate-500">No attachments</div>
    );

  return (
    <div className="no-print mt-4">
      <div className="mb-2 text-sm font-semibold">Attachments</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((a) => {
          const filePath = `${attBase(reportId ?? "")}/${a.id}/file`;
          const ext = a.filename.split(".").pop()?.toLowerCase() || "";
          const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
          const isPdf = ext === "pdf";

          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                isImage || isPdf
                  ? setOpenId(a.id)
                  : window.open(filePath, "_blank")
              }
              className="group text-left border rounded-lg p-3 hover:shadow-sm transition bg-white"
              title="Click to preview"
            >
              <div className="h-28 w-full border rounded flex items-center justify-center overflow-hidden bg-slate-50">
                {isImage ? (
                  <Thumb path={filePath} alt={a.filename} />
                ) : isPdf ? (
                  <div className="text-xs text-slate-600">
                    PDF • click to preview
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 uppercase">
                    {ext || "file"}
                  </div>
                )}
              </div>
              <div
                className="mt-2 text-sm font-medium truncate"
                title={a.filename}
              >
                {a.filename}
              </div>
              <div className="text-xs text-slate-500">
                {a.kind} • {new Date(a.createdAt).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

      {/* simple modal */}
      {openId && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="bg-white rounded-lg shadow max-w-5xl w-full h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-2 border-b">
              <div className="text-sm font-semibold">Preview</div>
              <button
                className="px-2 py-1 text-sm border rounded hover:bg-slate-50"
                onClick={() => setOpenId(null)}
              >
                Close
              </button>
            </div>
            <div className="w-full h-full">
              <AttachmentPreview reportId={reportId!} attId={openId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Blob fetch failed ${res.status}`);
  return await res.blob();
}

function Thumb({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    (async () => {
      try {
        const b = await apiBlob(path);
        const u = URL.createObjectURL(b);
        revoke = u;
        setUrl(u);
      } catch {
        setUrl(null);
      }
    })();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [path]);
  return url ? (
    <img src={url} alt={alt} className="max-h-full max-w-full object-contain" />
  ) : (
    <div className="text-xs text-slate-600">Image • click to preview</div>
  );
}

function AttachmentPreview({
  reportId,
  attId,
}: {
  reportId: string;
  attId: string;
}) {
  const [meta, setMeta] = useState<AttachmentItem | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;

    (async () => {
      try {
        const metaResp = await api<AttachmentItem>(
          `${attBase(reportId)}/${attId}`
        );
        setMeta(metaResp);
        const blob = await apiBlob(`${attBase(reportId)}/${attId}/file`);
        const url = URL.createObjectURL(blob);
        revoke = url;
        setObjectUrl(url);
      } catch (e: any) {
        setError(e?.message || "Preview failed");
      }
    })();

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [reportId, attId]);

  if (!meta) return <div className="p-4 text-sm text-slate-500">Loading…</div>;
  if (error)
    return (
      <div className="p-4 text-sm text-rose-600">Preview failed: {error}</div>
    );
  if (!objectUrl)
    return <div className="p-4 text-sm text-slate-500">Loading file…</div>;

  const ext = meta.filename.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  const isPdf = ext === "pdf";

  return isImage ? (
    <img
      src={objectUrl}
      alt={meta.filename}
      className="w-full h-full object-contain"
    />
  ) : isPdf ? (
    <iframe src={objectUrl} title={meta.filename} className="w-full h-full" />
  ) : (
    <div className="h-full w-full flex items-center justify-center p-6 text-sm">
      Preview not available.{" "}
      <a className="ml-2 underline" href={objectUrl} download={meta.filename}>
        Download
      </a>
    </div>
  );
}

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
  | "COMPOSITE"
  | "DI_WATER_SAMPLE"
  | "STABILITY";

// Above component body (or inside, before return)
// const sampleTypeColumns: [SampleTypeKey, string][][] = [
//   [
//     ["BULK", "BULK"],
//     ["FINISHED_GOOD", "FINISHED GOOD"],
//   ],
//   [
//     ["RAW_MATERIAL", "RAW MATERIAL"],
//     ["COMPOSITE", "COMPOSITE"],
//   ],
//   [
//     ["PROCESS_VALIDATION", "PROCESS VALIDATION (PV)"],
//     ["DI_WATER_SAMPLE", "DI WATER SAMPLE"],
//   ],
//   [
//     ["STABILITY", "STABILITY"], // ✅ add this column/row wherever you want
//   ],
// ];

const sampleTypeItems: [SampleTypeKey, string][] = [
  ["BULK", "BULK"],
  ["FINISHED_GOOD", "FINISHED GOOD"],
  ["RAW_MATERIAL", "RAW MATERIAL"],
  ["COMPOSITE", "COMPOSITE"],
  ["DI_WATER_SAMPLE", "DI WATER SAMPLE"],
  ["PROCESS_VALIDATION", "PROCESS VALIDATION"],
  ["STABILITY", "STABILITY"],
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
  const {
    report,
    onClose,
    isBulkPrint = false,
    pane,
    onPaneChange,
    showSwitcher = true,
    isSingleBulk = false,
  } = props;

  const isBulk = isBulkPrint === true;

  const qrValue = report?.id
    ? JSON.stringify({
        t: "chemistry",
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

  const isControlled = typeof pane !== "undefined";
  const [internalPane, setInternalPane] = useState<Pane>("FORM");

  const activePane: Pane = isControlled ? (pane as Pane) : internalPane;

  const setActivePane = (p: Pane) => {
    if (!isControlled) setInternalPane(p);
    onPaneChange?.(p);
  };

  const FOOTER_IMAGES = [
    { src: pjla, alt: "FDA Registered" },
    { src: ilacmra, alt: "ISO Certified" },
  ];

  const FOOTER_NOTE = "Rev-00 [Date Effective : 01/01/2026]";

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

      {!isBulk && showSwitcher !== false && (
        <div className="no-print sticky top-0 z-40 -mx-4 px-4 bg-white/95 backdrop-blur border-b">
          <div className="flex items-center gap-2 py-2">
            <button
              type="button"
              onClick={() => setActivePane("FORM")}
              className={`px-3 py-1 rounded-full text-sm transition ${
                activePane === "FORM"
                  ? "bg-blue-600 text-white"
                  : "hover:bg-slate-100 text-slate-700"
              }`}
              aria-pressed={activePane === "FORM"}
            >
              Main form
            </button>
            <button
              type="button"
              onClick={() => setActivePane("ATTACHMENTS")}
              className={`px-3 py-1 rounded-full text-sm transition ${
                activePane === "ATTACHMENTS"
                  ? "bg-blue-600 text-white"
                  : "hover:bg-slate-100 text-slate-700"
              }`}
              aria-pressed={activePane === "ATTACHMENTS"}
            >
              Attachments
            </button>
          </div>
        </div>
      )}

      {/* Controls (hidden on print) */}

      {isBulk || activePane === "FORM" ? (
        <>
          {/* Letterhead – same look as Micro */}
          <div className="mb-2 text-center">
            <div
              className="font-bold tracking-wide text-[22px]"
              style={{ color: "blue" }}
            >
              OMEGA BIOLOGICAL LABORATORY, INC.
            </div>
            <div className="text-[16px]" style={{ color: "blue" }}>
              (FDA REG. | ISO 17025 ACC)
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
                {report.status === "DRAFT" ||
                report.status === "SUBMITTED_BY_CLIENT"
                  ? "CHEMISTRY SUBMISSION FORM"
                  : "CHEMISTRY REPORT"}
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
            <div className="grid grid-cols-[50%_50%] border-b border-black text-[12px] min-h-[20px]">
              {/* LEFT */}
              <div className="px-2 border-r border-black grid items-center">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="font-medium mr-1 shrink-0">
                    TYPE OF TEST :
                  </span>

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
                      checked={report?.testTypes?.includes(
                        "CONTENT_UNIFORMITY"
                      )}
                      readOnly
                      disabled
                    />
                    <span>Content Uniformity</span>
                  </label>
                </div>
              </div>

              {/* RIGHT */}
              <div className="px-2 grid items-center">
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <span className="font-medium mr-1 shrink-0">
                    SAMPLE COLLECTED :
                  </span>

                  <label className="inline-flex items-center gap-1 shrink-0">
                    <input
                      type="checkbox"
                      className="thick-box2"
                      name="sampleCollected"
                      checked={report?.sampleCollected?.includes("TOP_BEG")}
                      readOnly
                      disabled
                    />
                    <span>Top / Beg</span>
                  </label>

                  <label className="inline-flex items-center gap-1 shrink-0">
                    <input
                      type="checkbox"
                      name="sampleCollected"
                      className="thick-box2"
                      checked={report?.sampleCollected?.includes("MID")}
                      readOnly
                      disabled
                    />
                    <span>Mid</span>
                  </label>

                  <label className="inline-flex items-center gap-1 shrink-0">
                    <input
                      type="checkbox"
                      name="sampleCollected"
                      className="thick-box2"
                      checked={report?.sampleCollected?.includes("BOTTOM_END")}
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
                <span className="whitespace-nowrap font-medium">
                  SAMPLE SIZE :
                </span>
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
            <div className="px-2 text-[12px] grid grid-cols-[auto_1fr] items-stretch">
              {/* LEFT: Sample type */}
              <div className="flex max-w-[600px]   self-stretch border-r border-black">
                <span className="font-medium mr-1 whitespace-nowrap">
                  SAMPLE TYPE :
                </span>

                <div className="inline-flex border border-transparent">
                  <div className="grid grid-cols-4 grid-rows-2 gap-x-7 gap-y-1">
                    {sampleTypeItems.map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-1 whitespace-nowrap"
                      >
                        <input
                          type="checkbox"
                          className="thick-box2"
                          checked={report?.sampleTypes?.includes(key) ?? false}
                          readOnly
                          disabled
                        />
                        <span className="text-[10px]">{label}</span>

                        {/* ✅ STABILITY writing line (view mode) */}
                        {key === "STABILITY" && (
                          <input
                            type="text"
                            value={report?.stabilityNote ?? ""} // <-- use your field name here
                            readOnly
                            disabled
                            className="ml-1 w-[110px] border-0 border-b border-black/60 bg-transparent text-[11px] font-bold outline-none"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: Date received */}
              <div className="flex items-center gap-2 whitespace-nowrap pl-2">
                <span className="whitespace-nowrap font-medium">
                  DATE RECEIVED :
                </span>

                <input
                  type="date"
                  className="w-[80px] border-0 border-b border-black/60 outline-none text-[11px]"
                  value={formatDateForInput(report?.dateReceived ?? "")}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>

          {/* ---- ACTIVE TO BE TESTED TABLE ---- */}
          <div className="mt-0.5 border border-black text-[11px]">
            <div className="grid grid-cols-[25%_15%_11%_14%_15%_20%] font-semibold text-center border-b border-black">
              <div className="p-1 border-r border-black h-full flex items-center justify-center">
                ACTIVE TO BE TESTED
              </div>
              <div className="p-1 border-r border-black h-full flex items-center justify-center">
                RAW / BULK ACTIVE LOT #
              </div>
              <div className="p-1 border-r border-black h-full flex items-center justify-center">
                SOP # / VALIDATED
              </div>
              <div className="p-1 border-r border-black h-full flex items-center justify-center">
                FORMULA CONTENT
              </div>
              <div className="p-1 border-r border-black h-full flex items-center justify-center">
                RESULTS
              </div>
              <div className="p-1 whitespace-nowrap h-full flex items-center justify-center">
                DATE TESTED / INITIAL
              </div>
            </div>

            {(report?.actives || DEFAULT_CHEM_ACTIVES).map((row: any) => (
              <div
                key={row.key}
                className="grid grid-cols-[25%_15%_11%_14%_15%_20%] border-b last:border-b-0 border-black"
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
                {/* BULK ACTIVE LOT # */}
                <div className="border-r border-black px-1 ">
                  <input
                    className="w-full border-none outline-none text-[11px] text-center"
                    value={row.bulkActiveLot}
                    readOnly
                    disabled
                  />
                </div>

                {/* SOP # */}
                <div className="border-r border-black px-1 ">
                  <input
                    className="w-full border-none outline-none text-[11px] text-center"
                    value={row.sopNo}
                    readOnly
                    disabled
                  />
                </div>

                {/* formula content % */}
                <div className="border-r border-black px-1 flex items-center">
                  <div className="flex w-full items-center gap-1 whitespace-nowrap">
                    <input
                      className="min-w-0 flex-1 border-none outline-none text-[11px] text-center"
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
                      className="min-w-0 flex-1 border-none outline-none text-[11px] text-center"
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
                    className="w-full border-none outline-none text-[11px] text-center"
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
          <div className="mt-1 text-[10px]">
            NOTE : Turn Over time is at least 1 week. Biochem, Inc is not
            responsible for the release of any product not in the Biochem
            stability program.
          </div>

          {/* Comments + signatures */}
          <div className="mt- text-[12px]">
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
          {/* Footer: Logos + Confidential text + Report ID + QR */}
          <div
            className={
              isBulk
                ? "mt-1 flex items-end justify-between print-footer"
                : "mt-1 flex items-end justify-between print-footer"
            }
            style={
              !isBulk
                ? { pageBreakInside: "avoid", breakInside: "avoid" }
                : !isSingleBulk
                ? { pageBreakInside: "avoid", breakInside: "avoid" }
                : undefined
            }
          >
            {/* LEFT: logos on top, then confidential text */}
            {/* LEFT: logos + centered accreditation + confidential + footer note */}
            <div className="flex flex-col gap-2">
              {/* ✅ Logos row stays unchanged (no centering wrapper that can shift it) */}
              <div className="flex items-center gap-2">
                {FOOTER_IMAGES.map((img, idx) => (
                  <img
                    key={idx}
                    src={img.src}
                    alt={img.alt}
                    className="w-[64px] h-[64px] object-contain border border-black/10 rounded bg-white"
                  />
                ))}
              </div>

              {/* ✅ Center text WITHOUT moving logos:
      width = exact width of two logos + gap */}
              <div className="text-[8px] leading-tight text-slate-700 font-bold text-center w-[136px]">
                Accreditation No: <span className="font-bold">109344</span>
              </div>

              <div className="text-[10px] text-slate-600">
                This report is confidential and intended only for the recipient.
              </div>

              <div className="text-[10px] text-slate-600">{FOOTER_NOTE}</div>
            </div>

            {/* RIGHT: Report ID + QR */}
            <div className="flex items-end gap-3">
              <div className="text-right leading-tight">
                <div className="text-[11px] font-semibold">Report ID</div>
                <div className="mono text-[11px]">{report?.id}</div>
                {report?.reportNumber && (
                  <div className="text-[11px]">
                    Report # {report.reportNumber}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-slate-600">
                  Scan to open in LIMS
                </div>
              </div>

              {qrSvg ? (
                <div className="p-1 bg-white shrink-0" aria-label="Report QR">
                  <div
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
        </>
      ) : (
        // ATTACHMENTS PANE
        <div className="no-print">
          <AttachmentGallery reportId={report?.id} />
        </div>
      )}
    </div>
  );
}
