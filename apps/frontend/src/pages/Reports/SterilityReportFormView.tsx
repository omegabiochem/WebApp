import { useEffect, useState } from "react";
import * as QRCode from "qrcode";
import { api, API_URL, getToken } from "../../lib/api";
import pjla from "../../assets/pjla.png";
import ilacmra from "../../assets/ilacmra.png";

type Pane = "FORM" | "ATTACHMENTS";

type SterilityReportFormViewProps = {
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

const attBase = (id: string) => `/reports/sterility/${id}/attachments`;

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

      {/* modal */}
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    (async () => {
      try {
        const metaResp = await api<AttachmentItem>(
          `${attBase(reportId)}/${attId}`,
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

// ---------------- Print / blur styles ----------------

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
      img, svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      img { image-rendering: pixelated; image-rendering: crisp-edges; }
    }
  `}</style>
);

const BlurStyles = () => (
  <style>{`
    .blur-field { filter: blur(4px); pointer-events: none; user-select: none; }
    @media print { .blur-field { filter: blur(3px); } }
  `}</style>
);

function formatDateForInput(value: string | null | undefined) {
  if (!value) return "";
  if (value === "NA") return "NA";
  return new Date(value).toISOString().split("T")[0];
}

export default function SterilityReportFormView(
  props: SterilityReportFormViewProps,
) {
  const {
    report,
    onClose,
    pane,
    onPaneChange,
    showSwitcher = true,
    isBulkPrint = false,
    isSingleBulk = false,
  } = props;

  const isBulk = isBulkPrint === true;

  const qrValue = report?.id
    ? JSON.stringify({ t: "report", id: report.id })
    : "";

  const [qrSvg, setQrSvg] = useState<string>("");

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

  // ✅ Keep these simple. Update if you want stricter/looser blur.
  const BLUR_SIGNATURE_STATUSES = new Set([
    "DRAFT",
    "SUBMITTED_BY_CLIENT",
    "CLIENT_NEEDS_CORRECTION",
    "FRONTDESK_NEEDS_CORRECTION",
    "TESTING_NEEDS_CORRECTION",
    "QA_NEEDS_CORRECTION",
    "ADMIN_NEEDS_CORRECTION",
    "FRONTDESK_ON_HOLD",
    "TESTING_ON_HOLD",
  ]);

  const shouldBlurSignatures = BLUR_SIGNATURE_STATUSES.has(report?.status);

  const HIDE_SIGNATURES_FOR = new Set(["DRAFT", "SUBMITTED_BY_CLIENT"]);
  const showSignatures = !HIDE_SIGNATURES_FOR.has(report?.status);

  const obs = (v: any) => (v === "Growth" || v === "No Growth" ? v : "");

  return (
    <div
      className={
        isBulk
          ? "sheet bg-white text-black p-0 m-0"
          : "sheet relative mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4"
      }
    >
      {!isBulk && <PrintStyles />}
      {!isBulk && <BlurStyles />}

      {/* Switcher */}
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

      {isBulk || activePane === "FORM" ? (
        <>
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
              56 PARK AVENUE, LYNDHURST, NJ 07071 <br />
              Tel: (201) 883 1222 • Fax: (201) 883 0449
            </div>
            <div className="text-[12px]">
              Email: <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
            </div>

            <div className="mt-1 grid grid-cols-3 items-center">
              <div className="text-left text-[12px] font-bold">
                {report?.formNumber || ""}
              </div>

              <div className="text-center text-[18px] font-bold underline">
                {report?.status === "DRAFT" ||
                report?.status === "SUBMITTED_BY_CLIENT"
                  ? "STERILITY SUBMISSION FORM"
                  : "STERILITY REPORT"}
              </div>

              <div className="text-right text-[12px] font-bold">
                {report?.reportNumber || ""}
              </div>
            </div>
          </div>

          {/* Top meta block */}
          <div className="w-full border border-black text-[15px]">
            <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
              <div className="px-2 border-r border-black flex items-center gap-1">
                <div className="whitespace-nowrap font-medium">CLIENT:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.client || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="px-2 flex items-center gap-1">
                <div className="whitespace-nowrap font-medium">DATE SENT:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={formatDateForInput(report?.dateSent) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
              <div className="px-2 border-r border-black flex items-center gap-1">
                <div className="font-medium whitespace-nowrap">
                  TYPE OF TEST:
                </div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.typeOfTest || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="px-2 border-r border-black flex items-center gap-1">
                <div className="font-medium whitespace-nowrap">
                  SAMPLE TYPE:
                </div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.sampleType || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="px-2 flex items-center gap-1">
                <div className="font-medium whitespace-nowrap">FORMULA #:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.formulaNo || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug">
              <div className="w-28 font-medium">DESCRIPTION:</div>
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={report?.description || ""}
                readOnly
                disabled
              />
            </div>

            <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
              <div className="px-2 border-r border-black flex items-center gap-1">
                <div className="font-medium whitespace-nowrap">LOT #:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.lotNo || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="px-2 flex items-center gap-1">
                <div className="font-medium whitespace-nowrap">
                  MANUFACTURE DATE:
                </div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={formatDateForInput(report?.manufactureDate) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
              <div className="px-2 border-r border-black flex items-center gap-1">
                <div className="font-medium whitespace-nowrap">TEST SOP #:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.testSopNo || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="px-2 flex items-center gap-1">
                <div className="font-medium whitespace-nowrap">
                  DATE TESTED:
                </div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={formatDateForInput(report?.dateTested) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="flex items-center gap-2 px-2 text-[12px] leading-snug">
              <div className="font-medium whitespace-nowrap">
                DATE COMPLETED:
              </div>
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={formatDateForInput(report?.dateCompleted) || ""}
                readOnly
                disabled
              />
            </div>
          </div>

          {/* ✅ Sterility table (matches your new form) */}
          <div className="mt-12 border border-black">
            <div className="grid grid-cols-[35%_15%_30%_20%] text-[12px] text-center items-center font-semibold border-b border-black">
              <div className="p-2 border-r border-black">MEDIA</div>
              <div className="p-2 border-r border-black">TURBIDITY</div>
              <div className="p-2 border-r border-black">OBSERVATION</div>
              <div className="p-2 border-r border-black">RESULT</div>
            </div>

            {/* FTM */}
            <div className="grid grid-cols-[35%_15%_30%_20%] text-[12px] border-b border-black">
              <div className="py-1 px-2 font-bold border-r border-black">
                Fluid Thioglycollate Medium (FTM)
              </div>
              <div className="py-1 px-2 border-r border-black">
                <input
                  className="w-full input-editable px-1"
                  value={report?.ftm_turbidity || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="py-1 px-2 border-r border-black">
                <input
                  className="w-full input-editable px-1"
                  value={obs(report?.ftm_observation) || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="py-1 px-2 border-r border-black">
                <input
                  className="w-full input-editable px-1"
                  value={report?.ftm_result || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            {/* SCDB */}
            <div className="grid grid-cols-[35%_15%_30%_20%] text-[12px]">
              <div className="py-1 px-2 font-bold border-r border-black">
                Soybean Casein Digest Broth (SCDB)
              </div>
              <div className="py-1 px-2 border-r border-black">
                <input
                  className="w-full input-editable px-1"
                  value={report?.scdb_turbidity || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="py-1 px-2 border-r border-black">
                <input
                  className="w-full input-editable px-1"
                  value={obs(report?.scdb_observation) || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="py-1 px-2 border-r border-black">
                <input
                  className="w-full input-editable px-1"
                  value={report?.scdb_result || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>

          {/* ----- Volume of sample table + notes (from image) ----- */}
          <div className="mt-10 text-[12px] leading-snug">
            <div className="mb-2 font-semibold text-[13px]">
              Volume of sample used during the test is defined in the table
              based on the volume of final product.
            </div>

            <div className="border border-black">
              <div className="grid grid-cols-2 border-b border-black font-semibold">
                <div className="px-2 py-1 border-r border-black font-bold items-center text-center">
                  Volume of Final Product
                </div>
                <div className="px-2 py-1 font-bold items-center text-center">
                  Volume used for Each Sample
                </div>
              </div>

              <div className="grid grid-cols-2 border-b border-black items-center text-center">
                <div className="px-2 py-1 border-r border-black">&lt; 1 ml</div>
                <div className="px-2 py-1">Entire Unit</div>
              </div>

              <div className="grid grid-cols-2 border-b border-black items-center text-center">
                <div className="px-2 py-1 border-r border-black">1-40 ml</div>
                <div className="px-2 py-1">50% of Volume but NLT 1 ml</div>
              </div>

              <div className="grid grid-cols-2 border-b border-black items-center text-center">
                <div className="px-2 py-1 border-r border-black">41-100 ml</div>
                <div className="px-2 py-1">20 ml</div>
              </div>

              <div className="grid grid-cols-2 items-center text-center">
                <div className="px-2 py-1 border-r border-black">
                  &gt; 100 ml
                </div>
                <div className="px-2 py-1">
                  10% of volume but at least 20 ml
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div>
                The Fluid Thioglycollate Medium (FTM) tests for Anaerobic
                Bacteria, but will also grow Aerobic Bacteria is incubated for
                14 days at 32.5 ± 2.5°C.
              </div>

              <div>
                The Soybean Casein Digest Medium (SCDM) tests for Aerobic
                Bacteria and Fungi is incubated for 14 days at 22.5
              </div>

              <div>
                No Growth was observed in the Negative Control. Growth was
                observed in the Positive Control.
              </div>

              <div className="font-semibold">
                Abbreviations (+) <span className="underline">Growth</span> (-)
                No Growth (P) Pass F (Fail) NI (Not Interpreted)
              </div>
            </div>
          </div>

          {/* Legends */}
          <div className="mt-4 text-[11px]">
            <div
              className="font-bold border-black"
              style={{ textDecoration: "underline" }}
            >
              DENOTES: NA (Not Applicable) / N.G. (No Growth) / NT (Not Tested)
            </div>
          </div>

          {/* Comments + Signatures */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div className="p2 col-span-2 flex">
              <div className="mb-1 font-medium">Comments:</div>
              <input
                className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none pl-2"
                value={report?.comments || ""}
                readOnly
                disabled
              />
            </div>

            {showSignatures && (
              <>
                <div className="p-2">
                  <div className="font-medium mb-2 flex items-center gap-2">
                    TESTED BY:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none ${
                        shouldBlurSignatures ? "blur-field" : ""
                      }`}
                      value={report?.testedBy || ""}
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="font-medium mt-2 flex items-center gap-2">
                    DATE:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none ${
                        shouldBlurSignatures ? "blur-field" : ""
                      }`}
                      value={formatDateForInput(report?.testedDate) || ""}
                      readOnly
                      disabled
                    />
                  </div>
                </div>

                <div className="p-2">
                  <div className="font-medium mb-2 flex items-center gap-2">
                    REVIEWED BY:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none ${
                        shouldBlurSignatures ? "blur-field" : ""
                      }`}
                      value={report?.reviewedBy || ""}
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="font-medium mt-2 flex items-center gap-2">
                    DATE:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none ${
                        shouldBlurSignatures ? "blur-field" : ""
                      }`}
                      value={formatDateForInput(report?.reviewedDate) || ""}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div
            className="mt-2 flex items-end justify-between print-footer"
            style={
              !isBulk
                ? { pageBreakInside: "avoid", breakInside: "avoid" }
                : !isSingleBulk
                  ? { pageBreakInside: "avoid", breakInside: "avoid" }
                  : undefined
            }
          >
            <div className="flex flex-col gap-2">
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

              <div className="text-[8px] leading-tight text-slate-700 font-bold text-center w-[136px]">
                Accreditation No: <span className="font-bold">109344</span>
              </div>

              <div className="text-[10px] text-slate-600">
                This report is confidential and intended only for the recipient.
              </div>

              <div className="text-[10px] text-slate-600">{FOOTER_NOTE}</div>
            </div>

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
        <div className="no-print">
          <AttachmentGallery reportId={report?.id} />
        </div>
      )}
    </div>
  );
}
