import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, API_URL, getToken } from "../../lib/api";
import { createPortal } from "react-dom";

type ReportType = "MICRO" | "MICRO_WATER" | "CHEMISTRY";
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

async function mergeAndPrintSelectedPdfs(ids: string[]) {
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

  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Popup blocked. Please allow popups to print PDFs.");
  }

  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }, 800);
}

function fileExt(filename: string) {
  return (filename.split(".").pop() || "").toLowerCase();
}

function fileTypeFromExt(ext: string): "image" | "pdf" | "other" {
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

function toDateOnlyISO(d: Date) {
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
  return `/reports/micro-mix/${reportId}`;
}

function reportTypeLabel(t: ReportTypeFilter) {
  if (t === "ALL") return "All";
  if (t === "MICRO") return "Micro";
  if (t === "MICRO_WATER") return "Micro Water";
  return "Chemistry";
}

// -----------------------------
// UI helpers (same style as dashboard)
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
  printingSingle,
}: {
  attId: string;
  filename: string;
  onClose: () => void;
  onPrint: () => void;
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
// Print root (portal) - prints selected attachments
// -----------------------------
function BulkPrintAttachmentsArea({
  items,
  onAfterPrint,
}: {
  items: AttachmentItem[];
  onAfterPrint: () => void;
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

            const blob = await apiBlob(fileById(a.id)); // ✅ includes auth header
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

        // print after everything is ready
        setTimeout(async () => {
          await waitForAssets();
          window.print();
        }, 50);
      } catch {
        if (!mounted) return;
        setUrls({});
        setReady(true);
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
  }, [items, onAfterPrint]);

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

      // images
      imgs.forEach((img) => {
        // already loaded
        if (img.complete && img.naturalWidth > 0) return;
        pending += 1;
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });

      // objects (pdf)
      objs.forEach(() => {
        // object has no perfect "ready" signal in all browsers.
        // We give it a short delay after it mounts.
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

export default function ReportAttachmentsPage() {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("GRID");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("ALL");
  const [fileType, setFileType] = useState<"ALL" | "image" | "pdf" | "other">(
    "ALL",
  );
  const [createdBy, setCreatedBy] = useState<string>("ALL");
  const [source, setSource] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [reportType, setReportType] = useState<ReportTypeFilter>("ALL");

  const [sort, setSort] = useState<
    "NEWEST" | "OLDEST" | "FILENAME_AZ" | "FILENAME_ZA" | "KIND"
  >("NEWEST");

  const [open, setOpen] = useState<{ id: string; filename: string } | null>(
    null,
  );

  // ✅ selection + print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [printingBulk, setPrintingBulk] = useState(false);

  const [printingSingle, setPrintingSingle] = useState(false);
  const [singlePrintItem, setSinglePrintItem] = useState<AttachmentItem | null>(
    null,
  );

  const isRowSelected = (id: string) => selectedIds.includes(id);
  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const inputCls =
    "w-full rounded-lg border px-3 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500 bg-white";

  useEffect(() => {
    setLoading(true);
    setError(null);

    (async () => {
      try {
        type Paged = { items: AttachmentItem[]; total: number };
        const resp = await api<Paged>(`/attachments?take=500&skip=0`);
        setItems(Array.isArray(resp.items) ? resp.items : []);
      } catch (e: any) {
        setError(e?.message || "Failed to load attachments");
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kinds = useMemo(() => {
    const s = new Set(items.map((i) => i.kind).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    let out = items.filter((a) => {
      const ext = fileExt(a.filename);
      const ft = fileTypeFromExt(ext);

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
  ]);

  const counts = useMemo(() => {
    const total = items.length;
    const shown = filtered.length;
    const images = filtered.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "image",
    ).length;
    const pdfs = filtered.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "pdf",
    ).length;
    return { total, shown, images, pdfs };
  }, [items.length, filtered]);

  const hasActiveFilters = useMemo(() => {
    return (
      q.trim() !== "" ||
      kind !== "ALL" ||
      fileType !== "ALL" ||
      createdBy !== "ALL" ||
      source !== "ALL" ||
      fromDate !== "" ||
      toDate !== "" ||
      reportType !== "ALL" ||
      sort !== "NEWEST"
    );
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
  ]);

  const clearFilters = () => {
    setQ("");
    setKind("ALL");
    setFileType("ALL");
    setCreatedBy("ALL");
    setSource("ALL");
    setFromDate("");
    setToDate("");
    setReportType("ALL");
    setSort("NEWEST");
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

    const selectedObjects = selectedIds
      .map((id) => items.find((x) => x.id === id))
      .filter(Boolean) as AttachmentItem[];

    const selectedImages = selectedObjects.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "image",
    );

    const selectedPdfs = selectedObjects.filter(
      (a) => fileTypeFromExt(fileExt(a.filename)) === "pdf",
    );

    setPrintingBulk(true);

    try {
      // images -> portal print
      if (selectedImages.length) setIsBulkPrinting(true);

      // pdfs -> merge print once
      if (selectedPdfs.length) {
        await mergeAndPrintSelectedPdfs(selectedPdfs.map((p) => p.id));
      }

      // if no images, stop spinner now
      if (!selectedImages.length) setPrintingBulk(false);
    } catch (e) {
      setPrintingBulk(false);
      throw e;
    }
  };

  const toggleSelectFiltered = () => {
    const allSelected =
      filtered.length > 0 && filtered.every((a) => selectedIds.includes(a.id));

    if (allSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !filtered.some((a) => a.id === id)),
      );
    } else {
      setSelectedIds((prev) => {
        const set = new Set(prev);
        filtered.forEach((a) => set.add(a.id));
        return Array.from(set);
      });
    }
  };

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

                #bulk-print-root .report-page {
                  break-inside: avoid-page;
                  page-break-inside: avoid;
                }
                #bulk-print-root .report-page + .report-page {
                  break-before: page;
                  page-break-before: always;
                }

                #bulk-print-root iframe { border: none !important; }
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
            onClick={clearFilters}
            className={classNames(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
              hasActiveFilters
                ? "bg-rose-600 text-white hover:bg-rose-700 ring-2 ring-rose-300"
                : "border bg-white hover:bg-slate-50 text-slate-700",
            )}
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Tabs row */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {(["ALL", "MICRO", "MICRO_WATER", "CHEMISTRY"] as const).map((t) => {
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
        <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search filename, kind, createdBy, source, id…"
              className={inputCls}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
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
              <option value="ALL">ALL</option>
              <option value="image">Images</option>
              <option value="pdf">PDF</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center gap-2 md:justify-end">
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

          <div className="md:col-span-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputCls}
            />

            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputCls}
            />

            <select
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;

                const now = new Date();

                const apply = (from: Date, to: Date) => {
                  setFromDate(toDateOnlyISO(from));
                  setToDate(toDateOnlyISO(to));
                };

                if (v === "TODAY") {
                  apply(now, now);
                } else if (v === "YESTERDAY") {
                  const y = addDays(now, -1);
                  apply(y, y);
                } else if (v === "LAST_7") {
                  apply(addDays(now, -6), now); // inclusive 7 days
                } else if (v === "LAST_30") {
                  apply(addDays(now, -29), now);
                } else if (v === "THIS_MONTH") {
                  apply(startOfMonth(now), endOfMonth(now));
                } else if (v === "LAST_MONTH") {
                  const lastMonth = new Date(
                    now.getFullYear(),
                    now.getMonth() - 1,
                    1,
                  );
                  apply(startOfMonth(lastMonth), endOfMonth(lastMonth));
                } else if (v === "CLEAR") {
                  setFromDate("");
                  setToDate("");
                }

                // reset dropdown back to placeholder (so user can pick again)
                e.currentTarget.value = "";
              }}
              className={inputCls}
              title="Quick date ranges"
            >
              <option value="" disabled>
                Quick dates…
              </option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7">Last 7 days</option>
              <option value="LAST_30">Last 30 days</option>
              <option value="THIS_MONTH">This month</option>
              <option value="LAST_MONTH">Last month</option>
              <option value="CLEAR">Clear dates</option>
            </select>
          </div>

          <div className="md:col-span-3 flex items-center justify-between gap-3 pt-1">
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

            <div className="text-sm text-slate-500">
              Selected:{" "}
              <span className="font-medium">{selectedIds.length}</span>{" "}
              <span className="text-slate-400">
                (Images: {printableSelectedImages.length})
              </span>
            </div>
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
              {filtered.map((a) => {
                const ext = fileExt(a.filename);
                const ft = fileTypeFromExt(ext);
                const filePath = fileById(a.id);
                const reportLink = reportLinkFor(a.reportType, a.reportId);

                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      if (ft === "other")
                        window.open(`${API_URL}${filePath}`, "_blank");
                      else setOpen({ id: a.id, filename: a.filename });
                    }}
                    className={classNames(
                      "text-left rounded-2xl border bg-white p-3 shadow-sm hover:bg-slate-50/50 transition",
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
                        onClick={(e) => e.stopPropagation()}
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

                              const ft = fileTypeFromExt(fileExt(a.filename));
                              if (ft === "pdf") {
                                setPrintingSingle(true);
                                try {
                                  await mergeAndPrintSelectedPdfs([a.id]);
                                } finally {
                                  setPrintingSingle(false);
                                }
                                return;
                              }

                              // image -> existing portal print
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
                    </div>
                  </button>
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
                          filtered.length > 0 &&
                          filtered.every((a) => selectedIds.includes(a.id))
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
                  {filtered.map((a) => {
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
                                onClick={() =>
                                  setOpen({ id: a.id, filename: a.filename })
                                }
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

                                const ftNow = fileTypeFromExt(
                                  fileExt(a.filename),
                                );

                                // PDF -> merged print
                                if (ftNow === "pdf") {
                                  setPrintingSingle(true);
                                  try {
                                    await mergeAndPrintSelectedPdfs([a.id]);
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

                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const blob = await apiBlob(fileById(a.id));
                                  const url = URL.createObjectURL(blob);
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

            if (ft === "pdf") {
              setPrintingSingle(true);
              try {
                await mergeAndPrintSelectedPdfs([att.id]);
              } finally {
                setPrintingSingle(false);
              }
              return;
            }

            // image -> portal
            setPrintingSingle(true);
            setSinglePrintItem(att);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
