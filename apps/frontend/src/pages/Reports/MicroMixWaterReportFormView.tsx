import { useEffect, useState } from "react";
import * as QRCode from "qrcode";
import { api, API_URL, getToken } from "../../lib/api";

type Pane = "FORM" | "ATTACHMENTS";

type MicroReportFormProps = {
  report: any;
  onClose: () => void;
  pane?: Pane; // if provided, component becomes controlled
  onPaneChange?: (p: Pane) => void; // optional callback
  showSwitcher?: boolean; // default true; hide internal switcher when false
};

// ---------------- Attachments panel (web-only; hidden on print) ----------------
type AttachmentItem = {
  id: string;
  filename: string;
  kind: string;
  createdAt: string;
};

// // one helper, at top of the file
// const getAuthHeaders = (): HeadersInit | undefined => {
//   const token = localStorage.getItem("token");
//   return token ? { Authorization: `Bearer ${token}` } : undefined;
// };

// const API_BASE =
//   (import.meta as any)?.env?.VITE_API_BASE || "http://localhost:3000"; // set VITE_API_BASE in .env if different

// const attBase = (id: string) =>
//   `${API_BASE}/reports/${id}/attachments`;

const attBase = (id: string) => `/reports/micro-mix/${id}/attachments`;

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

    // const url = attBase(reportId);
    // fetch(url, { credentials: "include", headers: authHeaders() })
    //   .then(async (r) => {
    //     if (!r.ok) {
    //       const msg = await r.text().catch(() => r.statusText);
    //       throw new Error(`Attachments fetch failed ${r.status}: ${msg}`);
    //     }
    //     return r.json();
    //   })
    //   .catch((e) => {
    //     console.error(e);
    //     setItems([]); // keep current UI behavior
    //   })
    //   .then((d) => setItems(Array.isArray(d) ? d : []))
    //   .catch(() => setItems([]))
    //   .finally(() => setLoading(false));
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

    // fetch(`${attBase(reportId)}/${attId}`, {
    //   credentials: "include",
    //   headers: getAuthHeaders(),
    // })
    //   .then((r) =>
    //     r.ok ? r.json() : Promise.reject(new Error(`meta ${r.status}`))
    //   )
    //   .then((m) => {
    //     setMeta(m);
    //     return fetch(`${attBase(reportId)}/${attId}/file`, {
    //       credentials: "include",
    //       headers: getAuthHeaders(),
    //     });
    //   })
    //   .then((r) =>
    //     r.ok ? r.blob() : Promise.reject(new Error(`file ${r.status}`))
    //   )
    //   .then((blob) => {
    //     const url = URL.createObjectURL(blob);
    //     revoke = url;
    //     setObjectUrl(url);
    //   })
    //   .catch((e) => setError(e.message))
    //   .finally(() => {})
    // .finally(() => setLoadingFile(false));
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

const PrintStyles = () => (
  <style>{`
    @media print {
      /* Use almost the full sheet; leave a little bottom room for the QR */
      @page { size: A4 portrait; margin: 6mm 10mm 12mm 10mm; } /* top right bottom left */

      /* Remove UA margins/padding that add mystery whitespace */
      html, body { margin: 0 !important; padding: 0 !important; }

      /* Make the sheet fill the printable area and remove internal padding */
      .sheet {
        width: 100% !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;           /* kills p-4 top/bottom */
        max-height: none !important;     
       overflow: visible !important;
      }
        .no-print { display: none !important; }

      /* Pull the letterhead up & tighten its spacing */
      .letterhead { margin-top: 0 !important; margin-bottom: 4px !important; }

      /* Keep the last block on the same page and tighten its top gap */
      .print-footer { break-inside: avoid; page-break-inside: avoid; margin-top: 6px !important; }

      /* Optional: slightly smaller line-height for dense tables */
      .tight-row { line-height: 1.1 !important; }
    }
  `}</style>
);

export default function MicroMixWaterReportFormView(
  props: MicroReportFormProps
) {
  const { report, onClose, pane, onPaneChange, showSwitcher = true } = props;
  type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    grams?: string;
    result: "Absent" | "Present" | "";
    spec: "Absent" | "";
  };

  const pathogenDefaults: PathRow[] = [
    {
      checked: false,
      key: "E_COLI",
      label: "E.coli",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "P_AER",
      label: "P.aeruginosa",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "S_AUR",
      label: "S.aureus",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "SALM",
      label: "Salmonella",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "CLOSTRIDIA",
      label: "Clostridia species",
      grams: "3g",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "C_ALB",
      label: "C.albicans",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "B_CEP",
      label: "B.cepacia",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "OTHER",
      label: "Other",
      grams: "__ml",
      result: "",
      spec: "Absent",
    },
  ];

  const mlFor = (p: PathRow) => p.grams ?? "11ml";

  function formatDateForInput(value: string | null) {
    if (!value) return "";
    // Convert ISO to yyyy-MM-dd
    return new Date(value).toISOString().split("T")[0];
  }

  const appBase =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:5173";

  const qrValue = report?.id
    ? JSON.stringify({
        t: "report",
        id: report.id, // ← the only thing the watcher needs
        url: `${appBase}/reports/micro-mix/${report.id}`, // nice-to-have for humans
      })
    : "";

  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;
    if (!qrValue) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(qrValue, {
      margin: 1,
      scale: 6,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {
        if (alive) setQrDataUrl("");
      });
    return () => {
      alive = false;
    };
  }, [qrValue]);

  // ...
  useEffect(() => {
    const onAfterPrint = () => onClose?.();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [onClose]);

  const isControlled = typeof pane !== "undefined";
  const [internalPane, setInternalPane] = useState<Pane>("FORM");

  const activePane: Pane = isControlled ? (pane as Pane) : internalPane;

  const setActivePane = (p: Pane) => {
    if (!isControlled) setInternalPane(p);
    onPaneChange?.(p);
  };

  return (
    <div className="sheet relative mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4 ">
      <PrintStyles />

      {/* View switcher */}
      {/* <div className="no-print sticky top-0 z-40 -mx-4 px-4 bg-white/95 backdrop-blur border-b">
        <div className="flex items-center gap-2 py-2">
          <button
            type="button"
            onClick={() => setPane("FORM")}
            className={`px-3 py-1 rounded-full text-sm transition ${
              pane === "FORM"
                ? "bg-blue-600 text-white"
                : "hover:bg-slate-100 text-slate-700"
            }`}
            aria-pressed={pane === "FORM"}
          >
            Main form
          </button>
          <button
            type="button"
            onClick={() => setPane("ATTACHMENTS")}
            className={`px-3 py-1 rounded-full text-sm transition ${
              pane === "ATTACHMENTS"
                ? "bg-blue-600 text-white"
                : "hover:bg-slate-100 text-slate-700"
            }`}
            aria-pressed={pane === "ATTACHMENTS"}
          >
            Attachments
          </button>
        </div>
      </div> */}

      {showSwitcher !== false && (
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
      {/* Controls (hidden on print) */}
      <div className="no-print absolute top-2 right-2 flex gap-2">
        {activePane === "FORM" && (
          <button
            onClick={() => window.print()}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Print
          </button>
        )}
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-800"
        >
          Close
        </button>
      </div>

      {activePane === "FORM" ? (
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
              56 PARK AVENUE, LYNDHURST, NJ 07071 <br></br>
              Tel: (201) 883 1222 • Fax: (201) 883 0449
            </div>
            <div>
              <div className="text-[12px]">
                Email:{" "}
                <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
              </div>
              {/* <div className="font-medium">Report No: {report.fullNumber}</div> */}
            </div>
            <div className="mt-1 grid grid-cols-3 items-center">
              <div /> {/* left spacer */}
              <div className="text-[18px] font-bold text-center underline">
                Water Report
              </div>
              <div className="text-right text-[12px] font-bold font-medium">
                {report.reportNumber ? <> {report.reportNumber}</> : null}
              </div>
            </div>
          </div>

          {/* Top meta block */}
          <div className="w-full border border-black text-[15px]">
            {/* CLIENT / DATE SENT */}
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

            {/* TYPE OF TEST / SAMPLE TYPE / ID # */}
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
                <div className="font-medium whitespace-nowrap">ID NO #:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.idNo || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            {/* DESCRIPTION (full row) */}
            <div className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug">
              <div className="w-28 font-medium">DESCRIPTION:</div>

              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={report?.description || ""}
                readOnly
                disabled
              />
            </div>

            {/* LOT # / SAMPLING DATE */}
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
                  SAMPLING DATE:
                </div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={formatDateForInput(report?.samplingDate) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            {/* TEST SOP # / DATE TESTED */}
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

            {/* PRELIMINARY RESULTS / PRELIMINARY RESULTS DATE */}
            <div className="grid grid-cols-[45%_55%] border-b border-black text-[12px] leading-snug">
              <div className="px-2 border-r border-black flex items-center gap-1">
                <div className="font-medium">PRELIMINARY RESULTS:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={report?.preliminaryResults || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="px-2 flex items-center gap-1">
                <div className="font-medium">PRELIMINARY RESULTS DATE:</div>
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={
                    formatDateForInput(report?.preliminaryResultsDate) || ""
                  }
                  readOnly
                  disabled
                />
              </div>
            </div>

            {/* DATE COMPLETED (full row, label + input) */}
            <div className=" flex items-center gap-2 px-2 text-[12px] leading-snug">
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

          <div className="p-2 font-bold">TBC / TFC RESULTS:</div>

          {/* TBC/TFC table */}
          <div className="mt-2 border border-black">
            <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] text-center items-center font-semibold border-b border-black">
              <div className="p-2  border-r border-black">TYPE OF TEST</div>
              <div className="p-2 border-r border-black">DILUTION</div>
              <div className="p-2 border-r border-black">GRAM STAIN</div>
              <div className="p-2 border-r border-black">RESULT</div>
              <div className="p-2">SPECIFICATION</div>
            </div>
            {/* Row 1: Total Bacterial Count */}
            <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] border-b border-black">
              <div className=" py-1 px-2 font-bold border-r border-black">
                Total Bacterial Count:
              </div>
              <div className="py-1 px-2 border-r border-black">
                <div className="py-1 px-2 text-center"> x 10^0</div>
                {/* <input
              className="w-full border border-black/70 px-1"
              value={tbc_dilution}
              onChange={(e) => set_tbc_dilution(e.target.value)}
              readOnly={lock("tbc_dilution")}
            /> */}
              </div>
              <div className="py-1 px-2 border-r border-black flex">
                <input
                  className="w-full input-editable  px-1"
                  value={report?.tbc_gram || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="py-1 px-2 border-r border-black flex">
                <input
                  className="w-1/2 input-editable  px-1"
                  value={report?.tbc_result || ""}
                  readOnly
                  disabled
                />
                <div className="py-1 px-2 text-center">CFU/ml</div>
              </div>
              <div className="py-1 px-2 flex">
                <input
                  className="w-full input-editable  px-1"
                  value={report?.tbc_spec || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>
            {/* Row 2: Total Mold & Yeast Count */}
            <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px]">
              <div className="py-1 px-2 font-bold border-r border-black">
                Total Mold & Yeast Count:
              </div>
              <div className="py-1 px-2 border-r border-black">
                <div className="py-1 px-2 text-center"> x 10^0</div>
                {/* <input
              className="w-full border border-black/70 px-1"
              value={tmy_dilution}
              onChange={(e) => set_tmy_dilution(e.target.value)}
              readOnly={lock("tmy_dilution")}
            /> */}
              </div>
              <div className="py-1 px-2 border-r border-black flex">
                <input
                  className="w-full input-editable  px-1 "
                  value={report?.tmy_gram || ""}
                  readOnly
                  disabled
                />
              </div>
              <div className="py-1 px-2 border-r border-black flex">
                <input
                  className="w-1/2 input-editable  px-1"
                  value={report?.tmy_result || ""}
                  readOnly
                  disabled
                />
                <div className="py-1 px-2 text-center">CFU/ml</div>
              </div>
              <div className="py-1 px-2 flex">
                <input
                  className="w-full input-editable  px-1"
                  value={report?.tmy_spec || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>

          <div className="p-2 font-bold">
            PATHOGEN SCREENING (Please check the organism to be tested)
          </div>

          {/* Pathogen screening */}
          <div className="border border-black">
            <div className="grid grid-cols-[25%_55%_20%] text-center font-semibold border-b border-black">
              <div className="p-2 border-r">ORGANISM</div>
              <div className="p-2 border-r">RESULT</div>
              <div className="p-2">SPECIFICATION</div>
            </div>
            {(report?.pathogens || pathogenDefaults).map((p: any) => (
              <div
                key={p.key}
                className="grid grid-cols-[25%_55%_20%] border-b border-black text-[11px]"
              >
                <div className="py-[2px] px-2 border-r flex gap-2 items-center text-center">
                  {/* Organism checkbox */}
                  <input
                    type="checkbox"
                    className="thick-box"
                    checked={p.checked || false}
                    readOnly
                    disabled
                  />
                  <span>{p.label}</span>
                </div>
                <div className="py-[2px] px-2 border-r flex gap-4 justify-center text-center">
                  <label>
                    {/* Result radios */}
                    <input
                      type="radio"
                      className="thick-box"
                      checked={p.result === "Absent"}
                      readOnly
                      disabled
                    />{" "}
                    Absent
                  </label>
                  <label>
                    <input
                      type="radio"
                      className="thick-box"
                      checked={p.result === "Present"}
                      readOnly
                      disabled
                    />{" "}
                    Present
                  </label>
                  <span className="ml-2">in {mlFor(p)} of sample</span>
                </div>
                <div className="py-[2px] px-2 text-center">{p.spec}</div>
              </div>
            ))}
          </div>

          {/* Legends / Comments */}
          <div className="mt-2 text-[11px]">
            <div
              className=" font-bold border-black p-2"
              style={{ textDecoration: "underline" }}
            >
              DENOTES: NA (Not Applicable) / N.G. (No Growth) / GM.(+)B Gram (+)
              Bacilli / GM.(+)C Gram (+) Cocci / GM.NEG Gram Negative / NT (Not
              Tested) / TNTC (Too Numerous To Count)
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

            {/* TESTED BY */}

            <div className="p-2">
              <div className="font-medium mb-2 flex items-center gap-2">
                TESTED BY:
                <input
                  className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                  value={report?.testedBy || ""}
                  readOnly
                  disabled
                />
              </div>

              <div className="font-medium mt-2 flex items-center gap-2">
                DATE:
                <input
                  className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                  value={formatDateForInput(report?.testedDate) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>

            {/* REVIEWED BY */}
            <div className="p-2">
              <div className="font-medium mb-2 flex items-center gap-2">
                REVIEWED BY:
                <input
                  className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                  value={report?.reviewedBy || ""}
                  readOnly
                  disabled
                />
              </div>

              <div className="font-medium mt-2 flex items-center gap-2">
                DATE:
                <input
                  className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
                  value={formatDateForInput(report?.reviewedDate) || ""}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>

          {/* Footer: Report ID + QR */}
          <div className="mt-2 flex items-end justify-between avoid-break">
            <div className="text-[10px] text-slate-600">
              This report is confidential and intended only for the recipient.
            </div>

            <div className="flex items-center gap-3">
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

              {/* QR code (prints nicely; includeMargin helps scanners) */}
              {/* QR code (prints nicely; margin helps scanners) */}
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Report QR"
                  width={96}
                  height={96}
                  style={{ width: 96, height: 96 }}
                />
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
