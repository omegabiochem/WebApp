// src/pages/Reports/COAReportFormView.tsx
import  { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import { api, API_URL, getToken } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

import pjla from "../../assets/pjla.png";
import ilacmra from "../../assets/ilacmra.png";

import {
  getCorrections,
  resolveCorrection,
  type CorrectionItem,
} from "../../utils/COAReportValidation";
import {
  FIELD_EDIT_MAP,
  STATUS_TRANSITIONS,
  type COAReportStatus,
  type Role,
} from "../../utils/COAReportFormWorkflow";

type Pane = "FORM" | "ATTACHMENTS";

type AttachmentItem = {
  id: string;
  filename: string;
  kind: string;
  createdAt: string;
};

type COAReportFormViewProps = {
  report: any;
  onClose: () => void;
  pane?: Pane; // controlled
  onPaneChange?: (p: Pane) => void;
  showSwitcher?: boolean; // default true
  isBulkPrint?: boolean;
  isSingleBulk?: boolean;
};

const attBase = (id: string) => `/chemistry-reports/${id}/attachments`; // ✅ COA lives under chemistry-reports in your API

const authHeaders = (): HeadersInit => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Blob fetch failed ${res.status}`);
  return await res.blob();
}

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
              <div className="mt-2 text-sm font-medium truncate" title={a.filename}>
                {a.filename}
              </div>
              <div className="text-xs text-slate-500">
                {a.kind} • {new Date(a.createdAt).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

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

function formatDateForInput(value: string | null) {
  if (!value || value === "NA") return "";
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

const DashStyles = () => (
  <style>{`
    .dash { position: relative; z-index: 5; isolation: isolate; }
    .dash::after{
      content:"";
      position:absolute;
      inset:-4px;
      border-radius:6px;
      pointer-events:none;
      z-index:10;
      background:
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0    0    /16px 2px repeat-x,
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0    100% /16px 2px repeat-x,
        linear-gradient(0deg,  var(--dash-color) 0 8px, transparent 8px 16px) 0    0    /2px  16px repeat-y,
        linear-gradient(0deg,  var(--dash-color) 0 8px, transparent 8px 16px) 100% 0    /2px  16px repeat-y;
      opacity:0;
      animation: dash-move 1.05s linear infinite;
    }
    .dash-red::after   { --dash-color:#dc2626; opacity:1; }
    .dash-green::after { --dash-color:#16a34a; opacity:1; }

    @keyframes dash-move {
      to {
        background-position:
          16px 0,
          -16px 100%,
          0 16px,
          100% -16px;
      }
    }
    @media (prefers-reduced-motion: reduce) { .dash::after { animation:none; } }
    @media print { .dash::after { display:none; } }
  `}</style>
);

function canEdit(role: Role | undefined, field: string, status?: COAReportStatus) {
  if (!role || !status) return false;
  const transition = STATUS_TRANSITIONS[status];
  if (!transition || !transition.canEdit?.includes(role)) return false;
  if (FIELD_EDIT_MAP[role]?.includes("*")) return true;
  return FIELD_EDIT_MAP[role]?.includes(field) ?? false;
}

function coaRowKey(rowKey: string) {
  return `coaRows:${rowKey}`;
}
function coaCellKey(rowKey: string, col: "Specification" | "result") {
  return `coaRows:${rowKey}:${col}`;
}

export default function COAReportFormView(props: COAReportFormViewProps) {
  const {
    report,
    onClose,
    isBulkPrint = false,
    pane,
    onPaneChange,
    showSwitcher = true,
    isSingleBulk = false,
  } = props;

  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  const status = (report?.status ?? "DRAFT") as COAReportStatus;

  // -------- panes (FORM / ATTACHMENTS) ----------
  const isControlled = typeof pane !== "undefined";
  const [internalPane, setInternalPane] = useState<Pane>("FORM");
  const activePane: Pane = isControlled ? (pane as Pane) : internalPane;

  const setActivePane = (p: Pane) => {
    if (!isControlled) setInternalPane(p);
    onPaneChange?.(p);
  };

  // auto-close on afterprint (same behavior you had)
  useEffect(() => {
    if (isBulkPrint) return;
    const onAfterPrint = () => onClose?.();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [onClose, isBulkPrint]);

  // -------- QR ----------
  const qrValue = report?.id
    ? JSON.stringify({ t: "coa", id: report.id })
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

  // -------- Corrections (read-only tray + red dashed highlighting) ----------
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  useEffect(() => {
    if (!report?.id) return;
    getCorrections(report.id)
      .then((list) => setCorrections(list))
      .catch(() => {});
  }, [report?.id]);

  const openCorrections = useMemo(
    () => corrections.filter((c) => c.status === "OPEN"),
    [corrections],
  );

  function hasOpenCorrectionKey(keyOrPrefix: string) {
    return openCorrections.some(
      (c) =>
        c.fieldKey === keyOrPrefix || c.fieldKey.startsWith(`${keyOrPrefix}:`),
    );
  }

  const [flash, setFlash] = useState<Record<string, boolean>>({});
  function flashResolved(field: string) {
    setFlash((m) => ({ ...m, [field]: true }));
    setTimeout(() => setFlash((m) => ({ ...m, [field]: false })), 1600);
  }

  const dashClass = (keyOrPrefix: string) =>
    hasOpenCorrectionKey(keyOrPrefix)
      ? "dash dash-red"
      : flash[keyOrPrefix]
        ? "dash dash-green"
        : "";

  const canResolveField = (fieldKey: string) => {
    if (!report?.id || !role) return false;
    const base = fieldKey.split(":")[0]; // "coaRows" etc.
    return canEdit(role, base, status);
  };

  async function resolveOne(c: CorrectionItem) {
    if (!report?.id) return;
    await resolveCorrection(report.id, c.id, "Fixed");
    const fresh = await getCorrections(report.id);
    setCorrections(fresh);
    flashResolved(c.fieldKey);
  }

  async function resolveField(fieldKey: string) {
    if (!report?.id) return;
    const items = openCorrections.filter((c) => c.fieldKey === fieldKey);
    if (!items.length) return;
    await Promise.all(items.map((c) => resolveCorrection(report.id, c.id, "Fixed")));
    const fresh = await getCorrections(report.id);
    setCorrections(fresh);
    flashResolved(fieldKey);
  }

  function ResolveOverlay({ field }: { field: string }) {
    if (!hasOpenCorrectionKey(field) || !canResolveField(field)) return null;
    return (
      <button
        type="button"
        title="Resolve all notes for this field"
        onClick={(e) => {
          e.stopPropagation();
          resolveField(field);
        }}
        className="absolute -top-2 -right-2 z-20 h-5 w-5 rounded-full grid place-items-center
                 bg-emerald-600 text-white shadow hover:bg-emerald-700 focus:outline-none
                 focus:ring-2 focus:ring-emerald-400"
      >
        ✓
      </button>
    );
  }

  // -------- signature blur rules (copy of your view behavior) ----------
  const BLUR_SIGNATURE_STATUSES = new Set<COAReportStatus>([
    "DRAFT",
    "SUBMITTED_BY_CLIENT",
    "CLIENT_NEEDS_CORRECTION",
    "UNDER_CLIENT_CORRECTION",
    "RESUBMISSION_BY_CLIENT",
    "UNDER_CLIENT_REVIEW",
    "UNDER_TESTING_REVIEW",
    "TESTING_ON_HOLD",
    "TESTING_NEEDS_CORRECTION",
    "RESUBMISSION_BY_TESTING",
    "UNDER_RESUBMISSION_TESTING_REVIEW",
  ]);
  const shouldBlurSignatures = BLUR_SIGNATURE_STATUSES.has(status);

  const HIDE_SIGNATURES_FOR = new Set<COAReportStatus>([
    "DRAFT",
    "SUBMITTED_BY_CLIENT",
  ]);
  const showSignatures = !HIDE_SIGNATURES_FOR.has(status);

  const FOOTER_IMAGES = [
    { src: pjla, alt: "FDA Registered" },
    { src: ilacmra, alt: "ISO Certified" },
  ];
  const FOOTER_NOTE = "Rev-00 [Date Effective : 01/01/2026]";

  const isBulk = isBulkPrint === true;

  const coaRows = (report?.coaRows ?? []) as Array<{
    key: string;
    item: string;
    Specification?: string | null;
    result?: string | null;
  }>;

  return (
    <>
      {!isBulk && <PrintStyles />}
      {!isBulk && <DashStyles />}

      <div
        className={
          isBulk
            ? "sheet bg-white text-black p-0 m-0"
            : "sheet relative mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4"
        }
      >
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
                  {report?.formNumber ?? ""}
                </div>

                <div className="text-[18px] font-bold text-center underline">
                  {status === "DRAFT" || status === "SUBMITTED_BY_CLIENT"
                    ? "COA SUBMISSION FORM"
                    : "COA REPORT"}
                </div>

                <div className="text-right text-[12px] font-bold">
                  {report?.reportNumber ?? ""}
                </div>
              </div>
            </div>

            {/* Header block */}
            <div className="w-full border border-black text-[12px]">
              <div className="grid grid-cols-[67%_33%] border-b border-black">
                <div className={`px-2 border-r border-black flex items-center gap-1 ${dashClass("client")} relative`}>
                  <div className="whitespace-nowrap font-medium">CLIENT :</div>
                  <ResolveOverlay field="client" />
                  <div className="flex-1 min-h-[14px]">{report?.client ?? ""}</div>
                </div>
                <div className={`px-2 flex items-center gap-1 relative ${dashClass("dateSent")}`}>
                  <div className="whitespace-nowrap font-medium">DATE SENT :</div>
                  <ResolveOverlay field="dateSent" />
                  <div className="flex-1 min-h-[14px]">
                    {formatDateForInput(report?.dateSent ?? "")}
                  </div>
                </div>
              </div>

              <div className={`border-b border-black flex items-center gap-2 px-2 relative ${dashClass("sampleDescription")}`}>
                <div className="w-40 font-medium">SAMPLE DESCRIPTION :</div>
                <ResolveOverlay field="sampleDescription" />
                <div className="flex-1 min-h-[14px]">{report?.sampleDescription ?? ""}</div>
              </div>

              {/* TYPE OF TEST (fixed) */}
              <div className="grid grid-cols-[100%] border-b border-black text-[12px]">
                <div className={`px-2 flex items-center gap-2 text-[12px] relative ${dashClass("testTypes")}`}>
                  <span className="font-medium whitespace-nowrap">TYPE OF TEST :</span>
                  <ResolveOverlay field="testTypes" />
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" checked={true} disabled className="accent-black" />
                    COA Verification
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-[50%_50%] border-b border-black text-[12px]">
                <div className={`px-2 border-r border-black flex items-center gap-2 relative ${dashClass("lotBatchNo")}`}>
                  <span className="font-medium whitespace-nowrap">LOT / BATCH # :</span>
                  <ResolveOverlay field="lotBatchNo" />
                  <div className="flex-1 min-h-[14px]">{report?.lotBatchNo ?? ""}</div>
                </div>
                <div className={`px-2 flex items-center gap-2 relative ${dashClass("manufactureDate")}`}>
                  <span className="font-medium whitespace-nowrap">MANUFACTURE DATE :</span>
                  <ResolveOverlay field="manufactureDate" />
                  <div className="flex-1 min-h-[14px]">
                    {formatDateForInput(report?.manufactureDate ?? "")}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[50%_50%] border-b border-black text-[12px]">
                <div className={`px-2 border-r border-black flex items-center gap-2 relative ${dashClass("formulaId")}`}>
                  <span className="font-medium whitespace-nowrap">FORMULA # / ID # :</span>
                  <ResolveOverlay field="formulaId" />
                  <div className="flex-1 min-h-[14px]">{report?.formulaId ?? ""}</div>
                </div>
                <div className={`px-2 flex items-center gap-2 relative ${dashClass("sampleSize")}`}>
                  <span className="font-medium whitespace-nowrap">SAMPLE SIZE :</span>
                  <ResolveOverlay field="sampleSize" />
                  <div className="flex-1 min-h-[14px]">{report?.sampleSize ?? ""}</div>
                </div>
              </div>

              <div className="px-2 py-1 flex items-center gap-2 whitespace-nowrap">
                <span className={`font-medium relative ${dashClass("dateReceived")}`}>
                  DATE RECEIVED :
                  <ResolveOverlay field="dateReceived" />
                </span>
                <div className="min-h-[14px]">
                  {formatDateForInput(report?.dateReceived ?? "")}
                </div>
              </div>
            </div>

            {/* COA TABLE (same structure + correction keys like your form) */}
            <div className={`mt-3 border text-[11px] border-black`}>
              <div className="grid grid-cols-[42%_29%_29%] font-semibold text-center border-b border-black min-h-[24px]">
                <div className="p-1 border-r border-black flex items-center justify-center">
                  Item
                </div>
                <div className="p-1 border-r border-black flex items-center justify-center">
                  Specification
                </div>
                <div className="p-1 flex items-center justify-center">Result</div>
              </div>

              {coaRows.map((row) => {
                const rk = coaRowKey(row.key);
                const kStd = coaCellKey(row.key, "Specification");
                const kRes = coaCellKey(row.key, "result");

                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-[42%_29%_29%] border-b last:border-b-0 border-black relative"
                  >
                    <div className={`p-1 border-r border-black font-medium ${dashClass(rk)} relative`}>
                      {row.item}
                      <ResolveOverlay field={rk} />
                    </div>

                    <div className={`border-r border-black px-1 py-1 whitespace-pre-wrap break-words relative ${dashClass(kStd)}`}>
                      <ResolveOverlay field={kStd} />
                      {row.Specification ?? ""}
                    </div>

                    <div className={`px-1 py-1 whitespace-pre-wrap break-words relative ${dashClass(kRes)}`}>
                      <ResolveOverlay field={kRes} />
                      {row.result ?? ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comments + signatures */}
            <div className="mt-2 text-[12px]">
              <div className="flex items-start gap-2 mb-2">
                <span className={`font-medium mt-[2px] relative ${dashClass("comments")}`}>
                  Comments :
                  <ResolveOverlay field="comments" />
                </span>
                <div className="flex-1 min-h-[42px] whitespace-pre-wrap break-words">
                  {report?.comments ?? ""}
                </div>
              </div>

              {showSignatures && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-medium">VERIFIED BY :</span>
                      <div
                        className={`flex-1 border-0 border-b border-black/60 min-h-[18px] ${
                          shouldBlurSignatures ? "blur-sm" : ""
                        }`}
                      >
                        {report?.testedBy ?? ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">DATE :</span>
                      <div
                        className={`flex-1 border-0 border-b border-black/60 min-h-[18px] ${
                          shouldBlurSignatures ? "blur-sm" : ""
                        }`}
                      >
                        {formatDateForInput(report?.testedDate ?? "")}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-medium">REVIEWED BY :</span>
                      <div
                        className={`flex-1 border-0 border-b border-black/60 min-h-[18px] ${
                          shouldBlurSignatures ? "blur-sm" : ""
                        }`}
                      >
                        {report?.reviewedBy ?? ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">REVIEWED DATE :</span>
                      <div
                        className={`flex-1 border-0 border-b border-black/60 min-h-[18px] ${
                          shouldBlurSignatures ? "blur-sm" : ""
                        }`}
                      >
                        {formatDateForInput(report?.reviewedDate ?? "")}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer: logos + report id + QR */}
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
                    <div className="text-[11px]">Report # {report.reportNumber}</div>
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

      {/* Floating Corrections tray (VIEW) */}
      {!isBulk && (
        <div className="no-print fixed bottom-20 right-6 z-40 w-[380px] overflow-hidden rounded-xl border bg-white/95 shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">
              Open corrections{" "}
              {openCorrections.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-rose-600 px-2 py-[1px] text-[11px] font-semibold text-white">
                  {openCorrections.length}
                </span>
              )}
            </div>
            <button
              className="rounded px-2 py-1 text-xs hover:bg-slate-100"
              onClick={() => {
                // quick hide by unmounting: you can wire this to state if you want a toggle button
                // for now: just close window tray by clearing list visual
                setCorrections((prev) => prev);
              }}
              title="Tray is always visible in view. If you want toggle button, tell me and I'll add."
            >
              ✕
            </button>
          </div>

          <div className="max-h-72 overflow-auto divide-y">
            {openCorrections.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">No open corrections.</div>
            ) : (
              openCorrections.map((c) => (
                <div key={c.id} className="p-3 text-sm">
                  <div className="text-[11px] font-bold text-black">{c.fieldKey}</div>
                  <div className="mt-1">Reason : {c.message}</div>

                  {c.oldValue != null && String(c.oldValue).trim() !== "" && (
                    <div className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Old Value :</span>{" "}
                      <span className="break-words">
                        {typeof c.oldValue === "string"
                          ? c.oldValue
                          : JSON.stringify(c.oldValue)}
                      </span>
                    </div>
                  )}

                  {canResolveField(c.fieldKey) && (
                    <div className="mt-2 flex gap-2">
                      <button
                        className="text-xs font-medium text-emerald-700 hover:underline"
                        onClick={() => resolveOne(c)}
                      >
                        ✓ Mark resolved
                      </button>
                      <button
                        className="text-xs text-slate-500 hover:underline"
                        onClick={() => resolveField(c.fieldKey)}
                        title="Resolve all notes for this field"
                      >
                        Resolve all for field
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}