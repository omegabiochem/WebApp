import { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import { api, API_URL, getToken } from "../../lib/api";
import pjla from "../../assets/pjla.png";
import ilacmra from "../../assets/ilacmra.png";
import {
  getCorrections,
  type CorrectionItem,
} from "../../utils/apeReportValidation";

type Pane = "FORM" | "REPORT" | "ATTACHMENTS";

type ApeReportFormViewProps = {
  report: any;
  onClose: () => void;
  pane?: Pane;
  onPaneChange?: (p: Pane) => void;
  showSwitcher?: boolean;
  isBulkPrint?: boolean;
  isSingleBulk?: boolean;
};

type AttachmentItem = {
  id: string;
  filename: string;
  kind: string;
  createdAt: string;
};

type ApeOrganismRow = {
  key: string;
  label: string;
  checked: boolean;
};

const APE_ORGANISM_DEFAULTS: ApeOrganismRow[] = [
  { key: "E_COLI", label: "E.coli", checked: false },
  { key: "P_AERUGINOSA", label: "p.aeruginosa", checked: false },
  { key: "S_AUREUS", label: "s.aureus", checked: false },
  { key: "C_ALBICANS", label: "c.albicans", checked: false },
  { key: "A_NIGER", label: "A.niger", checked: false },
  { key: "B_CEPACIA", label: "B.cepacia", checked: false },
];

// APE uses the generic reports endpoint in ApeReportForm.
const attBase = (id: string) => `/reports/${id}/attachments`;

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
        const metaResp = await api<AttachmentItem>(`${attBase(reportId)}/${attId}`);
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
  if (error) {
    return <div className="p-4 text-sm text-rose-600">Preview failed: {error}</div>;
  }
  if (!objectUrl) {
    return <div className="p-4 text-sm text-slate-500">Loading file…</div>;
  }

  const ext = meta.filename.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  const isPdf = ext === "pdf";

  return isImage ? (
    <img src={objectUrl} alt={meta.filename} className="h-full w-full object-contain" />
  ) : isPdf ? (
    <iframe src={objectUrl} title={meta.filename} className="h-full w-full" />
  ) : (
    <div className="flex h-full w-full items-center justify-center p-6 text-sm">
      Preview not available.
      <a className="ml-2 underline" href={objectUrl} download={meta.filename}>
        Download
      </a>
    </div>
  );
}

function AttachmentGallery({ reportId }: { reportId?: string }) {
  const { items, loading } = useAttachments(reportId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) {
    return <div className="no-print mt-4 text-sm text-slate-500">Loading attachments…</div>;
  }

  if (!items.length) {
    return <div className="no-print mt-4 text-sm text-slate-500">No attachments</div>;
  }

  return (
    <div className="no-print mt-4">
      <div className="mb-2 text-sm font-semibold">Attachments</div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  : window.open(`${API_URL}${filePath}`, "_blank")
              }
              className="group rounded-lg border bg-white p-3 text-left transition hover:shadow-sm"
              title="Click to preview"
            >
              <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded border bg-slate-50">
                {isImage ? (
                  <Thumb path={filePath} alt={a.filename} />
                ) : isPdf ? (
                  <div className="text-xs text-slate-600">PDF • click to preview</div>
                ) : (
                  <div className="text-xs uppercase text-slate-600">{ext || "file"}</div>
                )}
              </div>

              <div className="mt-2 truncate text-sm font-medium" title={a.filename}>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="h-[80vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-2">
              <div className="text-sm font-semibold">Preview</div>
              <button
                className="rounded border px-2 py-1 text-sm hover:bg-slate-50"
                onClick={() => setOpenId(null)}
              >
                Close
              </button>
            </div>

            <div className="h-full w-full">
              <AttachmentPreview reportId={reportId!} attId={openId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


const JJL_CREATED_BY_STATUSES = new Set([
  "DRAFT",
  "UNDER_DRAFT_REVIEW",
  "SUBMITTED_BY_CLIENT",
]);

function getJJLClientCode(report: any) {
  const explicitCode = String(report?.clientCode || "")
    .trim()
    .toUpperCase();
  if (explicitCode) return explicitCode;

  const formNumber = String(report?.formNumber || "").trim();
  const prefix = formNumber.match(/^([A-Za-z]{3})-/)?.[1]?.toUpperCase();
  if (prefix) return prefix;

  return String(report?.client || "").trim().toUpperCase();
}

function looksLikeUuid(value?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function getSuppliedCreatedByName(report: any) {
  const value = String(
    report?.createdByName ||
      report?.creatorName ||
      report?.createdByUser?.name ||
      "",
  ).trim();

  if (!value || looksLikeUuid(value)) {
    return "";
  }

  return value;
}

function useCreatedByName(report: any, detailsPath: string) {
  const [createdByName, setCreatedByName] = useState<string>(() =>
    getSuppliedCreatedByName(report),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCreatedByName() {
      const suppliedName = getSuppliedCreatedByName(report);

      if (suppliedName) {
        if (!cancelled) {
          setCreatedByName(suppliedName);
        }
        return;
      }

      if (report?.id && detailsPath) {
        try {
          const fullReport = await api<any>(detailsPath, {
            method: "GET",
          });

          const resolvedName = getSuppliedCreatedByName(fullReport);

          if (resolvedName) {
            if (!cancelled) {
              setCreatedByName(resolvedName);
            }
            return;
          }
        } catch (error) {
          console.error("Failed to resolve report creator:", error);
        }
      }

      if (!cancelled) {
        setCreatedByName("");
      }
    }

    loadCreatedByName();

    return () => {
      cancelled = true;
    };
  }, [
    report?.id,
    report?.createdBy,
    report?.createdByName,
    report?.creatorName,
    detailsPath,
  ]);

  return createdByName;
}

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

const DashStyles = () => (
  <style>{`
    .dash { position: relative; z-index: 0; }

    .dash::after {
      content: "";
      position: absolute;
      inset: -4px;
      border-radius: 6px;
      pointer-events: none;
      z-index: 10;
      background:
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 0 /16px 2px repeat-x,
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 100% /16px 2px repeat-x,
        linear-gradient(0deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 0 /2px 16px repeat-y,
        linear-gradient(0deg, var(--dash-color) 0 8px, transparent 8px 16px) 100% 0 /2px 16px repeat-y;
      opacity: 1;
      animation: dash-move 1.05s linear infinite;
    }

    .dash-red::after { --dash-color: #dc2626; }

    @keyframes dash-move {
      to {
        background-position:
          16px 0,
          -16px 100%,
          0 16px,
          100% -16px;
      }
    }

    @media print { .dash::after { display: none; } }
  `}</style>
);

function formatDateForInput(value: string | null | undefined) {
  if (!value) return "";
  if (value === "NA") return "NA";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toISOString().split("T")[0];
}

function normalizeOrganisms(value: any): ApeOrganismRow[] {
  if (!Array.isArray(value)) return APE_ORGANISM_DEFAULTS;

  const existing = new Map<string, ApeOrganismRow>();

  for (const item of value) {
    if (!item?.key) continue;
    existing.set(String(item.key), {
      key: String(item.key),
      label: String(item.label ?? item.key),
      checked: !!item.checked,
    });
  }

  return APE_ORGANISM_DEFAULTS.map((d) => existing.get(d.key) ?? d);
}

export default function ApeReportFormView(props: ApeReportFormViewProps) {
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

  const qrValue = report?.id ? JSON.stringify({ t: "report", id: report.id }) : "";
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
  const [internalPane, setInternalPane] = useState<Pane>("REPORT");

  const activePane: Pane = isControlled ? (pane as Pane) : internalPane;

  const setActivePane = (p: Pane) => {
    if (!isControlled) setInternalPane(p);
    onPaneChange?.(p);
  };

  const FOOTER_IMAGES = [
    { src: pjla, alt: "FDA Registered" },
    { src: ilacmra, alt: "ISO Certified" },
  ];

  const footerRevNo = report?.footerRevNo || "Rev-01";
  const footerDateEffective = report?.footerDateEffective
    ? new Date(report.footerDateEffective).toLocaleDateString("en-US", {
        timeZone: "UTC",
      })
    : "03/10/2026";

  const FOOTER_NOTE = `${footerRevNo} [Date Effective : ${footerDateEffective}]`;

  const BLUR_SIGNATURE_STATUSES = new Set([
    "DRAFT",
    "UNDER_DRAFT_REVIEW",
    "SUBMITTED_BY_CLIENT",
    "CLIENT_NEEDS_CORRECTION",
    "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
    "CLIENT_NEEDS_FINAL_CORRECTION",
    "FRONTDESK_NEEDS_CORRECTION",
    "TESTING_NEEDS_CORRECTION",
    "QA_NEEDS_CORRECTION",
    "ADMIN_NEEDS_CORRECTION",
    "FRONTDESK_ON_HOLD",
    "TESTING_ON_HOLD",
  ]);

  const shouldBlurSignatures = BLUR_SIGNATURE_STATUSES.has(report?.status);

  const HIDE_SIGNATURES_FOR = new Set([
    "DRAFT",
    "UNDER_DRAFT_REVIEW",
    "SUBMITTED_BY_CLIENT",
  ]);

  const isSubmissionFormPane = activePane === "FORM";
  const isReportPane = isBulk || activePane === "REPORT";
  const isFormPane = activePane === "FORM";

  const createdByName = useCreatedByName(
    report,
    report?.id ? `/reports/${report?.id}` : "",
  );

  const showJJLCreatedBy =
    isSubmissionFormPane &&
    getJJLClientCode(report) === "JJL" &&
    JJL_CREATED_BY_STATUSES.has(String(report?.status || "")) &&
    createdByName.trim().length > 0;

  const showSignatures = !HIDE_SIGNATURES_FOR.has(report?.status) && !isSubmissionFormPane;

  const blankIfForm = (value: any) => {
    if (isSubmissionFormPane) return "";
    return value ?? "";
  };

  const organisms = useMemo(() => normalizeOrganisms(report?.organisms), [report?.organisms]);

  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [showCorrTray, setShowCorrTray] = useState(false);

  const openCorrections = useMemo(
    () => corrections.filter((c) => c.status === "OPEN"),
    [corrections],
  );

  useEffect(() => {
    if (!report?.id) return;

    getCorrections(report.id)
      .then(setCorrections)
      .catch(() => setCorrections([]));
  }, [report?.id]);

  const hasOpenCorrection = (keyOrPrefix: string) =>
    openCorrections.some(
      (c) => c.fieldKey === keyOrPrefix || c.fieldKey.startsWith(`${keyOrPrefix}:`),
    );

  const dashClass = (keyOrPrefix: string) =>
    hasOpenCorrection(keyOrPrefix) ? "dash dash-red" : "";

  return (
    <div
      className={
        isBulk
          ? "sheet m-0 bg-white p-0 text-black"
          : "sheet relative mx-auto max-w-[800px] border border-black bg-white p-4 text-black shadow print:shadow-none"
      }
    >
      {!isBulk && <PrintStyles />}
      {!isBulk && <BlurStyles />}
      {!isBulk && <DashStyles />}

      {!isBulk && showSwitcher !== false && (
        <div className="no-print sticky top-0 z-40 -mx-4 mb-3 border-b bg-white/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2 py-2">
            {(["FORM", "REPORT", "ATTACHMENTS"] as Pane[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setActivePane(p)}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  activePane === p
                    ? "bg-blue-600 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {p === "ATTACHMENTS" ? "Attachment" : p[0] + p.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {isReportPane || isSubmissionFormPane ? (
        <>
          {/* Letterhead */}
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

            <div className="mt-1 grid grid-cols-3 items-center">
              <div className="text-left text-[12px] font-bold">
                {report?.formNumber || ""}
              </div>

              <div className="text-center text-[18px] font-bold underline">
                {isSubmissionFormPane ? "APE SUBMISSION FORM" : "APE REPORT"}
              </div>

              <div className="text-right text-[12px] font-bold">
                {!isFormPane && (report?.reportNumber || "")}
              </div>
            </div>
          </div>

          {/* Top meta block */}
          <div className="w-full border border-black text-[15px]">
            <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
              <div
                className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass("client")}`}
              >
                <div className="whitespace-nowrap font-medium">CLIENT:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={report?.client || ""}
                  readOnly
                  disabled
                />
              </div>

              <div
                className={`relative flex items-center gap-1 px-2 ${dashClass("dateSent")}`}
              >
                <div className="whitespace-nowrap font-medium">DATE SENT:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={formatDateForInput(report?.dateSent) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
              <div
                className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass("typeOfTest")}`}
              >
                <div className="whitespace-nowrap font-medium">TYPE OF TEST:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={report?.typeOfTest || ""}
                  readOnly
                  disabled
                />
              </div>

              <div
                className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass("sampleType")}`}
              >
                <div className="whitespace-nowrap font-medium">SAMPLE TYPE:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={report?.sampleType || ""}
                  readOnly
                  disabled
                />
              </div>

              <div
                className={`relative flex items-center gap-1 px-2 ${dashClass("formulaNo")}`}
              >
                <div className="whitespace-nowrap font-medium">FORMULA #:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={report?.formulaNo || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div
              className={`relative flex items-center gap-2 border-b border-black px-2 text-[12px] leading-snug ${dashClass("description")}`}
            >
              <div className="w-28 font-medium">DESCRIPTION:</div>
              <input
                className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                value={report?.description || ""}
                readOnly
                disabled
              />
            </div>

            <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
              <div
                className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass("lotNo")}`}
              >
                <div className="whitespace-nowrap font-medium">LOT #:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={report?.lotNo || ""}
                  readOnly
                  disabled
                />
              </div>

              <div
                className={`relative flex items-center gap-1 px-2 ${dashClass("manufactureDate")}`}
              >
                <div className="whitespace-nowrap font-medium">MANUFACTURE DATE:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={formatDateForInput(report?.manufactureDate) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
              <div
                className={`relative flex items-center gap-1 border-r border-black px-2 ${dashClass("testSopNo")}`}
              >
                <div className="whitespace-nowrap font-medium">TEST SOP #:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={blankIfForm(report?.testSopNo) || ""}
                  readOnly
                  disabled
                />
              </div>

              <div
                className={`relative flex items-center gap-1 px-2 ${dashClass("dateTested")}`}
              >
                <div className="whitespace-nowrap font-medium">DATE TESTED:</div>
                <input
                  className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                  value={blankIfForm(formatDateForInput(report?.dateTested)) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div
              className={`relative flex items-center gap-2 px-2 text-[12px] leading-snug ${dashClass("dateCompleted")}`}
            >
              <div className="whitespace-nowrap font-medium">DATE COMPLETED:</div>
              <input
                className="input-editable flex-1 py-[2px] text-[12px] leading-snug"
                value={blankIfForm(formatDateForInput(report?.dateCompleted)) || ""}
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="p-2 font-bold">
            ORGANISMS (Please check the organism to be tested)
          </div>

          <div
            className={`relative mt-2 border border-black ${dashClass("organisms")}`}
          >
            <div className="grid grid-cols-2 text-[12px]">
              {organisms.map((org, idx) => (
                <label
                  key={org.key}
                  className={`flex items-center gap-2 border-b border-black px-3 py-2 ${
                    idx % 2 === 0 ? "border-r border-black" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="thick-box"
                    checked={!!org.checked}
                    readOnly
                    disabled
                  />
                  <span className="font-bold">{org.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Legends */}
          {/* <div className="mt-2 text-[11px]">
            <div
              className="border-black p-2 font-bold"
              style={{ textDecoration: "underline" }}
            >
              DENOTES: NA (Not Applicable) / N.G. (No Growth) / GM.(+)B Gram (+)
              Bacilli / GM.(+)C Gram (+) Cocci / GM.NEG Gram Negative / NT (Not
              Tested) / TNTC (Too Numerous To Count)
            </div>
          </div> */}

          {/* Comments + Signatures */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div className={`relative col-span-2 ${dashClass("comments")}`}>
              <div className="flex items-start gap-2">
                <div className="whitespace-nowrap pt-[2px] font-medium">Comments :</div>

                <div className="relative h-[48px] flex-1">
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute left-0 right-0 top-[23px] border-b border-black/70" />
                    <div className="absolute left-0 right-0 top-[47px] border-b border-black/70" />
                  </div>

                  <textarea
                    rows={2}
                    className="relative z-10 h-[48px] w-full resize-none overflow-hidden border-0 bg-transparent pl-2 pt-0 pb-0 text-[12px] leading-[24px] outline-none focus:ring-0"
                    value={report?.comments || ""}
                    readOnly
                  />
                </div>
              </div>
            </div>

            {showSignatures && (
              <>
                <div className="p-2">
                  <div
                    className={`relative mb-2 flex items-center gap-2 font-medium ${dashClass("testedBy")}`}
                  >
                    TESTED BY:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                        shouldBlurSignatures ? "blur-field" : ""
                      }`}
                      value={report?.testedBy || ""}
                      readOnly
                      disabled
                    />
                  </div>

                  <div
                    className={`relative mt-2 flex items-center gap-2 font-medium ${dashClass("testedDate")}`}
                  >
                    DATE:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                        shouldBlurSignatures ? "blur-field" : ""
                      }`}
                      value={formatDateForInput(report?.testedDate) || ""}
                      readOnly
                      disabled
                    />
                  </div>
                </div>

                <div className="p-2">
                  <div
                    className={`relative mb-2 flex items-center gap-2 font-medium ${dashClass("reviewedBy")}`}
                  >
                    REVIEWED BY:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                        shouldBlurSignatures ? "blur-field" : ""
                      }`}
                      value={report?.reviewedBy || ""}
                      readOnly
                      disabled
                    />
                  </div>

                  <div
                    className={`relative mt-2 flex items-center gap-2 font-medium ${dashClass("reviewedDate")}`}
                  >
                    DATE:
                    <input
                      className={`flex-1 border-0 border-b border-black/70 text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
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
            className="print-footer mt-2 flex items-end justify-between"
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
                    className="h-[64px] w-[64px] rounded border border-black/10 bg-white object-contain"
                  />
                ))}
              </div>

              <div className="w-[136px] text-center text-[8px] font-bold leading-tight text-slate-700">
                Accreditation No: <span className="font-bold">109344</span>
              </div>

              <div className="text-[10px] text-slate-600">
                This report is confidential and intended only for the recipient.
              </div>

              <div className="text-[10px] text-slate-600">{FOOTER_NOTE}</div>

              {showJJLCreatedBy && (
                <div className="text-left text-[10px] text-black">
                  <span className="font-semibold">Created by:</span>{" "}
                  <span>{createdByName}</span>
                </div>
              )}
            </div>

            <div className="flex items-end gap-3">
              <div className="text-right leading-tight">
                <div className="text-[11px] font-semibold">Report ID</div>
                <div className="mono text-[11px]">{report?.id}</div>

                {!isFormPane && report?.reportNumber && (
                  <div className="text-[11px]">Report # {report.reportNumber}</div>
                )}

                <div className="mt-1 text-[10px] text-slate-600">
                  Scan to open in LIMS
                </div>
              </div>

              {qrSvg ? (
                <div className="shrink-0 bg-white p-1" aria-label="Report QR">
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

      {!isBulk && openCorrections.length > 0 && (
        <div className="no-print fixed bottom-20 right-6 z-40">
          <button
            type="button"
            onClick={() => setShowCorrTray((s) => !s)}
            className="rounded-full border bg-white/95 px-4 py-2 text-sm shadow-lg hover:bg-white"
          >
            📝 Corrections
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-rose-600 px-2 py-[1px] text-[11px] font-semibold text-white">
              {openCorrections.length}
            </span>
          </button>
        </div>
      )}

      {!isBulk && showCorrTray && (
        <div className="no-print fixed bottom-20 right-6 z-40 w-[380px] overflow-hidden rounded-xl border bg-white/95 shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">Open corrections</div>
            <button
              type="button"
              className="rounded px-2 py-1 text-xs hover:bg-slate-100"
              onClick={() => setShowCorrTray(false)}
            >
              ✕
            </button>
          </div>

          <div className="max-h-72 divide-y overflow-auto">
            {openCorrections.map((c) => (
              <div key={c.id} className="p-3 text-sm">
                <div className="text-[11px] font-medium text-slate-500">
                  {c.fieldKey}
                </div>

                <div className="mt-1">Reason: {c.message}</div>

                {c.oldValue != null && String(c.oldValue).trim() !== "" && (
                  <div className="mt-1 text-xs text-slate-600">
                    <span className="font-medium">Old Value:</span>{" "}
                    <span className="break-words">
                      {typeof c.oldValue === "string" ? c.oldValue : JSON.stringify(c.oldValue)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
