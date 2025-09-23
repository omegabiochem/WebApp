// src/pages/Audit/AuditTrailPage.tsx
import  { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

type AuditRecord = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string;
  role: string | null;
  ipAddress: string | null;
  createdAt: string;
  userId: string | null;
};

const API_BASE = "http://localhost:3000";

export default function AuditTrailPage() {
    
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [filterEntity, setFilterEntity] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Build query string from filters
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filterEntity) params.append("entity", filterEntity);
    if (filterUser) params.append("userId", filterUser);
    if (dateFrom) params.append("from", dateFrom);
    if (dateTo) params.append("to", dateTo);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filterEntity, filterUser, dateFrom, dateTo]);

  

  // Auto-fetch on mount and whenever filters change (debounced)
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
        const res = await fetch(`${API_BASE}/audit${queryString}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: AuditRecord[] = await res.json();
        setRecords(data);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("Audit fetch failed", e);
          setErr(e.message || "Failed to fetch audit trail");
        }
      } finally {
        setLoading(false);
      }
    }, 400); // debounce

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [queryString]);

  const downloadCSV = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please log in first.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/audit/export.csv${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("CSV download failed", e);
      alert("CSV download failed. Check console for details.");
    }
  };

  // Build entity options from the current dataset
  const entityOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.entity))).sort(),
    [records]
  );

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-bold">Audit Trail</h1>
        <button
          onClick={downloadCSV}
          className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700"
          title="Download CSV for current filters"
        >
          <Download size={16} className="inline-block mr-1" />
          Download CSV
        </button>
      </div>

      {/* Filters (auto-applied) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <select
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">All Entities</option>
          {entityOptions.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search by User ID"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="border rounded px-3 py-2"
        />

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border rounded px-3 py-2"
        />

        {(filterEntity || filterUser || dateFrom || dateTo) ? (
          <button
            className="text-sm border rounded px-3 py-2 hover:bg-gray-50"
            onClick={() => {
              setFilterEntity("");
              setFilterUser("");
              setDateFrom("");
              setDateTo("");
            }}
            title="Clear all filters"
          >
            Clear Filters
          </button>
        ) : (
          <div />
        )}
      </div>

      {loading && <div className="text-sm text-gray-500 pb-2">Loading audit trail…</div>}
      {err && <div className="text-sm text-red-600 pb-2">Error: {err}</div>}

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Time</th>
              <th className="p-2 text-left">Entity</th>
              <th className="p-2 text-left">Entity ID</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">User</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-left">IP</th>
              <th className="p-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="p-2">{r.entity}</td>
                <td className="p-2">{r.entityId}</td>
                <td className="p-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${badgeColor(
                      r.action
                    )}`}
                  >
                    {r.action}
                  </span>
                </td>
                <td className="p-2">{r.userId || "-"}</td>
                <td className="p-2">{r.role || "-"}</td>
                <td className="p-2">{r.ipAddress || "-"}</td>
                <td className="p-2">{r.details}</td>
              </tr>
            ))}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-4 text-gray-500 italic">
                  No audit records match filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}




// // src/pages/Audit/AuditTrailPage.tsx
// import React, { useEffect, useState } from "react";
// import { ChevronDown, ChevronRight, Download } from "lucide-react";

// type AuditRecord = {
//   id: string;
//   action: string;
//   entity: string;
//   entityId: string | null;
//   changes: any;
//   details: string;
//   role: string | null;
//   ipAddress: string | null;
//   createdAt: string; // ISO string from API
//   userId: string | null;
// };

// interface Props {
//   entity: string;
//   entityId: string;
// }

// const API_BASE = "http://localhost:3000";

// export default function AuditTrailPage({ entity, entityId }: Props) {
//   const [records, setRecords] = useState<AuditRecord[]>([]);
//   const [expanded, setExpanded] = useState<string | null>(null);
//   const [loading, setLoading] = useState<boolean>(true);
//   const [err, setErr] = useState<string | null>(null);
//   const [busy, setBusy] = useState(false);

//   // ---- fetch audit like AdminDashboard does ----
//   useEffect(() => {
//     async function fetchAudit() {
//       setLoading(true);
//       setErr(null);

//       const token = localStorage.getItem("token");
//       if (!token) {
//         setErr("Please log in first.");
//         setLoading(false);
//         return;
//       }

//       try {
//         const res = await fetch(
//           `${API_BASE}/audit/${encodeURIComponent(entity)}/${encodeURIComponent(
//             entityId
//           )}`,
//           { headers: { Authorization: `Bearer ${token}` } }
//         );

//         if (!res.ok) {
//           setErr(`Failed to fetch audit trail (HTTP ${res.status})`);
//           setRecords([]);
//           return;
//         }

//         const data = (await res.json()) as AuditRecord[];
//         setRecords(data);
//       } catch (e: any) {
//         console.error("Audit fetch failed", e);
//         setErr(e?.message || "Failed to fetch audit trail");
//       } finally {
//         setLoading(false);
//       }
//     }

//     fetchAudit();
//   }, [entity, entityId]);

//   const toggleExpand = (id: string) => {
//     setExpanded((prev) => (prev === id ? null : id));
//   };

//   const downloadCSV = async () => {
//     const token = localStorage.getItem("token");
//     if (!token) {
//       alert("Please log in first.");
//       return;
//     }
//     try {
//       const res = await fetch(
//         `${API_BASE}/audit/${encodeURIComponent(entity)}/${encodeURIComponent(
//           entityId
//         )}/export.csv`,
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       if (!res.ok) throw new Error(`HTTP ${res.status}`);
//       const blob = await res.blob();
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement("a");
//       a.href = url;
//       a.download = `audit_${entity}_${entityId}.csv`;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(url);
//     } catch (e) {
//       console.error("CSV download failed", e);
//       alert("CSV download failed. Check console for details.");
//     }
//   };

//   // keep a simple approve action that matches your AdminDashboard style
//   const approve = async () => {
//     const token = localStorage.getItem("token");
//     if (!token) {
//       alert("Please log in first.");
//       return;
//     }

//     const reason =
//       prompt("Reason for change (required):", "Final approval") || "";
//     if (!reason.trim()) {
//       alert("Reason is required.");
//       return;
//     }
//     const eSignPassword =
//       prompt("Re-enter your password for e-signature") || undefined;

//     try {
//       setBusy(true);
//       const res = await fetch(
//         `${API_BASE}/reports/micro-mix/${encodeURIComponent(entityId)}/status`,
//         {
//           method: "PATCH",
//           headers: {
//             "Content-Type": "application/json",
//             "X-Change-Reason": reason,
//             Authorization: `Bearer ${token}`,
//           },
//           body: JSON.stringify({
//             status: "APPROVED",
//             ...(eSignPassword ? { eSignPassword } : {}),
//           }),
//         }
//       );

//       if (!res.ok) {
//         const txt = await res.text();
//         throw new Error(`Status change failed (HTTP ${res.status}): ${txt}`);
//       }

//       // refresh audit after approve
//       const refresh = await fetch(
//         `${API_BASE}/audit/${encodeURIComponent(entity)}/${encodeURIComponent(
//           entityId
//         )}`,
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       if (refresh.ok) {
//         setRecords((await refresh.json()) as AuditRecord[]);
//       }
//     } catch (e: any) {
//       alert(e?.message || "Status change failed");
//     } finally {
//       setBusy(false);
//     }
//   };

//   const badgeColor = (action: string) => {
//     switch (action) {
//       case "CREATE":
//         return "bg-green-100 text-green-800";
//       case "UPDATE":
//         return "bg-blue-100 text-blue-800";
//       case "DELETE":
//         return "bg-red-100 text-red-800";
//       case "LOGIN":
//         return "bg-emerald-100 text-emerald-800";
//       case "LOGOUT":
//         return "bg-slate-100 text-slate-800";
//       case "LOGIN_FAILED":
//         return "bg-orange-100 text-orange-800";
//       case "PASSWORD_CHANGE":
//         return "bg-purple-100 text-purple-800";
//       case "INVITE_ISSUED":
//         return "bg-cyan-100 text-cyan-800";
//       case "FIRST_CREDENTIALS_SET":
//         return "bg-indigo-100 text-indigo-800";
//       default:
//         return "bg-gray-100 text-gray-800";
//     }
//   };

//   const parseReason = (details?: string) => {
//     if (!details) return null;
//     const m = details.match(/\s\|\sreason:\s(.+)$/);
//     return m ? m[1] : null;
//   };

//   return (
//     <div className="p-6 max-w-6xl mx-auto">
//       <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
//         <h1 className="text-2xl font-bold">
//           Audit Trail for {entity} #{entityId}
//         </h1>
//         <div className="flex gap-2">
//           <button
//             onClick={downloadCSV}
//             className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700"
//           >
//             <Download size={16} /> Download CSV
//           </button>
//           <button
//             onClick={approve}
//             disabled={busy}
//             className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
//             title="Set status to APPROVED (requires reason + e-sign)"
//           >
//             {busy ? "Approving…" : "Approve"}
//           </button>
//         </div>
//       </div>

//       {loading && (
//         <div className="text-sm text-gray-500 pb-2">Loading audit trail…</div>
//       )}
//       {err && (
//         <div className="text-sm text-red-600 pb-2">
//           Error loading audit trail: {err}
//         </div>
//       )}

//       <div className="overflow-x-auto bg-white shadow rounded-lg">
//         <table className="min-w-full border-collapse">
//           <thead>
//             <tr className="bg-gray-100 text-left text-sm font-medium">
//               <th className="px-4 py-2">Time</th>
//               <th className="px-4 py-2">Action</th>
//               <th className="px-4 py-2">User</th>
//               <th className="px-4 py-2">Role</th>
//               <th className="px-4 py-2">IP</th>
//               <th className="px-4 py-2">Details</th>
//               <th className="px-4 py-2">Changes</th>
//             </tr>
//           </thead>
//           <tbody>
//             {records.map((r) => {
//               const reason = parseReason(r.details);
//               return (
//                 <React.Fragment key={r.id}>
//                   <tr
//                     className="border-t text-sm hover:bg-gray-50 cursor-pointer"
//                     onClick={() => toggleExpand(r.id)}
//                   >
//                     <td className="px-4 py-2 whitespace-nowrap">
//                       {new Date(r.createdAt).toLocaleString()}
//                     </td>
//                     <td className="px-4 py-2">
//                       <span
//                         className={`px-2 py-1 rounded-full text-xs font-semibold ${badgeColor(
//                           r.action
//                         )}`}
//                       >
//                         {r.action}
//                       </span>
//                     </td>
//                     <td className="px-4 py-2">{r.userId || "-"}</td>
//                     <td className="px-4 py-2">{r.role || "-"}</td>
//                     <td className="px-4 py-2">{r.ipAddress || "-"}</td>
//                     <td className="px-4 py-2">
//                       <div className="flex flex-wrap items-center gap-2">
//                         <span className="break-words">{r.details}</span>
//                         {reason && (
//                           <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
//                             Reason: {reason}
//                           </span>
//                         )}
//                       </div>
//                     </td>
//                     <td className="px-4 py-2">
//                       <button
//                         className="text-indigo-600 flex items-center gap-1"
//                         onClick={(e) => {
//                           e.stopPropagation();
//                           toggleExpand(r.id);
//                         }}
//                       >
//                         {expanded === r.id ? (
//                           <ChevronDown size={16} />
//                         ) : (
//                           <ChevronRight size={16} />
//                         )}
//                         View
//                       </button>
//                     </td>
//                   </tr>

//                   {expanded === r.id && (
//                     <tr className="bg-gray-50 text-xs">
//                       <td colSpan={7} className="px-6 py-4">
//                         {r?.changes &&
//                         (Object.prototype.hasOwnProperty.call(r.changes, "before") ||
//                           Object.prototype.hasOwnProperty.call(r.changes, "after")) ? (
//                           <div className="grid md:grid-cols-2 gap-4">
//                             <div>
//                               <div className="font-semibold mb-1">Before</div>
//                               <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded-md overflow-x-auto">
//                                 {JSON.stringify(r.changes?.before ?? {}, null, 2)}
//                               </pre>
//                             </div>
//                             <div>
//                               <div className="font-semibold mb-1">After</div>
//                               <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded-md overflow-x-auto">
//                                 {JSON.stringify(r.changes?.after ?? {}, null, 2)}
//                               </pre>
//                             </div>
//                           </div>
//                         ) : (
//                           <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded-md overflow-x-auto">
//                             {JSON.stringify(r.changes ?? {}, null, 2)}
//                           </pre>
//                         )}
//                       </td>
//                     </tr>
//                   )}
//                 </React.Fragment>
//               );
//             })}

//             {!loading && records.length === 0 && (
//               <tr>
//                 <td colSpan={7} className="text-center text-gray-500 py-4 italic">
//                   No audit trail found.
//                 </td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }
