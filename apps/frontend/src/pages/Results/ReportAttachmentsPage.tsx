import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, API_URL, getToken } from "../../lib/api";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { logUiEvent } from "../../lib/uiAudit";

type ReportType = "MICRO" | "MICRO_WATER" | "CHEMISTRY" | "STERILITY" | "COA"; // keep in sync with backend enum (and add new types there as needed)
type ReportTypeFilter = "ALL" | ReportType;

type AttachmentItem = {
  id: string;
  reportType: ReportType;
  reportId: string;
  filename: string;
  kind: "SIGNED_FORM" | "RAW_SCAN" | "OTHER" | string;
  createdAt: string;
  createdBy?: string | null;
  pages?: number | null;
  source?: string | null;

  // ✅ add these
  formNumber?: string | null;
  reportNumber?: string | null;
  clientCode?: string | null;
  formType?: string | null;
};

type ViewMode = "GRID" | "TABLE";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const authHeaders = (): HeadersInit => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const fileById = (attId: string) => `/attachments/${attId}/file`;

async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Blob fetch failed ${res.status}`);
  return await res.blob();
}

/** Merges PDFs and triggers browser print in new tab */
async function mergeAndPrintSelectedPdfs(ids: string[]) {
  // Open tab immediately from the user click
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error("Popup blocked. Please allow popups to print PDFs.");
  }

  // Optional loading text
  printWindow.document.write(`
    <html>
      <head><title>Preparing PDF...</title></head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        Preparing PDF for print...
      </body>
    </html>
  `);
  printWindow.document.close();

  try {
    const res = await fetch(`${API_URL}/attachments/merge-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      try {
        printWindow.close();
      } catch {}
      throw new Error(`Merge failed ${res.status}: ${text || "Unknown error"}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    // Reuse the already-opened tab
    printWindow.location.href = url;

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } finally {
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 30000);
      }
    }, 1000);
  } catch (err) {
    try {
      printWindow.close();
    } catch {}
    throw err;
  }
}

async function mergeSelectedPdfsToUrl(ids: string[]) {
  const res = await fetch(`${API_URL}/attachments/merge-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ ids }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Merge failed ${res.status}: ${text || "Unknown error"}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    filename:
      ids.length === 1
        ? "attachment.pdf"
        : `merged-${ids.length}-attachments.pdf`,
  };
}

function fileExt(filename: string) {
  return (filename.split(".").pop() || "").toLowerCase();
}

function fileTypeFromExt(ext: string): "image" | "pdf" | "other" {
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

function toDateOnlyISO_UTC(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayISO(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return dt.toISOString();
}
function endOfDayISO(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return dt.toISOString();
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function matchesDateRange(createdAtISO: string, from?: string, to?: string) {
  if (!from && !to) return true;
  const t = new Date(createdAtISO).getTime();
  if (from) {
    const fromT = new Date(startOfDayISO(from)).getTime();
    if (t < fromT) return false;
  }
  if (to) {
    const toT = new Date(endOfDayISO(to)).getTime();
    if (t > toT) return false;
  }
  return true;
}

// report links
function reportLinkFor(type: ReportType, reportId: string) {
  if (type === "CHEMISTRY") return `/reports/chemistry-mix/${reportId}`;
  if (type === "MICRO_WATER") return `/reports/micro-mix-water/${reportId}`;
  if (type === "STERILITY") return `/reports/sterility/${reportId}`;
  if (type === "COA") return `/reports/coa/${reportId}`;
  return `/reports/micro-mix/${reportId}`;
}

function reportTypeLabel(t: ReportTypeFilter) {
  if (t === "ALL") return "All";
  if (t === "MICRO") return "Micro";
  if (t === "MICRO_WATER") return "Micro Water";
  if (t === "STERILITY") return "Sterility";
  if (t === "COA") return "COA";
  return "Chemistry";
}

// -----------------------------
// UI helpers
// -----------------------------
function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white ${className}`}
      aria-hidden="true"
    />
  );
}
function SpinnerDark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 ${className}`}
      aria-hidden="true"
    />
  );
}

// -----------------------------
// Audit helper (ONLY events you listed)
// -----------------------------
function logAttachEvent(args: {
  action:
    | "UI_VIEW_ATTACHMENTS_PAGE"
    | "UI_ATTACHMENTS_LOADED"
    | "UI_ATTACHMENTS_PREVIEW_OPEN"
    | "UI_ATTACHMENTS_PREVIEW_CLOSE"
    | "UI_ATTACHMENTS_OPEN_FILE"
    | "UI_ATTACHMENTS_OPEN_REPORT"
    | "UI_ATTACHMENTS_PRINT_SELECTED"
    | "UI_ATTACHMENTS_PRINT_SINGLE"
    | "UI_ATTACHMENTS_PRINT_PREPARED"
    | "UI_ATTACHMENTS_PRINT_FAILED"
    | "UI_ATTACHMENTS_DOWNLOAD_SINGLE";
  details: string;
  entityId?: string | null;
  meta?: any;
  formNumber?: string | null;
  reportNumber?: string | null;
  formType?: string | null;
  clientCode?: string | null;
}) {
  logUiEvent({
    action: args.action,
    entity: "Attachment",
    entityId: args.entityId ?? undefined,
    details: args.details,
    meta: args.meta ?? undefined,
    formNumber: args.formNumber ?? null,
    reportNumber: args.reportNumber ?? null,
    formType: args.formType ?? null,
    clientCode: args.clientCode ?? null,
  });
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
    <div className="text-xs text-slate-600">Preview</div>
  );
}

function AttachmentPreview({
  attId,
  filename,
  onClose,
  onPrint,
  onDownload,
  printingSingle,
}: {
  attId: string;
  filename: string;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
  printingSingle: boolean;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;

    (async () => {
      try {
        const blob = await apiBlob(fileById(attId));
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
  }, [attId]);

  const ext = fileExt(filename);
  const type = fileTypeFromExt(ext);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-6xl w-full h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" title={filename}>
              {filename}
            </div>
            <div className="text-xs text-slate-500">{attId}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={printingSingle}
              onClick={onPrint}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-200 disabled:opacity-60"
            >
              {printingSingle ? <SpinnerDark /> : "🖨️"}
              {printingSingle ? "Preparing..." : "Print"}
            </button>

            {objectUrl && (
              <a
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
                href={objectUrl}
                download={filename}
                onClick={() => {
                  // still allow browser download
                  onDownload();
                }}
              >
                Download
              </a>
            )}

            <button
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="w-full h-[calc(85vh-72px)] bg-white">
          {error ? (
            <div className="p-6 text-sm text-rose-600">
              Preview failed: {error}
            </div>
          ) : !objectUrl ? (
            <div className="p-6 text-sm text-slate-500">Loading…</div>
          ) : type === "image" ? (
            <img
              src={objectUrl}
              alt={filename}
              className="w-full h-full object-contain"
            />
          ) : type === "pdf" ? (
            <iframe
              src={objectUrl}
              title={filename}
              className="w-full h-full"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center p-6 text-sm">
              Preview not available.
              <a
                className="ml-2 underline"
                href={objectUrl}
                download={filename}
              >
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Print root (portal) - prints selected attachments (images only)
// -----------------------------
function BulkPrintAttachmentsArea({
  items,
  onAfterPrint,
  onPrepared,
}: {
  items: AttachmentItem[];
  onAfterPrint: () => void;
  onPrepared?: (args: { count: number; ids: string[] }) => void;
}) {
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const revokeList: string[] = [];

    (async () => {
      try {
        setReady(false);

        const entries = await Promise.all(
          items.map(async (a) => {
            const ft = fileTypeFromExt(fileExt(a.filename));
            if (!(ft === "image" || ft === "pdf")) return [a.id, ""] as const;

            const blob = await apiBlob(fileById(a.id));
            const url = URL.createObjectURL(blob);
            revokeList.push(url);
            return [a.id, url] as const;
          }),
        );

        if (!mounted) return;

        const map: Record<string, string> = {};
        for (const [id, url] of entries) if (url) map[id] = url;

        setUrls(map);
        setReady(true);

        onPrepared?.({ count: items.length, ids: items.map((x) => x.id) });

        setTimeout(async () => {
          await waitForAssets();
          window.print();
        }, 50);
      } catch {
        if (!mounted) return;
        setUrls({});
        setReady(true);
        onPrepared?.({ count: items.length, ids: items.map((x) => x.id) });
        setTimeout(() => window.print(), 200);
      }
    })();

    const handleAfterPrint = () => onAfterPrint();
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      mounted = false;
      window.removeEventListener("afterprint", handleAfterPrint);
      revokeList.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [items, onAfterPrint, onPrepared]);

  if (!items.length) return null;

  function waitForAssets(rootId = "bulk-print-root") {
    return new Promise<void>((resolve) => {
      const root = document.getElementById(rootId);
      if (!root) return resolve();

      const imgs = Array.from(
        root.querySelectorAll("img"),
      ) as HTMLImageElement[];
      const objs = Array.from(
        root.querySelectorAll("object"),
      ) as HTMLObjectElement[];

      let pending = 0;
      const done = () => {
        pending -= 1;
        if (pending <= 0) resolve();
      };

      imgs.forEach((img) => {
        if (img.complete && img.naturalWidth > 0) return;
        pending += 1;
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });

      objs.forEach(() => {
        pending += 1;
        setTimeout(done, 400);
      });

      if (pending === 0) resolve();
    });
  }

  return (
    <div id="bulk-print-root" className="hidden print:block">
      {!ready ? (
        <div className="p-6 text-sm text-slate-600">Preparing print…</div>
      ) : (
        items.map((a) => {
          const ft = fileTypeFromExt(fileExt(a.filename));
          const url = urls[a.id];

          return (
            <div key={a.id} className="report-page">
              <div className="mb-2 text-xs text-slate-700 print:text-black">
                <div className="font-semibold">{a.filename}</div>
                <div className="font-mono">{a.id}</div>
                <div>
                  {a.reportType} • {a.kind} •{" "}
                  {new Date(a.createdAt).toLocaleString()}
                </div>
              </div>

              {ft === "image" && url ? (
                <img
                  src={url}
                  alt={a.filename}
                  className="w-full h-auto object-contain border rounded"
                />
              ) : ft === "pdf" && url ? (
                <object
                  data={url}
                  type="application/pdf"
                  className="w-full h-[90vh] border rounded"
                >
                  <div className="text-sm">
                    PDF preview failed.{" "}
                    <a className="underline" href={url}>
                      Open
                    </a>
                  </div>
                </object>
              ) : (
                <div className="text-sm text-slate-600">
                  Cannot print (not printable or failed to load).
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function BulkPdfPreviewModal({
  url,
  filename,
  onClose,
  onPrint,
}: {
  url: string;
  filename: string;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-6xl w-full h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" title={filename}>
              {filename}
            </div>
            <div className="text-xs text-slate-500">Merged PDF preview</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-200"
            >
              🖨️ Print
            </button>

            <a
              href={url}
              download={filename}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            >
              Download
            </a>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="w-full h-[calc(85vh-72px)] bg-white">
          <iframe src={url} title={filename} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}

function printPdfFromUrl(url: string) {
  const w = window.open("", "_blank");

  if (!w) {
    throw new Error("Popup blocked. Please allow popups to print PDFs.");
  }

  w.document.write(`
    <html>
      <head><title>Preparing PDF...</title></head>
      <body style="margin:0">
        <iframe
          src="${url}"
          style="border:none;width:100vw;height:100vh;"
          onload="setTimeout(() => { window.focus(); window.print(); }, 800)"
        ></iframe>
      </body>
    </html>
  `);
  w.document.close();
}

type DatePreset =
  | ""
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7"
  | "LAST_30"
  | "THIS_MONTH"
  | "LAST_MONTH";

const DEFAULT_ATTACHMENT_FILTERS = {
  view: "GRID" as ViewMode,
  q: "",
  kind: "ALL",
  fileType: "ALL" as "ALL" | "image" | "pdf" | "other",
  createdBy: "ALL",
  source: "ALL",
  fromDate: "",
  toDate: "",
  reportType: "ALL" as ReportTypeFilter,
  sort: "NEWEST" as
    | "NEWEST"
    | "OLDEST"
    | "FILENAME_AZ"
    | "FILENAME_ZA"
    | "KIND",
  datePreset: "" as DatePreset,
};

function getInitialAttachmentFilters(
  searchParams: URLSearchParams,
  storageKey: string,
) {
  try {
    const spView = searchParams.get("view");
    const spQ = searchParams.get("q");
    const spKind = searchParams.get("kind");
    const spFileType = searchParams.get("fileType");
    const spCreatedBy = searchParams.get("createdBy");
    const spSource = searchParams.get("source");
    const spFrom = searchParams.get("from");
    const spTo = searchParams.get("to");
    const spReportType = searchParams.get("reportType");
    const spSort = searchParams.get("sort");
    const spDatePreset = searchParams.get("datePreset");

    const hasUrlFilters =
      spView ||
      spQ ||
      spKind ||
      spFileType ||
      spCreatedBy ||
      spSource ||
      spFrom ||
      spTo ||
      spReportType ||
      spSort ||
      spDatePreset;

    if (hasUrlFilters) {
      return {
        view: (spView as ViewMode) || DEFAULT_ATTACHMENT_FILTERS.view,
        q: spQ || DEFAULT_ATTACHMENT_FILTERS.q,
        kind: spKind || DEFAULT_ATTACHMENT_FILTERS.kind,
        fileType:
          (spFileType as "ALL" | "image" | "pdf" | "other") ||
          DEFAULT_ATTACHMENT_FILTERS.fileType,
        createdBy: spCreatedBy || DEFAULT_ATTACHMENT_FILTERS.createdBy,
        source: spSource || DEFAULT_ATTACHMENT_FILTERS.source,
        fromDate: spFrom || DEFAULT_ATTACHMENT_FILTERS.fromDate,
        toDate: spTo || DEFAULT_ATTACHMENT_FILTERS.toDate,
        reportType:
          (spReportType as ReportTypeFilter) ||
          DEFAULT_ATTACHMENT_FILTERS.reportType,
        sort:
          (spSort as
            | "NEWEST"
            | "OLDEST"
            | "FILENAME_AZ"
            | "FILENAME_ZA"
            | "KIND") || DEFAULT_ATTACHMENT_FILTERS.sort,
        datePreset:
          (spDatePreset as DatePreset) || DEFAULT_ATTACHMENT_FILTERS.datePreset,
      };
    }

    const raw = localStorage.getItem(storageKey);
    if (raw) {
      return {
        ...DEFAULT_ATTACHMENT_FILTERS,
        ...JSON.parse(raw),
      };
    }
  } catch {
    // ignore
  }

  return DEFAULT_ATTACHMENT_FILTERS;
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export default function ReportAttachmentsPage() {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const { user } = useAuth();

  const role = (user?.role || "").toUpperCase();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "attachments";

  const FILTER_STORAGE_KEY = `reportAttachmentsFilters:user:${userKey}`;
  const initialFilters = getInitialAttachmentFilters(
    searchParams,
    FILTER_STORAGE_KEY,
  );

  const [view, setView] = useState<ViewMode>(initialFilters.view);
  const [q, setQ] = useState(initialFilters.q);
  const [kind, setKind] = useState(initialFilters.kind);
  const [fileType, setFileType] = useState<"ALL" | "image" | "pdf" | "other">(
    initialFilters.fileType,
  );
  const [createdBy, setCreatedBy] = useState(initialFilters.createdBy);
  const [source, setSource] = useState(initialFilters.source);
  const [fromDate, setFromDate] = useState(initialFilters.fromDate);
  const [toDate, setToDate] = useState(initialFilters.toDate);
  const [reportType, setReportType] = useState<ReportTypeFilter>(
    initialFilters.reportType,
  );
  const [sort, setSort] = useState<
    "NEWEST" | "OLDEST" | "FILENAME_AZ" | "FILENAME_ZA" | "KIND"
  >(initialFilters.sort);
  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialFilters.datePreset,
  );

  const [open, setOpen] = useState<{ id: string; filename: string } | null>(
    null,
  );

  // selection + print
  const [selectedIds, setSelectedIds] = useState<string[]>(
    (searchParams.get("selected") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [printingBulk, setPrintingBulk] = useState(false);

  const [printingSingle, setPrintingSingle] = useState(false);
  const [singlePrintItem, setSinglePrintItem] = useState<AttachmentItem | null>(
    null,
  );

  const isSystemAdmin = role === "SYSTEMADMIN";

  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [deletingBulk, setDeletingBulk] = useState(false);

  const allowedTypes = useMemo<ReportType[] | "ALL">(() => {
    if (!role) return "ALL";
    if (role === "CHEMISTRY") return ["CHEMISTRY", "COA"];
    if (role === "MICRO") return ["MICRO", "MICRO_WATER", "STERILITY"];
    return "ALL";
  }, [role]);

  const [bulkPdfPreview, setBulkPdfPreview] = useState<{
    url: string;
    filename: string;
    ids: string[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await api("/attachments/mark-results-read", { method: "POST" });
      } catch {
        // ignore
      }
    })();
  }, []);

  const isRowSelected = (id: string) => selectedIds.includes(id);
  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const [page, setPage] = useState<number>(() => {
    const n = Number(searchParams.get("page") || "1");
    return Number.isFinite(n) && n > 0 ? n : 1;
  });

  const [pageSize, setPageSize] = useState<number>(() => {
    const n = Number(searchParams.get("pageSize") || "24");
    return [12, 24, 48, 96].includes(n) ? n : 24;
  });

  const inputCls =
    "w-full rounded-lg border px-3 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500 bg-white";
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          view,
          q,
          kind,
          fileType,
          createdBy,
          source,
          fromDate,
          toDate,
          reportType,
          sort,
          datePreset,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    FILTER_STORAGE_KEY,
    view,
    q,
    kind,
    fileType,
    createdBy,
    source,
    fromDate,
    toDate,
    reportType,
    sort,
    datePreset,
  ]);
  // (1) UI_VIEW_ATTACHMENTS_PAGE (once)
  const didLogView = useRef(false);
  useEffect(() => {
    if (didLogView.current) return;
    didLogView.current = true;

    logAttachEvent({
      action: "UI_VIEW_ATTACHMENTS_PAGE",
      details: "Viewed Results Attachments page",
      meta: { role },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data + (2) UI_ATTACHMENTS_LOADED (count)
  const didLogLoaded = useRef(false);

  useEffect(() => {
    setLoading(true);
    setError(null);

    (async () => {
      try {
        type Paged = { items: AttachmentItem[]; total: number };
        const resp = await api<Paged>(`/attachments?take=500&skip=0`);
        const list = Array.isArray(resp.items) ? resp.items : [];
        setItems(list);

        if (!didLogLoaded.current) {
          didLogLoaded.current = true;
          logAttachEvent({
            action: "UI_ATTACHMENTS_LOADED",
            details: "Attachments list loaded",
            meta: { count: list.length },
          });
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load attachments");
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const now = new Date();

    const setRange = (from: Date, to: Date) => {
      setFromDate(toDateOnlyISO_UTC(from));
      setToDate(toDateOnlyISO_UTC(to));
    };

    if (datePreset === "") {
      setFromDate("");
      setToDate("");
      return;
    }

    if (datePreset === "TODAY") {
      setRange(now, now);
      return;
    }

    if (datePreset === "YESTERDAY") {
      const y = addDays(now, -1);
      setRange(y, y);
      return;
    }

    if (datePreset === "LAST_7") {
      setRange(addDays(now, -6), now);
      return;
    }

    if (datePreset === "LAST_30") {
      setRange(addDays(now, -29), now);
      return;
    }

    if (datePreset === "THIS_MONTH") {
      setRange(startOfMonth(now), endOfMonth(now));
      return;
    }

    if (datePreset === "LAST_MONTH") {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setRange(startOfMonth(lastMonth), endOfMonth(lastMonth));
      return;
    }
  }, [datePreset]);

  const kinds = useMemo(() => {
    const s = new Set(items.map((i) => i.kind).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    let out = items.filter((a) => {
      const ext = fileExt(a.filename);
      const ft = fileTypeFromExt(ext);

      if (allowedTypes !== "ALL" && !allowedTypes.includes(a.reportType))
        return false;

      if (reportType !== "ALL" && a.reportType !== reportType) return false;
      if (kind !== "ALL" && a.kind !== kind) return false;
      if (fileType !== "ALL" && ft !== fileType) return false;

      if (createdBy !== "ALL") {
        const cb = (a.createdBy || "").trim();
        if (cb !== createdBy) return false;
      }

      if (source !== "ALL") {
        const s = (a.source || "").trim();
        if (s !== source) return false;
      }

      if (
        !matchesDateRange(
          a.createdAt,
          fromDate || undefined,
          toDate || undefined,
        )
      ) {
        return false;
      }

      if (qq) {
        const hay = [
          a.filename,
          a.kind,
          a.createdBy || "",
          a.source || "",
          a.id,
          a.reportType,
          a.reportId,
          a.formNumber || "",
          a.reportNumber || "",
          a.clientCode || "",
          a.formType || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(qq)) return false;
      }

      return true;
    });

    out.sort((a, b) => {
      if (sort === "NEWEST")
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "OLDEST")
        return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === "FILENAME_AZ") return a.filename.localeCompare(b.filename);
      if (sort === "FILENAME_ZA") return b.filename.localeCompare(a.filename);
      if (sort === "KIND") return String(a.kind).localeCompare(String(b.kind));
      return 0;
    });

    return out;
  }, [
    items,
    q,
    kind,
    fileType,
    createdBy,
    source,
    fromDate,
    toDate,
    sort,
    reportType,
    allowedTypes,
  ]);

  const counts = useMemo(() => {
    const allowed =
      allowedTypes === "ALL"
        ? items
        : items.filter((a) => allowedTypes.includes(a.reportType));

    const total = allowed.length;
    const shown = filtered.length;

    const images = filtered.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "image",
    ).length;

    const pdfs = filtered.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "pdf",
    ).length;

    return { total, shown, images, pdfs };
  }, [items, filtered, allowedTypes]);

  const hasActiveFilters = useMemo(() => {
    return (
      view !== DEFAULT_ATTACHMENT_FILTERS.view ||
      q.trim() !== DEFAULT_ATTACHMENT_FILTERS.q ||
      kind !== DEFAULT_ATTACHMENT_FILTERS.kind ||
      fileType !== DEFAULT_ATTACHMENT_FILTERS.fileType ||
      createdBy !== DEFAULT_ATTACHMENT_FILTERS.createdBy ||
      source !== DEFAULT_ATTACHMENT_FILTERS.source ||
      fromDate !== DEFAULT_ATTACHMENT_FILTERS.fromDate ||
      toDate !== DEFAULT_ATTACHMENT_FILTERS.toDate ||
      reportType !== DEFAULT_ATTACHMENT_FILTERS.reportType ||
      sort !== DEFAULT_ATTACHMENT_FILTERS.sort ||
      datePreset !== DEFAULT_ATTACHMENT_FILTERS.datePreset ||
      selectedIds.length > 0
    );
  }, [
    view,
    q,
    kind,
    fileType,
    createdBy,
    source,
    fromDate,
    toDate,
    reportType,
    sort,
    datePreset,
    selectedIds.length,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const pageStart = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, filtered.length);

  const clearAllFilters = () => {
    setView(DEFAULT_ATTACHMENT_FILTERS.view);
    setQ(DEFAULT_ATTACHMENT_FILTERS.q);
    setKind(DEFAULT_ATTACHMENT_FILTERS.kind);
    setFileType(DEFAULT_ATTACHMENT_FILTERS.fileType);
    setCreatedBy(DEFAULT_ATTACHMENT_FILTERS.createdBy);
    setSource(DEFAULT_ATTACHMENT_FILTERS.source);
    setFromDate(DEFAULT_ATTACHMENT_FILTERS.fromDate);
    setToDate(DEFAULT_ATTACHMENT_FILTERS.toDate);
    setReportType(DEFAULT_ATTACHMENT_FILTERS.reportType);
    setSort(DEFAULT_ATTACHMENT_FILTERS.sort);
    setDatePreset(DEFAULT_ATTACHMENT_FILTERS.datePreset);
    setSelectedIds([]);
    setPage(1);
    setPageSize(24);

    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify(DEFAULT_ATTACHMENT_FILTERS),
      );
    } catch {
      // ignore
    }
  };
  // Selected objects (printable only)
  const selectedObjects = selectedIds
    .map((id) => items.find((x) => x.id === id))
    .filter(Boolean) as AttachmentItem[];

  const printableSelectedImages = selectedObjects.filter((a) => {
    const ft = fileTypeFromExt(fileExt(a.filename));
    return ft === "image";
  });

  const handlePrintSelected = async () => {
    if (printingBulk) return;
    if (!selectedIds.length) return;

    const selectedObjectsNow = selectedIds
      .map((id) => items.find((x) => x.id === id))
      .filter(Boolean) as AttachmentItem[];

    const selectedImages = selectedObjectsNow.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "image",
    );

    const selectedPdfs = selectedObjectsNow.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "pdf",
    );

    logAttachEvent({
      action: "UI_ATTACHMENTS_PRINT_SELECTED",
      details: "Print selected attachments",
      meta: {
        selectedCount: selectedIds.length,
        selectedIds,
        imageCount: selectedImages.length,
        pdfCount: selectedPdfs.length,
      },
    });

    setPrintingBulk(true);

    try {
      // If both are selected, stop and tell user for now
      if (selectedImages.length && selectedPdfs.length) {
        throw new Error(
          "Please print only one file type at a time for now: either PDFs or Images.",
        );
      }

      if (selectedPdfs.length) {
        const ids = selectedPdfs.map((p) => p.id);
        const { url, filename } = await mergeSelectedPdfsToUrl(ids);

        setBulkPdfPreview({
          url,
          filename,
          ids,
        });

        logAttachEvent({
          action: "UI_ATTACHMENTS_PRINT_PREPARED",
          details: "Prepared merged PDF preview",
          meta: {
            ids,
            count: ids.length,
          },
        });

        setPrintingBulk(false);
        return;
      }

      if (selectedImages.length) {
        setIsBulkPrinting(true);
        return;
      }

      setPrintingBulk(false);
    } catch (e: any) {
      logAttachEvent({
        action: "UI_ATTACHMENTS_PRINT_FAILED",
        details: "Print selected failed",
        meta: { error: e?.message || String(e) },
      });
      setPrintingBulk(false);
      alert(e?.message || "Print failed");
    }
  };

  const toggleSelectFiltered = () => {
    const allSelected =
      pagedItems.length > 0 &&
      pagedItems.every((a) => selectedIds.includes(a.id));

    if (allSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !pagedItems.some((a) => a.id === id)),
      );
    } else {
      setSelectedIds((prev) => {
        const set = new Set(prev);
        pagedItems.forEach((a) => set.add(a.id));
        return Array.from(set);
      });
    }
  };

  const visibleTabs = useMemo(() => {
    const all: ReportTypeFilter[] = [
      "ALL",
      "MICRO",
      "MICRO_WATER",
      "CHEMISTRY",
      "STERILITY",
      "COA",
    ];
    if (allowedTypes === "ALL") return all;

    return all.filter(
      (t) => t === "ALL" || allowedTypes.includes(t as ReportType),
    );
  }, [allowedTypes]);

  useEffect(() => {
    if (allowedTypes === "ALL") return;

    setSelectedIds((prev) =>
      prev.filter((id) => {
        const att = items.find((x) => x.id === id);
        return att ? allowedTypes.includes(att.reportType) : false;
      }),
    );
  }, [allowedTypes, items]);

  useEffect(() => {
    const sp = new URLSearchParams();

    if (view !== "GRID") sp.set("view", view);

    if (q) sp.set("q", q);
    if (kind !== "ALL") sp.set("kind", kind);
    if (fileType !== "ALL") sp.set("fileType", fileType);

    if (createdBy !== "ALL") sp.set("createdBy", createdBy);
    if (source !== "ALL") sp.set("source", source);

    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);

    if (reportType !== "ALL") sp.set("reportType", reportType);
    if (sort !== "NEWEST") sp.set("sort", sort);

    // OPTIONAL
    if (selectedIds.length) sp.set("selected", selectedIds.join(","));
    if (datePreset) sp.set("datePreset", datePreset);

    setSearchParams(sp, { replace: true });
  }, [
    view,
    q,
    kind,
    fileType,
    createdBy,
    source,
    fromDate,
    toDate,
    reportType,
    sort,
    selectedIds,
    datePreset,
    setSearchParams,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    q,
    kind,
    fileType,
    createdBy,
    source,
    fromDate,
    toDate,
    reportType,
    sort,
    datePreset,
    view,
  ]);

  const handleDeleteAttachments = async (ids: string[]) => {
    if (!isSystemAdmin) return;
    if (!ids.length) return;

    const ok = window.confirm(
      ids.length === 1
        ? "Are you sure you want to delete this attachment?"
        : `Are you sure you want to delete ${ids.length} attachments?`,
    );

    if (!ok) return;

    try {
      setDeletingIds(ids);
      setDeletingBulk(ids.length > 1);

      await Promise.all(
        ids.map((id) =>
          api(`/attachments/${id}`, {
            method: "DELETE",
          }),
        ),
      );

      setItems((prev) => prev.filter((x) => !ids.includes(x.id)));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));

      if (open && ids.includes(open.id)) {
        setOpen(null);
      }
    } catch (e: any) {
      alert(e?.message || "Delete failed");
    } finally {
      setDeletingIds([]);
      setDeletingBulk(false);
    }
  };

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="p-6">
      {(isBulkPrinting || !!singlePrintItem) &&
        createPortal(
          <>
            <style>
              {`
    @media print {
      body > *:not(#bulk-print-root) { display: none !important; }
      #bulk-print-root { display: block !important; position: absolute; inset: 0; background: white; }
      @page { size: A4 portrait; margin: 8mm 10mm 10mm 10mm; }

      #bulk-print-root .sheet {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;

        display: flex !important;
        flex-direction: column !important;
        min-height: 279mm !important;
      }

      #bulk-print-root .print-footer {
        margin-top: auto !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      #bulk-print-root .report-page {
        break-inside: avoid-page;
        page-break-inside: avoid;
        min-height: 279mm !important;
      }

      #bulk-print-root .report-page + .report-page {
        break-before: page;
        page-break-before: always;
      }

      @supports (margin-trim: block) {
        @page { margin-trim: block; }
      }
    }
  `}
            </style>

            <BulkPrintAttachmentsArea
              items={
                isBulkPrinting
                  ? printableSelectedImages
                  : singlePrintItem
                    ? [singlePrintItem]
                    : []
              }
              onPrepared={({ count, ids }) => {
                // (optional) UI_ATTACHMENTS_PRINT_PREPARED
                logAttachEvent({
                  action: "UI_ATTACHMENTS_PRINT_PREPARED",
                  details: "Prepared image print (portal ready)",
                  meta: { count, ids },
                });
              }}
              onAfterPrint={() => {
                setIsBulkPrinting(false);
                setSinglePrintItem(null);
                setPrintingBulk(false);
                setPrintingSingle(false);
              }}
            />
          </>,
          document.body,
        )}

      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Results Attachments
          </h1>
          <p className="text-sm text-slate-500">
            Showing <span className="font-medium">{counts.shown}</span> of{" "}
            <span className="font-medium">{counts.total}</span> (Images:{" "}
            {counts.images} • PDFs: {counts.pdfs})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSystemAdmin && (
            <button
              type="button"
              onClick={() => handleDeleteAttachments(selectedIds)}
              disabled={!selectedIds.length || deletingBulk}
              className={classNames(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
                selectedIds.length
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-slate-200 text-slate-500",
              )}
            >
              {deletingBulk ? <Spinner /> : "🗑️"}
              {deletingBulk
                ? "Deleting..."
                : `Delete selected (${selectedIds.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={!selectedIds.length || printingBulk}
            className={classNames(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
              selectedIds.length
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-slate-200 text-slate-500",
            )}
          >
            {printingBulk ? <Spinner /> : "🖨️"}
            {printingBulk
              ? "Preparing..."
              : `Print selected (${selectedIds.length})`}
          </button>

          <button
            type="button"
            onClick={() => setView(view === "GRID" ? "TABLE" : "GRID")}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
          >
            View: {view === "GRID" ? "Grid" : "Table"}
          </button>
          <button
            type="button"
            onClick={clearAllFilters}
            disabled={!hasActiveFilters}
            className={classNames(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
              hasActiveFilters
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-slate-100 text-slate-400 cursor-not-allowed",
            )}
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Tabs row */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {visibleTabs.map((t) => {
            const isActive = reportType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setReportType(t)}
                className={classNames(
                  "pb-2 border-b-2 text-sm font-medium",
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300",
                )}
              >
                {reportTypeLabel(t)}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Controls Card */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search filename, form/report no, client, kind, source, id..."
              className={inputCls}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 lg:col-span-4">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={inputCls}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <select
              value={fileType}
              onChange={(e) => setFileType(e.target.value as any)}
              className={inputCls}
            >
              <option value="ALL">All file types</option>
              <option value="image">Images</option>
              <option value="pdf">PDF</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center gap-2 lg:col-span-3 lg:justify-end">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className={inputCls}
            >
              <option value="NEWEST">Newest first</option>
              <option value="OLDEST">Oldest first</option>
              <option value="FILENAME_AZ">Filename A → Z</option>
              <option value="FILENAME_ZA">Filename Z → A</option>
              <option value="KIND">Kind</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <select
              value={reportType}
              onChange={(e) =>
                setReportType(e.target.value as ReportTypeFilter)
              }
              className={inputCls}
            >
              {visibleTabs.map((t) => (
                <option key={t} value={t}>
                  {reportTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          {isSystemAdmin && (
            <div className="lg:col-span-3">
              <select
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                className={inputCls}
              >
                <option value="ALL">All creators</option>
                {Array.from(
                  new Set(
                    items
                      .map((x) => (x.createdBy || "").trim())
                      .filter(Boolean),
                  ),
                )
                  .sort()
                  .map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {isSystemAdmin && (
            <div className="lg:col-span-3">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={inputCls}
              >
                <option value="ALL">All sources</option>
                {Array.from(
                  new Set(
                    items.map((x) => (x.source || "").trim()).filter(Boolean),
                  ),
                )
                  .sort()
                  .map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="lg:col-span-3">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className={inputCls}
            >
              <option value="">All dates</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7">Last 7 days</option>
              <option value="LAST_30">Last 30 days</option>
              <option value="THIS_MONTH">This month</option>
              <option value="LAST_MONTH">Last month</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset("");
              }}
              className={inputCls}
            />
          </div>

          <div className="lg:col-span-3">
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset("");
              }}
              className={inputCls}
            />
          </div>

          <div className="lg:col-span-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleSelectFiltered}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            >
              {filtered.length > 0 &&
              filtered.every((a) => selectedIds.includes(a.id))
                ? "Unselect filtered"
                : "Select filtered"}
            </button>

            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              className={classNames(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
                hasActiveFilters
                  ? "bg-rose-600 text-white hover:bg-rose-700 ring-2 ring-rose-300"
                  : "border bg-slate-100 text-slate-400 cursor-not-allowed",
              )}
              title={hasActiveFilters ? "Clear filters" : "No filters applied"}
            >
              ✕ Clear
            </button>
          </div>
        </div>
      </div>

      {/* Content card */}
      <div className="rounded-2xl border bg-white shadow-sm">
        {error && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="p-4">
          {loading ? (
            <div className="text-sm text-slate-500">Loading attachments…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-500">
              No attachments match your filters.
            </div>
          ) : view === "GRID" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {pagedItems.map((a) => {
                const ext = fileExt(a.filename);
                const ft = fileTypeFromExt(ext);
                const filePath = fileById(a.id);
                const reportLink = reportLinkFor(a.reportType, a.reportId);

                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (ft === "other") {
                        // (Open file in new tab)
                        logAttachEvent({
                          action: "UI_ATTACHMENTS_OPEN_FILE",
                          details: "Opened attachment file",
                          entityId: a.id,
                          meta: { filename: a.filename, fileType: ft },
                          formNumber: a.formNumber,
                          reportNumber: a.reportNumber,
                          formType: a.formType,
                          clientCode: a.clientCode,
                        });
                        window.open(`${API_URL}${filePath}`, "_blank");
                      } else {
                        // (Preview open)
                        logAttachEvent({
                          action: "UI_ATTACHMENTS_PREVIEW_OPEN",
                          details: "Opened attachment preview",
                          entityId: a.id,
                          meta: {
                            filename: a.filename,
                            fileType: ft,
                            reportType: a.reportType,
                            reportId: a.reportId,
                            kind: a.kind,
                          },
                          formNumber: a.formNumber,
                          reportNumber: a.reportNumber,
                          formType: a.formType,
                          clientCode: a.clientCode,
                        });
                        setOpen({ id: a.id, filename: a.filename });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (ft === "other") {
                          logAttachEvent({
                            action: "UI_ATTACHMENTS_OPEN_FILE",
                            details: "Opened attachment file",
                            entityId: a.id,
                            meta: { filename: a.filename, fileType: ft },
                            formNumber: a.formNumber,
                            reportNumber: a.reportNumber,
                            formType: a.formType,
                            clientCode: a.clientCode,
                          });
                          window.open(`${API_URL}${filePath}`, "_blank");
                        } else {
                          logAttachEvent({
                            action: "UI_ATTACHMENTS_PREVIEW_OPEN",
                            details: "Opened attachment preview",
                            entityId: a.id,
                            meta: {
                              filename: a.filename,
                              fileType: ft,
                              reportType: a.reportType,
                              reportId: a.reportId,
                              kind: a.kind,
                            },
                            formNumber: a.formNumber,
                            reportNumber: a.reportNumber,
                            formType: a.formType,
                            clientCode: a.clientCode,
                          });
                          setOpen({ id: a.id, filename: a.filename });
                        }
                      }
                    }}
                    className={classNames(
                      "text-left rounded-2xl border bg-white p-3 shadow-sm hover:bg-slate-50/50 transition cursor-pointer",
                      isRowSelected(a.id) && "ring-2 ring-blue-500",
                    )}
                    title="Click to preview"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0" />
                      <label
                        className="inline-flex items-center gap-2 text-xs text-slate-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isRowSelected(a.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleRow(a.id)}
                        />
                      </label>
                    </div>

                    <div className="h-28 w-full border rounded-lg flex items-center justify-center overflow-hidden bg-slate-50">
                      {ft === "image" ? (
                        <Thumb path={filePath} alt={a.filename} />
                      ) : ft === "pdf" ? (
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

                    <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-1">
                      <span className="px-2 py-[2px] rounded-full border bg-slate-50">
                        {a.kind}
                      </span>
                      <span className="px-2 py-[2px] rounded-full border bg-white">
                        {reportTypeLabel(a.reportType)}
                      </span>
                      <span>{new Date(a.createdAt).toLocaleString()}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <Link
                        to={reportLink}
                        className="text-xs underline text-blue-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          logAttachEvent({
                            action: "UI_ATTACHMENTS_OPEN_REPORT",
                            details: "Opened report from attachment",
                            entityId: a.id,
                            meta: {
                              reportId: a.reportId,
                              reportType: a.reportType,
                              reportLink,
                            },
                            formNumber: a.formNumber,
                            reportNumber: a.reportNumber,
                            formType: a.formType,
                            clientCode: a.clientCode,
                          });
                        }}
                      >
                        Open report
                      </Link>

                      {(() => {
                        const canPrint = ft === "image" || ft === "pdf";
                        return (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!canPrint) return;

                              logAttachEvent({
                                action: "UI_ATTACHMENTS_PRINT_SINGLE",
                                details: "Print single attachment",
                                entityId: a.id,
                                meta: { filename: a.filename, fileType: ft },
                                formNumber: a.formNumber,
                                reportNumber: a.reportNumber,
                                formType: a.formType,
                                clientCode: a.clientCode,
                              });

                              const ftNow = fileTypeFromExt(
                                fileExt(a.filename),
                              );
                              if (ftNow === "pdf") {
                                setPrintingSingle(true);
                                try {
                                  await mergeAndPrintSelectedPdfs([a.id]);
                                  logAttachEvent({
                                    action: "UI_ATTACHMENTS_PRINT_PREPARED",
                                    details: "Prepared PDF print (merged)",
                                    entityId: a.id,
                                    meta: { ids: [a.id], count: 1 },
                                    formNumber: a.formNumber,
                                    reportNumber: a.reportNumber,
                                    formType: a.formType,
                                    clientCode: a.clientCode,
                                  });
                                } catch (err: any) {
                                  logAttachEvent({
                                    action: "UI_ATTACHMENTS_PRINT_FAILED",
                                    details: "Print single failed",
                                    entityId: a.id,
                                    meta: {
                                      error: err?.message || String(err),
                                    },
                                    formNumber: a.formNumber,
                                    reportNumber: a.reportNumber,
                                    formType: a.formType,
                                    clientCode: a.clientCode,
                                  });
                                  throw err;
                                } finally {
                                  setPrintingSingle(false);
                                }
                                return;
                              }

                              // image -> portal print
                              setPrintingSingle(true);
                              setSinglePrintItem(a);
                            }}
                            disabled={!canPrint || printingSingle}
                            className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
                            title={
                              canPrint
                                ? "Print this attachment"
                                : "Not printable"
                            }
                          >
                            🖨️
                          </button>
                        );
                      })()}

                      {isSystemAdmin && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleDeleteAttachments([a.id]);
                          }}
                          disabled={deletingIds.includes(a.id)}
                          className="text-xs rounded-lg border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          title="Delete this attachment"
                        >
                          {deletingIds.includes(a.id) ? "Deleting..." : "🗑️"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-4 py-3 font-medium w-10">
                      <input
                        type="checkbox"
                        checked={
                          pagedItems.length > 0 &&
                          pagedItems.every((a) => selectedIds.includes(a.id))
                        }
                        onChange={toggleSelectFiltered}
                      />
                    </th>

                    <th className="px-4 py-3 font-medium">Attachment</th>
                    <th className="px-4 py-3 font-medium">Report</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium text-right w-[260px]">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {pagedItems.map((a) => {
                    const ft = fileTypeFromExt(fileExt(a.filename));
                    const canPrint = ft === "image" || ft === "pdf";
                    const reportLink = reportLinkFor(a.reportType, a.reportId);

                    return (
                      <tr
                        key={a.id}
                        className={classNames(
                          "border-t align-top hover:bg-slate-50",
                          isRowSelected(a.id) && "bg-blue-50/40",
                        )}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={isRowSelected(a.id)}
                            onChange={() => toggleRow(a.id)}
                          />
                        </td>

                        {/* Attachment */}
                        <td className="px-4 py-4">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[520px]">
                                {a.filename}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-full border bg-white px-2 py-[2px] text-[11px] uppercase text-slate-600">
                                  {ft}
                                </span>

                                <span className="inline-flex rounded-full border bg-slate-50 px-2 py-[2px] text-[11px] text-slate-700">
                                  {a.kind}
                                </span>
                              </div>

                              <div className="mt-1 text-[11px] text-slate-500 font-mono">
                                {a.id}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Report */}
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex w-fit rounded-full border bg-white px-2 py-[2px] text-[11px] text-slate-700">
                              {reportTypeLabel(a.reportType)}
                            </span>

                            <Link
                              to={reportLink}
                              className="text-xs underline text-blue-700"
                              onClick={() => {
                                logAttachEvent({
                                  action: "UI_ATTACHMENTS_OPEN_REPORT",
                                  details: "Opened report from attachment",
                                  entityId: a.id,
                                  meta: {
                                    reportId: a.reportId,
                                    reportType: a.reportType,
                                    reportLink,
                                  },
                                  formNumber: a.formNumber,
                                  reportNumber: a.reportNumber,
                                  formType: a.formType,
                                  clientCode: a.clientCode,
                                });
                              }}
                            >
                              Open report
                            </Link>
                          </div>
                        </td>

                        {/* Created */}
                        <td className="px-4 py-4">
                          <div className="text-sm text-slate-800">
                            {new Date(a.createdAt).toLocaleString()}
                          </div>
                          {a.createdBy ? (
                            <div className="mt-1 text-xs text-slate-500">
                              by {a.createdBy}
                            </div>
                          ) : null}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {ft !== "other" && (
                              <button
                                type="button"
                                onClick={() => {
                                  logAttachEvent({
                                    action: "UI_ATTACHMENTS_PREVIEW_OPEN",
                                    details: "Opened attachment preview",
                                    entityId: a.id,
                                    meta: {
                                      filename: a.filename,
                                      fileType: ft,
                                    },
                                    formNumber: a.formNumber,
                                    reportNumber: a.reportNumber,
                                    formType: a.formType,
                                    clientCode: a.clientCode,
                                  });
                                  setOpen({ id: a.id, filename: a.filename });
                                }}
                                className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50"
                              >
                                Preview
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={!canPrint || printingSingle}
                              onClick={async () => {
                                if (!canPrint) return;

                                logAttachEvent({
                                  action: "UI_ATTACHMENTS_PRINT_SINGLE",
                                  details: "Print single attachment",
                                  entityId: a.id,
                                  meta: { filename: a.filename, fileType: ft },
                                  formNumber: a.formNumber,
                                  reportNumber: a.reportNumber,
                                  formType: a.formType,
                                  clientCode: a.clientCode,
                                });

                                const ftNow = fileTypeFromExt(
                                  fileExt(a.filename),
                                );

                                if (ftNow === "pdf") {
                                  setPrintingSingle(true);
                                  try {
                                    await mergeAndPrintSelectedPdfs([a.id]);
                                    logAttachEvent({
                                      action: "UI_ATTACHMENTS_PRINT_PREPARED",
                                      details: "Prepared PDF print (merged)",
                                      entityId: a.id,
                                      meta: { ids: [a.id], count: 1 },
                                      formNumber: a.formNumber,
                                      reportNumber: a.reportNumber,
                                      formType: a.formType,
                                      clientCode: a.clientCode,
                                    });
                                  } catch (err: any) {
                                    logAttachEvent({
                                      action: "UI_ATTACHMENTS_PRINT_FAILED",
                                      details: "Print single failed",
                                      entityId: a.id,
                                      meta: {
                                        error: err?.message || String(err),
                                      },
                                      formNumber: a.formNumber,
                                      reportNumber: a.reportNumber,
                                      formType: a.formType,
                                      clientCode: a.clientCode,
                                    });
                                    throw err;
                                  } finally {
                                    setPrintingSingle(false);
                                  }
                                  return;
                                }

                                // image -> portal print
                                setPrintingSingle(true);
                                setSinglePrintItem(a);
                              }}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-200 disabled:opacity-60"
                            >
                              {printingSingle &&
                              singlePrintItem?.id === a.id ? (
                                <SpinnerDark />
                              ) : (
                                "🖨️"
                              )}
                              Print
                            </button>

                            {isSystemAdmin && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleDeleteAttachments([a.id]);
                                }}
                                disabled={deletingIds.includes(a.id)}
                                className="inline-flex items-center rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-60"
                              >
                                {deletingIds.includes(a.id)
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const blob = await apiBlob(fileById(a.id));
                                  const url = URL.createObjectURL(blob);

                                  logAttachEvent({
                                    action: "UI_ATTACHMENTS_OPEN_FILE",
                                    details: "Opened attachment file",
                                    entityId: a.id,
                                    meta: {
                                      filename: a.filename,
                                      fileType: ft,
                                    },
                                    formNumber: a.formNumber,
                                    reportNumber: a.reportNumber,
                                    formType: a.formType,
                                    clientCode: a.clientCode,
                                  });

                                  window.open(
                                    url,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                  setTimeout(
                                    () => URL.revokeObjectURL(url),
                                    30_000,
                                  );
                                } catch (e) {
                                  console.error(e);
                                  alert("Open failed. Please try again.");
                                }
                              }}
                              className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50"
                            >
                              Open
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          Showing <span className="font-medium">{pageStart}</span> to{" "}
          <span className="font-medium">{pageEnd}</span> of{" "}
          <span className="font-medium">{filtered.length}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value={12}>12 / page</option>
            <option value={24}>24 / page</option>
            <option value={48}>48 / page</option>
            <option value={96}>96 / page</option>
          </select>

          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            First
          </button>

          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Prev
          </button>

          <div className="px-2 text-sm text-slate-700">
            Page <span className="font-semibold">{page}</span> of{" "}
            <span className="font-semibold">{totalPages}</span>
          </div>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Next
          </button>

          <button
            type="button"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Last
          </button>
        </div>
      </div>

      {open && (
        <AttachmentPreview
          attId={open.id}
          filename={open.filename}
          printingSingle={printingSingle}
          onPrint={async () => {
            const att = items.find((x) => x.id === open.id);
            if (!att) return;

            const ft = fileTypeFromExt(fileExt(att.filename));
            if (!(ft === "image" || ft === "pdf")) return;
            if (printingSingle) return;

            // (Print single)
            logAttachEvent({
              action: "UI_ATTACHMENTS_PRINT_SINGLE",
              details: "Print single attachment (from preview)",
              entityId: att.id,
              meta: { filename: att.filename, fileType: ft },
              formNumber: att.formNumber,
              reportNumber: att.reportNumber,
              formType: att.formType,
              clientCode: att.clientCode,
            });

            if (ft === "pdf") {
              setPrintingSingle(true);
              try {
                await mergeAndPrintSelectedPdfs([att.id]);
                logAttachEvent({
                  action: "UI_ATTACHMENTS_PRINT_PREPARED",
                  details: "Prepared PDF print (merged)",
                  entityId: att.id,
                  meta: { ids: [att.id], count: 1 },
                  formNumber: att.formNumber,
                  reportNumber: att.reportNumber,
                  formType: att.formType,
                  clientCode: att.clientCode,
                });
              } catch (err: any) {
                logAttachEvent({
                  action: "UI_ATTACHMENTS_PRINT_FAILED",
                  details: "Print single failed",
                  entityId: att.id,
                  meta: { error: err?.message || String(err) },
                  formNumber: att.formNumber,
                  reportNumber: att.reportNumber,
                  formType: att.formType,
                  clientCode: att.clientCode,
                });
                throw err;
              } finally {
                setPrintingSingle(false);
              }
              return;
            }

            // image -> portal
            setPrintingSingle(true);
            setSinglePrintItem(att);
          }}
          onDownload={() => {
            const att = items.find((x) => x.id === open.id);
            if (!att) return;
            logAttachEvent({
              action: "UI_ATTACHMENTS_DOWNLOAD_SINGLE",
              details: "Downloaded attachment (from preview)",
              entityId: att.id,
              meta: {
                filename: att.filename,
                fileType: fileTypeFromExt(fileExt(att.filename)),
              },
              formNumber: att.formNumber,
              reportNumber: att.reportNumber,
              formType: att.formType,
              clientCode: att.clientCode,
            });
          }}
          onClose={() => {
            logAttachEvent({
              action: "UI_ATTACHMENTS_PREVIEW_CLOSE",
              details: "Closed attachment preview",
              entityId: open.id,
              meta: { filename: open.filename },
              formNumber: items.find((x) => x.id === open.id)?.formNumber,
              reportNumber: items.find((x) => x.id === open.id)?.reportNumber,
              formType: items.find((x) => x.id === open.id)?.formType,
              clientCode: items.find((x) => x.id === open.id)?.clientCode,
            });
            setOpen(null);
          }}
        />
      )}
      {bulkPdfPreview && (
        <BulkPdfPreviewModal
          url={bulkPdfPreview.url}
          filename={bulkPdfPreview.filename}
          onPrint={() => {
            try {
              printPdfFromUrl(bulkPdfPreview.url);
            } catch (err: any) {
              logAttachEvent({
                action: "UI_ATTACHMENTS_PRINT_FAILED",
                details: "Bulk PDF print failed",
                meta: { error: err?.message || String(err) },
              });
              alert(err?.message || "Print failed");
            }
          }}
          onClose={() => {
            URL.revokeObjectURL(bulkPdfPreview.url);
            setBulkPdfPreview(null);
          }}
        />
      )}
    </div>
  );
}
