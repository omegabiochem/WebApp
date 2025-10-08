import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import MicroMixReportFormView from "../../pages/Reports/MicroMixReportFormView";

export default function SamplesPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        // unified API helper (adds base + auth)
        const data = await api<any[]>("/reports/micro-mix");
        const list = Array.isArray(data) ? data : [];

        // Filter only client’s reports (use the same field you render)
        const filtered =
          user?.role === "CLIENT" && user?.clientCode
            ? list.filter((r) => (r.client ?? r.clientCode) === user.clientCode)
            : list;

        if (alive) setReports(filtered);
      } catch (e: any) {
        if (alive) setErr(e?.message || "Failed to fetch reports");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [user?.role, user?.clientCode]);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Samples & Reports</h1>

      <h2 className="text-lg font-semibold mt-6 mb-2">Micro Reports</h2>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}
      {err && !loading && (
        <div className="text-sm text-rose-600">Error: {err}</div>
      )}

      {!loading && !err && (
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">Report #</th>
              <th className="border px-2 py-1">Client</th>
              <th className="border px-2 py-1">Date Sent</th>
              <th className="border px-2 py-1">Status</th>
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="border px-2 py-1">
                  {r.reportNumber ?? r.formNumber ?? "-"}
                </td>
                <td className="border px-2 py-1">{r.client}</td>
                <td className="border px-2 py-1">
                  {r.dateSent ? new Date(r.dateSent).toLocaleDateString() : "-"}
                </td>
                <td className="border px-2 py-1">{r.status}</td>
                <td className="border px-2 py-1 text-center">
                  <button
                    onClick={() => setSelectedReport(r)}
                    className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td className="px-2 py-3 text-center text-sm text-slate-500" colSpan={5}>
                  No reports found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Modal with full form in read-only */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-5xl p-6 m-4 overflow-x-auto">
            <h2 className="text-lg font-bold mb-4 sticky top-0 bg-white z-10 border-b pb-2">
              {selectedReport.reportNumber ?? selectedReport.formNumber ?? "Report"}
            </h2>

            <MicroMixReportFormView
              report={selectedReport}
              onClose={() => setSelectedReport(null)}
              // optional: keep it on FORM only & hide switcher for a cleaner read-only view
              pane="FORM"
              showSwitcher={false}
            />

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




// import { useEffect, useState } from "react";
// import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
// import { useAuth } from "../../context/AuthContext";

// export default function SamplesPage() {
//   const { user } = useAuth();
//   const [reports, setReports] = useState<any[]>([]);
//   const [selectedReport, setSelectedReport] = useState<any | null>(null);
//   const token = localStorage.getItem("token");

//   useEffect(() => {
//     if (!token) {
//       console.error("No token found in localStorage");
//       return;
//     }
//     async function fetchReports() {
//       const res = await fetch("http://localhost:3000/reports/micro-mix", {
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       if (res.ok) {
//         const data = await res.json();
//         // 👇 Filter only client’s reports
//         if (user?.role === "CLIENT" && user?.clientCode) {
//           setReports(data.filter((r: any) => r.clientCode === user.clientCode));
//         } else {
//           setReports(data); // admins/frontdesk see all
//         }
//       } else {
//         console.error("Failed to fetch reports", res.status);
//       }
//     }
//     fetchReports();
//   }, [token, user]);

//   return (
//     <div className="p-4">
//       <h1 className="text-xl font-bold mb-4">Samples & Reports</h1>

//       <h2 className="text-lg font-semibold mt-6 mb-2">Micro Reports</h2>
//       <table className="w-full border">
//         <thead className="bg-gray-100">
//           <tr>
//             <th className="border px-2 py-1">FORM #</th>
//             <th className="border px-2 py-1">Client</th>
//             <th className="border px-2 py-1">Date Sent</th>
//             <th className="border px-2 py-1">Status</th>
//             <th className="border px-2 py-1">Actions</th>
//           </tr>
//         </thead>
//         <tbody>
//           {reports.map((r) => (
//             <tr key={r.id}>
//               <td className="border px-2 py-1">
//                 {r.formNumber}
//               </td>
//               <td className="border px-2 py-1">{r.client}</td>
//               <td className="border px-2 py-1">
//                 {r.dateSent ? new Date(r.dateSent).toLocaleDateString() : "-"}
//               </td>
//               <td className="border px-2 py-1">{r.status}</td>
//               <td className="border px-2 py-1 text-center">
//                 <button
//                   onClick={() => setSelectedReport(r)}
//                   className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
//                 >
//                   View
//                 </button>
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>

//       {/* Modal with full form in read-only */}
//       {selectedReport && (
//         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
//           <div className="bg-white rounded-lg shadow-lg w-full max-w-5xl p-6 m-4 overflow-x-auto">
//             <h2 className="text-lg font-bold mb-4 sticky top-0 bg-white z-10 border-b pb-2">
//               {selectedReport.formNumber}
//             </h2>

//             <MicroMixReportFormView
//               report={selectedReport}
//               onClose={() => setSelectedReport(null)}
//             />

//             <div className="flex justify-end mt-6">
//               <button
//                 onClick={() => setSelectedReport(null)}
//                 className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
//               >
//                 Close
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
