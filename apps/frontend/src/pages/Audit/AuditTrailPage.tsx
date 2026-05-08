// src/pages/Audit/AuditTrailPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCcw, Search } from "lucide-react";
import { api, API_URL } from "../../lib/api";
import { logUiEvent } from "../../lib/uiAudit";
import { useSearchParams } from "react-router-dom";

type AuditRecord = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  formNumber?: string | null;
  reportNumber?: string | null;
  formType?: string | null;
  clientCode?: string | null;
  details: string;
  changes?: any | null;
  role: string | null;
  ipAddress: string | null;
  createdAt: string;
  userId: string | null;
};

type PagedResponse = { items: AuditRecord[]; total: number } | AuditRecord[];

const PAGE_SIZES = [10, 20, 50, 100] as const;

// function clamp(n: number, min: number, max: number) {
//   return Math.max(min, Math.min(max, n));
// }

function safeText(v: string | null | undefined) {
  return v && v.trim().length ? v : "-";
}

// Badge colors for actions
const badgeColor = (action: string) => {
  switch (action) {
    case "CREATE":
      return "bg-green-100 text-green-800";
    case "UPDATE":
      return "bg-blue-100 text-blue-800";
    case "DELETE":
      return "bg-red-100 text-red-800";
    case "LOGIN":
      return "bg-emerald-100 text-emerald-800";
    case "LOGOUT":
      return "bg-slate-100 text-slate-800";
    case "LOGIN_FAILED":
      return "bg-orange-100 text-orange-800";
    case "PASSWORD_CHANGE":
      return "bg-purple-100 text-purple-800";
    case "INVITE_ISSUED":
      return "bg-cyan-100 text-cyan-800";
    case "FIRST_CREDENTIALS_SET":
      return "bg-indigo-100 text-indigo-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};
type DiffRow = {
  path: string;
  oldValue: unknown;
  newValue: unknown;
};

function isPlainObject(x: any) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function tryParseJsonAny(input: unknown): any | null {
  if (input == null) return null;
  if (typeof input === "object") return input; // already json from API
  if (typeof input !== "string") return null;

  const t = input.trim();
  const looksJson =
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"));
  if (!looksJson) return null;

  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function toShort(v: unknown) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function looksLikeLeafDiff(
  obj: any,
): { oldKey: string; newKey: string } | null {
  if (!isPlainObject(obj)) return null;

  const pairs: Array<[string, string]> = [
    ["from", "to"],
    ["old", "new"],
    ["before", "after"],
    ["prev", "next"],
    ["previous", "current"],
  ];

  for (const [a, b] of pairs) {
    if (a in obj && b in obj) return { oldKey: a, newKey: b };
  }
  return null;
}

function flattenDiff(value: any, basePath = ""): DiffRow[] {
  if (value == null) return [];

  // ✅ Special case: root or nested { before: {...}, after: {...} }
  if (isPlainObject(value) && "before" in value && "after" in value) {
    const before = (value as any).before;
    const after = (value as any).after;

    // If before/after are objects, generate rows by comparing keys
    if (isPlainObject(before) && isPlainObject(after)) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      const out: DiffRow[] = [];

      for (const k of keys) {
        const nextPath = basePath ? `${basePath}.${k}` : k;
        const b = (before as any)[k];
        const a = (after as any)[k];

        // recurse if nested objects
        if (isPlainObject(b) && isPlainObject(a)) {
          out.push(...flattenDiff({ before: b, after: a }, nextPath));
        } else {
          out.push({ path: nextPath, oldValue: b, newValue: a });
        }
      }
      return out;
    }

    // If before/after are scalar, just show one row
    return basePath
      ? [{ path: basePath, oldValue: before, newValue: after }]
      : [];
  }

  // ✅ case: [old, new]
  if (Array.isArray(value) && value.length === 2 && basePath) {
    return [{ path: basePath, oldValue: value[0], newValue: value[1] }];
  }

  // ✅ case: leaf diff { from,to } etc
  const leaf = looksLikeLeafDiff(value);
  if (leaf && basePath) {
    return [
      {
        path: basePath,
        oldValue: value[leaf.oldKey],
        newValue: value[leaf.newKey],
      },
    ];
  }

  // ✅ plain object: recurse
  if (isPlainObject(value)) {
    const out: DiffRow[] = [];
    for (const [k, v] of Object.entries(value)) {
      const nextPath = basePath ? `${basePath}.${k}` : k;

      if (Array.isArray(v) && v.length === 2) {
        out.push({ path: nextPath, oldValue: v[0], newValue: v[1] });
      } else if (looksLikeLeafDiff(v)) {
        const leaf2 = looksLikeLeafDiff(v)!;
        out.push({
          path: nextPath,
          oldValue: (v as any)[leaf2.oldKey],
          newValue: (v as any)[leaf2.newKey],
        });
      } else if (isPlainObject(v) || Array.isArray(v)) {
        out.push(...flattenDiff(v, nextPath));
      } else {
        out.push({ path: nextPath, oldValue: "", newValue: v });
      }
    }
    return out;
  }

  return basePath ? [{ path: basePath, oldValue: "", newValue: value }] : [];
}

function DiffTable({ json }: { json: any }) {
  const rows = useMemo(() => {
    const flat = flattenDiff(json);
    // keep stable order
    return flat.sort((a, b) => a.path.localeCompare(b.path));
  }, [json]);

  if (!rows.length) {
    return (
      <div className="text-xs text-gray-500 italic">No structured changes.</div>
    );
  }

  return (
    <div className="mt-2 border rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 border-b">
        Changes
      </div>
      <div className="overflow-auto max-h-72">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-white border-b">
              <th className="text-left p-2 w-[40%]">Field</th>
              <th className="text-left p-2 w-[30%]">Before</th>
              <th className="text-left p-2 w-[30%]">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.path} className="border-b last:border-b-0">
                <td className="p-2 font-mono break-words">{r.path}</td>
                <td className="p-2 break-words text-gray-700">
                  {toShort(r.oldValue)}
                </td>
                <td className="p-2 break-words text-gray-900 font-medium">
                  {toShort(r.newValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailsCell({ details, changes }: { details: string; changes?: any }) {
  const [open, setOpen] = useState(false);

  const parsedChanges = useMemo(() => tryParseJsonAny(changes), [changes]);
  const hasChanges =
    parsedChanges != null &&
    (isPlainObject(parsedChanges) || Array.isArray(parsedChanges));

  const parsedDetailsJson = useMemo(() => tryParseJsonAny(details), [details]);
  const detailsIsJson =
    parsedDetailsJson != null && isPlainObject(parsedDetailsJson);

  // choose what to show as table:
  // 1) changes (preferred)
  // 2) else details if it contains JSON
  const tableJson = hasChanges
    ? parsedChanges
    : detailsIsJson
      ? parsedDetailsJson
      : null;

  const isLongText = (details || "").length > 160;

  return (
    <div className="max-w-[520px]">
      {tableJson ? (
        <>
          <button
            className="text-xs text-indigo-600 hover:underline"
            onClick={() => setOpen((s) => !s)}
          >
            {open ? "Hide changes" : "View changes"}
          </button>
          {open && <DiffTable json={tableJson} />}
          {!open && (
            <div className="mt-1 text-[11px] text-gray-500">
              (tap “View changes” to see field-level diff)
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className={`whitespace-pre-wrap break-words ${
              open ? "" : "line-clamp-3"
            }`}
          >
            {details || "-"}
          </div>
          {isLongText && (
            <button
              className="mt-1 text-xs text-indigo-600 hover:underline"
              onClick={() => setOpen((s) => !s)}
            >
              {open ? "Show less" : "Show more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function formatAuditTime(iso: string) {
  const d = new Date(iso);

  if (isNaN(d.getTime())) return "-";

  const date = d.toLocaleDateString(); // e.g. 2/4/2026
  const time = d.toLocaleTimeString(); // e.g. 3:41:22 PM

  return `${date}\n${time}`;
}

// function formatEntityIds(v: string | null | undefined) {
//   if (!v) return "-";

//   const t = v.trim();

//   // Only format if it's a comma-separated ID list (no spaces)
//   const looksLikeIdList =
//     t.includes(",") && !/\s/.test(t) && /^[a-z0-9,_-]+$/i.test(t);

//   if (!looksLikeIdList) return t;

//   return t
//     .split(",")
//     .map((id) => id.trim())
//     .filter(Boolean)
//     .join(",\n"); // newline after each comma
// }

type UserMini = { id: string; name: string | null; email: string };

function useUserNameMap(records: AuditRecord[]) {
  const [map, setMap] = useState<Record<string, UserMini>>({});

  useEffect(() => {
    const ids = Array.from(
      new Set(records.map((r) => r.userId).filter((x): x is string => !!x)),
    );

    const missing = ids.filter((id) => !map[id]);
    if (!missing.length) return;

    (async () => {
      try {
        const qs = new URLSearchParams({ ids: missing.join(",") });
        const users = await api<UserMini[]>(`/users/lookup?${qs.toString()}`);

        setMap((prev) => {
          const next = { ...prev };
          for (const u of users) next[u.id] = u;
          return next;
        });
      } catch (e) {
        // if lookup fails, keep showing ids (no crash)
        console.error("users lookup failed", e);
      }
    })();
  }, [records]); // map intentionally not included to avoid refetch loops

  return map;
}

const DEFAULT_AUDIT_FILTERS = {
  filterEntity: "",
  filterUserId: "",
  filterEntityId: "",
  filterAction: "",
  filterFormNumber: "",
  filterReportNumber: "",
  dateFrom: "",
  dateTo: "",
  sortOrder: "desc" as "desc" | "asc",
  page: 1,
  pageSize: 20 as (typeof PAGE_SIZES)[number],
};

function parsePageSize(value: string | null): (typeof PAGE_SIZES)[number] {
  const n = Number(value);
  return PAGE_SIZES.includes(n as any)
    ? (n as (typeof PAGE_SIZES)[number])
    : DEFAULT_AUDIT_FILTERS.pageSize;
}

function getInitialAuditFilters(
  searchParams: URLSearchParams,
  storageKey: string,
) {
  try {
    const spEntity = searchParams.get("entity");
    const spUserId = searchParams.get("userId");
    const spEntityId = searchParams.get("entityId");
    const spAction = searchParams.get("action");
    const spFormNumber = searchParams.get("formNumber");
    const spReportNumber = searchParams.get("reportNumber");
    const spFrom = searchParams.get("from");
    const spTo = searchParams.get("to");
    const spOrder = searchParams.get("order");
    const spPage = searchParams.get("page");
    const spPageSize = searchParams.get("pageSize");

    const hasUrlFilters =
      spEntity ||
      spUserId ||
      spEntityId ||
      spAction ||
      spFormNumber ||
      spReportNumber ||
      spFrom ||
      spTo ||
      spOrder ||
      spPage ||
      spPageSize;

    if (hasUrlFilters) {
      return {
        filterEntity: spEntity || DEFAULT_AUDIT_FILTERS.filterEntity,
        filterUserId: spUserId || DEFAULT_AUDIT_FILTERS.filterUserId,
        filterEntityId: spEntityId || DEFAULT_AUDIT_FILTERS.filterEntityId,
        filterAction: spAction || DEFAULT_AUDIT_FILTERS.filterAction,
        filterFormNumber:
          spFormNumber || DEFAULT_AUDIT_FILTERS.filterFormNumber,
        filterReportNumber:
          spReportNumber || DEFAULT_AUDIT_FILTERS.filterReportNumber,
        dateFrom: spFrom || DEFAULT_AUDIT_FILTERS.dateFrom,
        dateTo: spTo || DEFAULT_AUDIT_FILTERS.dateTo,
        sortOrder:
          (spOrder as "desc" | "asc") || DEFAULT_AUDIT_FILTERS.sortOrder,
        page: Number(spPage || DEFAULT_AUDIT_FILTERS.page),
        pageSize: parsePageSize(spPageSize),
      };
    }

    const raw = localStorage.getItem(storageKey);
    if (raw) {
      return {
        ...DEFAULT_AUDIT_FILTERS,
        ...JSON.parse(raw),
      };
    }
  } catch {
    // ignore
  }

  return DEFAULT_AUDIT_FILTERS;
}

export default function AuditTrailPage() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [total, setTotal] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [refreshKey, setRefreshKey] = useState(0);

  const userMap = useUserNameMap(records);

  const userNameFor = (id: string | null) => {
    if (!id) return "-";
    const u = userMap[id];
    return u?.name || u?.email || id;
  };

  const FILTER_STORAGE_KEY = "auditTrailFilters";
  const initialFilters = getInitialAuditFilters(
    searchParams,
    FILTER_STORAGE_KEY,
  );
  const [filterEntity, setFilterEntity] = useState(initialFilters.filterEntity);
  const [filterUserId, setFilterUserId] = useState(initialFilters.filterUserId);
  const [filterEntityId, setFilterEntityId] = useState(
    initialFilters.filterEntityId,
  );
  const [filterAction, setFilterAction] = useState(initialFilters.filterAction);
  const [filterFormNumber, setFilterFormNumber] = useState(
    initialFilters.filterFormNumber,
  );
  const [filterReportNumber, setFilterReportNumber] = useState(
    initialFilters.filterReportNumber,
  );
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">(
    initialFilters.sortOrder,
  );
  const [page, setPage] = useState(initialFilters.page);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(
    initialFilters.pageSize,
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    filterEntity,
    filterUserId,
    filterEntityId,
    filterAction,
    filterFormNumber,
    filterReportNumber,
    dateFrom,
    dateTo,
    sortOrder,
    pageSize,
  ]);

  const didLog = useRef(false);

  useEffect(() => {
    if (didLog.current) return;
    didLog.current = true;

    logUiEvent({
      action: "UI_VIEW_AUDIT_PAGE",
      entity: "AuditTrail",
      details: "Viewed Audit Trail page",
      entityId: null,
      formNumber: null,
      reportNumber: null,
      formType: null,
      clientCode: null,
    });
  }, []);

  const queryString = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `?${qs}` : "";
  }, [searchParams]);

  // Fetch data (debounced)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setErr("Please log in first.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    const ctrl = new AbortController();

    const t = setTimeout(async () => {
      try {
        const data = await api<PagedResponse>(`/audit${queryString}`, {
          signal: ctrl.signal,
        });

        // Support both array and {items,total}
        if (Array.isArray(data)) {
          setRecords(data);
          setTotal(data.length); // fallback: unknown true total
        } else {
          setRecords(data.items);
          setTotal(data.total);
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("Audit fetch failed", e);
          setErr(e.message || "Failed to fetch audit trail");
        }
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [queryString, refreshKey]);

  useEffect(() => {
    const sp = new URLSearchParams();

    if (filterEntity) sp.set("entity", filterEntity);
    if (filterUserId) sp.set("userId", filterUserId);
    if (filterEntityId) sp.set("entityId", filterEntityId);
    if (filterAction) sp.set("action", filterAction);
    if (filterFormNumber) sp.set("formNumber", filterFormNumber);
    if (filterReportNumber) sp.set("reportNumber", filterReportNumber);
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);

    if (sortOrder !== DEFAULT_AUDIT_FILTERS.sortOrder) {
      sp.set("order", sortOrder);
    }

    if (page !== DEFAULT_AUDIT_FILTERS.page) {
      sp.set("page", String(page));
    }

    if (pageSize !== DEFAULT_AUDIT_FILTERS.pageSize) {
      sp.set("pageSize", String(pageSize));
    }

    setSearchParams(sp, { replace: true });
  }, [
    filterEntity,
    filterUserId,
    filterEntityId,
    filterAction,
    filterFormNumber,
    filterReportNumber,
    dateFrom,
    dateTo,
    sortOrder,
    page,
    pageSize,
    setSearchParams,
  ]);

  const totalPages = useMemo(() => {
    if (!total || total < 0) return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  // Build entity options from current dataset (works even with pagination)
  const entityOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.entity))).sort(),
    [records],
  );
  const KNOWN_AUDIT_ACTIONS = [
    "FORM_CREATED",
    "FORM_UPDATED",
    "FORM_NUMBER_ASSIGNED",

    "REPORT_CREATED",
    "REPORT_UPDATED",
    "REPORT_NUMBER_ASSIGNED",

    "STATUS_CHANGE",
    "CHANGE_REQUESTED",
    "CORRECTION_REQUESTED",
    "REPORT_APPROVED",
    "REPORT_LOCKED",
    "FORM_VOIDED",
    "REPORT_VOIDED",

    "CORRECTION_CREATED",
    "CORRECTION_RESOLVED",
    "CORRECTION_RESOLVED_ALL",

    "ATTACHMENT_UPLOADED",
    "ATTACHMENT_UPDATED",
    "ATTACHMENT_DELETED",

    "LOGIN",
    "LOGOUT",
    "LOGIN_FAILED",
    "PASSWORD_CHANGE",

    "UI_VIEW_REPORT",
    "UI_PRINT_REPORT",
    "UI_PRINT_SELECTED",
    "UI_DOWNLOAD_AUDIT_CSV",
  ];

  const actionOptions = useMemo(
    () =>
      Array.from(
        new Set([...KNOWN_AUDIT_ACTIONS, ...records.map((r) => r.action)]),
      ).sort(),
    [records],
  );

  const downloadCSV = async () => {
    const token = localStorage.getItem("token");
    // ✅ AUDIT: bulk print
    logUiEvent({
      action: "UI_DOWNLOAD_AUDIT_CSV",
      entity: "AuditTrail",
      details: "Downloaded audit trail CSV",
      clientCode: null,
      entityId: null,
      formNumber: null,
      reportNumber: null,
      formType: null,
      meta: {
        filters: {
          entity: filterEntity || null,
          action: filterAction || null,
          userId: filterUserId || null,
          entityId: filterEntityId || null,
          from: dateFrom || null,
          to: dateTo || null,
          formNumber: filterFormNumber || null,
          reportNumber: filterReportNumber || null,
          order: sortOrder,
        },
      },
    });

    if (!token) {
      alert("Please log in first.");
      return;
    }

    // build QS (no pagination)
    const params = new URLSearchParams();
    if (filterEntity) params.append("entity", filterEntity);
    if (filterUserId) params.append("userId", filterUserId);
    if (filterEntityId) params.append("entityId", filterEntityId);
    if (filterAction) params.append("action", filterAction);
    if (dateFrom) params.append("from", dateFrom);
    if (dateTo) params.append("to", dateTo);
    if (filterFormNumber) params.append("formNumber", filterFormNumber);
    if (filterReportNumber) params.append("reportNumber", filterReportNumber);
    params.append("order", sortOrder);

    const qs = params.toString();
    const url = `${API_URL}/audit/export.csv${qs ? `?${qs}` : ""}`;
    // ^ if you don't have api.baseUrl, use API_URL from lib/api, see below

    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(
          `CSV export failed (${resp.status}): ${txt || resp.statusText}`,
        );
      }

      const blob = await resp.blob();
      const dl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = dl;
      a.download = "audit.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dl);
    } catch (e) {
      console.error("CSV download failed", e);
      alert("CSV download failed. Check console for details.");
    }
  };

  const showingFrom = total ? (page - 1) * pageSize + 1 : 0;
  const showingTo = total ? Math.min(page * pageSize, total) : records.length;

  const hasActiveFilters = useMemo(() => {
    return (
      filterEntity !== DEFAULT_AUDIT_FILTERS.filterEntity ||
      filterUserId !== DEFAULT_AUDIT_FILTERS.filterUserId ||
      filterEntityId !== DEFAULT_AUDIT_FILTERS.filterEntityId ||
      filterAction !== DEFAULT_AUDIT_FILTERS.filterAction ||
      filterFormNumber !== DEFAULT_AUDIT_FILTERS.filterFormNumber ||
      filterReportNumber !== DEFAULT_AUDIT_FILTERS.filterReportNumber ||
      dateFrom !== DEFAULT_AUDIT_FILTERS.dateFrom ||
      dateTo !== DEFAULT_AUDIT_FILTERS.dateTo ||
      sortOrder !== DEFAULT_AUDIT_FILTERS.sortOrder ||
      pageSize !== DEFAULT_AUDIT_FILTERS.pageSize
    );
  }, [
    filterEntity,
    filterUserId,
    filterEntityId,
    filterAction,
    filterFormNumber,
    filterReportNumber,
    dateFrom,
    dateTo,
    sortOrder,
    pageSize,
  ]);

  const clearAllFilters = () => {
    setFilterEntity(DEFAULT_AUDIT_FILTERS.filterEntity);
    setFilterUserId(DEFAULT_AUDIT_FILTERS.filterUserId);
    setFilterEntityId(DEFAULT_AUDIT_FILTERS.filterEntityId);
    setFilterAction(DEFAULT_AUDIT_FILTERS.filterAction);
    setFilterFormNumber(DEFAULT_AUDIT_FILTERS.filterFormNumber);
    setFilterReportNumber(DEFAULT_AUDIT_FILTERS.filterReportNumber);
    setDateFrom(DEFAULT_AUDIT_FILTERS.dateFrom);
    setDateTo(DEFAULT_AUDIT_FILTERS.dateTo);
    setSortOrder(DEFAULT_AUDIT_FILTERS.sortOrder);
    setPage(DEFAULT_AUDIT_FILTERS.page);
    setPageSize(DEFAULT_AUDIT_FILTERS.pageSize);

    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify(DEFAULT_AUDIT_FILTERS),
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          filterEntity,
          filterUserId,
          filterEntityId,
          filterAction,
          filterFormNumber,
          filterReportNumber,
          dateFrom,
          dateTo,
          sortOrder,
          page,
          pageSize,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    FILTER_STORAGE_KEY,
    filterEntity,
    filterUserId,
    filterEntityId,
    filterAction,
    filterFormNumber,
    filterReportNumber,
    dateFrom,
    dateTo,
    sortOrder,
    page,
    pageSize,
  ]);

  useEffect(() => {
    const nextEntity =
      searchParams.get("entity") || DEFAULT_AUDIT_FILTERS.filterEntity;
    const nextUserId =
      searchParams.get("userId") || DEFAULT_AUDIT_FILTERS.filterUserId;
    const nextEntityId =
      searchParams.get("entityId") || DEFAULT_AUDIT_FILTERS.filterEntityId;
    const nextAction =
      searchParams.get("action") || DEFAULT_AUDIT_FILTERS.filterAction;
    const nextFormNumber =
      searchParams.get("formNumber") || DEFAULT_AUDIT_FILTERS.filterFormNumber;
    const nextReportNumber =
      searchParams.get("reportNumber") ||
      DEFAULT_AUDIT_FILTERS.filterReportNumber;
    const nextFrom = searchParams.get("from") || DEFAULT_AUDIT_FILTERS.dateFrom;
    const nextTo = searchParams.get("to") || DEFAULT_AUDIT_FILTERS.dateTo;
    const nextOrder =
      (searchParams.get("order") as "desc" | "asc") ||
      DEFAULT_AUDIT_FILTERS.sortOrder;
    const nextPage = Number(
      searchParams.get("page") || DEFAULT_AUDIT_FILTERS.page,
    );
    const nextPageSize = parsePageSize(searchParams.get("pageSize"));

    if (nextEntity !== filterEntity) setFilterEntity(nextEntity);
    if (nextUserId !== filterUserId) setFilterUserId(nextUserId);
    if (nextEntityId !== filterEntityId) setFilterEntityId(nextEntityId);
    if (nextAction !== filterAction) setFilterAction(nextAction);
    if (nextFormNumber !== filterFormNumber)
      setFilterFormNumber(nextFormNumber);
    if (nextReportNumber !== filterReportNumber)
      setFilterReportNumber(nextReportNumber);
    if (nextFrom !== dateFrom) setDateFrom(nextFrom);
    if (nextTo !== dateTo) setDateTo(nextTo);
    if (nextOrder !== sortOrder) setSortOrder(nextOrder);
    if (nextPage !== page) setPage(nextPage);
    if (nextPageSize !== pageSize) setPageSize(nextPageSize);
  }, [searchParams]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Audit Trail</h1>
          <div className="text-sm text-gray-600">
            Track logins, changes, deletes, and workflow events.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="border px-3 py-2 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2"
            title="Refresh"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>

          <button
            onClick={downloadCSV}
            className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 inline-flex items-center gap-2"
            title="Download CSV for current filters"
          >
            <Download size={16} />
            Download CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-2xl p-4 mb-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Entity
            </label>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {entityOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Action
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="relative lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              User ID
            </label>
            <Search
              size={16}
              className="absolute left-3 top-[38px] text-gray-400"
            />
            <input
              type="text"
              placeholder="e.g. usr_..."
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Entity ID
            </label>
            <input
              type="text"
              placeholder="e.g. cmjt4..."
              value={filterEntityId}
              onChange={(e) => setFilterEntityId(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Form Number
            </label>
            <input
              type="text"
              placeholder="e.g. ABC-20260012"
              value={filterFormNumber}
              onChange={(e) => setFilterFormNumber(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Report Number
            </label>
            <input
              type="text"
              placeholder="e.g. OM-20260045"
              value={filterReportNumber}
              onChange={(e) => setFilterReportNumber(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sort
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </select>
          </div>

          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Rows
            </label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as any)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-12 flex justify-end">
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              className={[
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
                hasActiveFilters
                  ? "bg-rose-600 text-white hover:bg-rose-700 ring-2 ring-rose-300"
                  : "border bg-slate-100 text-slate-400 cursor-not-allowed",
              ].join(" ")}
              title={hasActiveFilters ? "Clear filters" : "No filters applied"}
            >
              ✕ Clear
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-gray-500 pb-2">Loading audit trail…</div>
      )}
      {err && <div className="text-sm text-red-600 pb-2">Error: {err}</div>}

      {/* Table */}
      <div className="overflow-x-auto border rounded-xl bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-3 text-left whitespace-nowrap">Time</th>
              <th className="p-3 text-left whitespace-nowrap">Entity</th>
              <th className="p-3 text-left whitespace-nowrap">Form No</th>
              <th className="p-3 text-left whitespace-nowrap">Report No</th>
              <th className="p-3 text-left whitespace-nowrap">Entity ID</th>
              <th className="p-3 text-left whitespace-nowrap">Action</th>
              <th className="p-3 text-left whitespace-nowrap">User</th>
              <th className="p-3 text-left whitespace-nowrap">Role</th>
              <th className="p-3 text-left whitespace-nowrap">IP</th>
              <th className="p-3 text-left">Details</th>
            </tr>
          </thead>

          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50 align-top">
                <td className="p-3 whitespace-pre-wrap font-mono text-xs">
                  {formatAuditTime(r.createdAt)}
                </td>

                <td className="p-3 whitespace-nowrap">{safeText(r.entity)}</td>

                <td className="p-3 whitespace-nowrap text-xs">
                  <div className="font-semibold text-gray-900">
                    {safeText(r.formNumber)}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {safeText(r.formType)}
                  </div>
                </td>

                <td className="p-3 whitespace-nowrap text-xs font-medium">
                  {safeText(r.reportNumber)}
                </td>

                <td className="p-3 whitespace-nowrap text-xs">
                  <div className="font-medium">{safeText(r.entityId)}</div>
                  <div className="font-mono text-[10px] text-gray-500">
                    {safeText(r.entityId)}
                  </div>
                </td>

                <td className="p-3 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${badgeColor(
                      r.action,
                    )}`}
                  >
                    {r.action}
                  </span>
                </td>

                <td className="p-3 whitespace-nowrap text-xs">
                  <div className="font-medium">{userNameFor(r.userId)}</div>
                  <div className="font-mono text-[10px] text-gray-500">
                    {safeText(r.userId)}
                  </div>
                </td>

                <td className="p-3 whitespace-nowrap">{safeText(r.role)}</td>

                <td className="p-3 whitespace-nowrap font-mono text-xs">
                  {safeText(r.ipAddress)}
                </td>

                <td className="p-3">
                  <DetailsCell
                    details={r.details || ""}
                    changes={(r as any).changes}
                  />
                </td>
              </tr>
            ))}

            {!loading && records.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="text-center py-10 text-gray-500 italic"
                >
                  No audit records match filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4">
        <div className="text-sm text-gray-600">
          {total ? (
            <>
              Showing <span className="font-medium">{showingFrom}</span>–{" "}
              <span className="font-medium">{showingTo}</span> of{" "}
              <span className="font-medium">{total}</span>
            </>
          ) : (
            <>
              Showing <span className="font-medium">{records.length}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage(1)}
            disabled={page <= 1 || loading}
          >
            First
          </button>
          <button
            className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage((p: number) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Prev
          </button>

          <div className="text-sm px-2">
            Page <span className="font-medium">{page}</span> /{" "}
            <span className="font-medium">{totalPages}</span>
          </div>

          <button
            className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </button>
          <button
            className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages || loading}
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
