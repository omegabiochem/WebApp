import { useEffect, useState } from "react";
import { api, API_URL, getToken } from "../../lib/api";

type BalanceReading = {
  id: string;
  instrument: string;
  command: string;
  result: string;
  createdAt: string;
  userId: string | null;
  userName?: string;
  userEmail?: string;
};

export default function BalancePage() {
  const [weight, setWeight] = useState("");
  const [readings, setReadings] = useState<BalanceReading[]>([]);
  const [connected, setConnected] = useState(false);
  const [alert, setAlert] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      await checkStatus(alive);
    };

    // initial load
    tick();
    loadReadings(alive);

    // poll connection every 5s
    const interval = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  async function checkStatus(alive = true) {
    try {
      const data = await api<{ connected: boolean }>("/balance/status");
      if (alive) setConnected(!!data.connected);
    } catch {
      if (alive) setConnected(false);
    }
  }

  async function connect() {
    try {
      setLoading(true);
      const data = await api<{ connected: boolean }>("/balance/connect");
      setConnected(!!data.connected);
      setAlert(data.connected ? "" : "⚠️ Failed to connect");
    } catch (e: any) {
      setAlert(e?.message || "❌ Error connecting to balance");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    try {
      setLoading(true);
      await api("/balance/disconnect");
      setConnected(false);
      setAlert("🔌 Balance disconnected");
    } catch (e: any) {
      setAlert(e?.message || "❌ Error disconnecting from balance");
    } finally {
      setLoading(false);
    }
  }

  async function fetchWeight() {
    if (!connected) {
      setAlert("⚠️ Balance is not connected");
      return;
    }
    try {
      setLoading(true);
      const data = await api<{ weight: string }>("/balance/weight");
      setWeight(data.weight);
      setAlert("");
      // refresh table so the new reading shows up
      await loadReadings();
    } catch (err: any) {
      console.error("Failed to fetch weight", err);
      setAlert(err?.message || "Unauthorized. Please log in again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadReadings(alive = true) {
    try {
      const data = await api<BalanceReading[]>("/balance/readings");
      if (alive) setReadings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load readings", err);
    }
  }

  // unified blob downloader with auth + base URL
  async function downloadBlob(path: string, filename: string) {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Export failed (${res.status}) ${text}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setAlert(e?.message || "❌ Export failed");
    }
  }

  async function exportReadings() {
    downloadBlob("/balance/export-readings", "balance_readings.xlsx");
  }

  async function exportAudit() {
    downloadBlob("/balance/export-audit", "balance_audit.xlsx");
  }

  return (
    <div className="p-6 relative">
      {/* Connection indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span
          className={`h-3 w-3 rounded-full ${
            connected ? "bg-green-500 animate-pulse" : "bg-red-500 animate-pulse"
          }`}
        />
        <span className="text-sm font-medium">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <h1 className="text-xl font-bold mb-4">Analytical Balance (GR-202)</h1>

      {/* Connect / Disconnect */}
      <div className="flex gap-3 mb-4">
        <button
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
          onClick={connect}
          disabled={connected || loading}
        >
          Connect
        </button>
        <button
          className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
          onClick={disconnect}
          disabled={!connected || loading}
        >
          Disconnect
        </button>
      </div>

      {/* Alert */}
      {!!alert && (
        <div className="mb-4 text-red-600 font-medium" aria-live="polite">
          {alert}
        </div>
      )}

      <button
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        onClick={fetchWeight}
        disabled={!connected || loading}
      >
        {loading ? "Working…" : "Get Weight"}
      </button>
      <p className="mt-4">Current Weight: {weight || "—"}</p>

      <div className="mt-6">
        <h2 className="text-lg font-bold mb-2">Balance Readings</h2>
        <table className="w-full border-collapse text-sm border">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-2 text-left">Result</th>
              <th className="p-2 text-left">Time</th>
              <th className="p-2 text-left">User</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.result}</td>
                <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="p-2">{r.userName || r.userEmail || r.userId || "—"}</td>
              </tr>
            ))}
            {readings.length === 0 && (
              <tr>
                <td colSpan={3} className="p-3 text-slate-500 text-center">
                  No readings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex gap-3">
        <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={exportReadings}>
          Export Readings
        </button>
        <button className="px-4 py-2 bg-purple-600 text-white rounded" onClick={exportAudit}>
          Export Audit
        </button>
      </div>
    </div>
  );
}



// import { useEffect, useState } from "react";
// import { api } from "../../lib/api";

// type BalanceReading = {
//   id: string;
//   instrument: string;
//   command: string;
//   result: string;
//   createdAt: string;
//   userId: string | null;
//   userName?: string;
//   userEmail?: string;
// };

// export default function BalancePage() {
//   const [weight, setWeight] = useState("");
//   const [readings, setReadings] = useState<BalanceReading[]>([]);
//   const [connected, setConnected] = useState(false);
//   const [alert, setAlert] = useState("");

//   useEffect(() => {
//     checkStatus();
//     loadReadings();
//     const interval = setInterval(checkStatus, 5000); // recheck every 5s
//     return () => clearInterval(interval);
//   }, []);

//   // ✅ check connection
//   async function checkStatus() {
//     try {
//       const data = await api<{ connected: boolean }>("/balance/status");
//       setConnected(data.connected);
//     } catch {
//       setConnected(false);
//     }
//   }

//   // ✅ connect balance
//   async function connect() {
//     try {
//       const data = await api<{ connected: boolean }>("/balance/connect");
//       setConnected(data.connected);
//       setAlert(data.connected ? "" : "⚠️ Failed to connect");
//     } catch {
//       setAlert("❌ Error connecting to balance");
//     }
//   }

//   // ✅ disconnect balance
//   async function disconnect() {
//     try {
//       await api("/balance/disconnect");
//       setConnected(false);
//       setAlert("🔌 Balance disconnected");
//     } catch {
//       setAlert("❌ Error disconnecting from balance");
//     }
//   }

//   async function fetchWeight() {
//     if (!connected) {
//       setAlert("⚠️ Balance is not connected");
//       return;
//     }
//     try {
//       const data = await api<{ weight: string }>("/balance/weight");
//       setWeight(data.weight);
//       setAlert("");
//     } catch (err) {
//       console.error("Failed to fetch weight", err);
//       setAlert("Unauthorized. Please log in again.");
//     }
//   }

//   async function loadReadings() {
//     try {
//       const data = await api<BalanceReading[]>("/balance/readings");
//       setReadings(data);
//     } catch (err) {
//       console.error("Failed to load readings", err);
//     }
//   }

//   async function exportReadings() {
//     const token = localStorage.getItem("token");
//     const res = await fetch("http://localhost:3000/balance/export-readings", {
//       headers: { Authorization: `Bearer ${token}` },
//     });
//     const blob = await res.blob();
//     const url = window.URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = "balance_readings.xlsx";
//     a.click();
//     window.URL.revokeObjectURL(url);
//   }

//   async function exportAudit() {
//     window.open("http://localhost:3000/balance/export-audit");
//   }

//   return (
//     <div className="p-6 relative">
//       {/* ✅ Connection indicator at top-right */}
//       <div className="absolute top-4 right-4 flex items-center gap-2">
//         <span
//           className={`h-3 w-3 rounded-full ${
//             connected
//               ? "bg-green-500 animate-pulse"
//               : "bg-red-500 animate-pulse"
//           }`}
//         ></span>
//         <span className="text-sm font-medium">
//           {connected ? "Connected" : "Disconnected"}
//         </span>
//       </div>

//       <h1 className="text-xl font-bold mb-4">Analytical Balance (GR-202)</h1>

//       {/* ✅ Connect / Disconnect buttons */}
//       <div className="flex gap-3 mb-4">
//         <button
//           className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
//           onClick={connect}
//           disabled={connected}
//         >
//           Connect
//         </button>
//         <button
//           className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
//           onClick={disconnect}
//           disabled={!connected}
//         >
//           Disconnect
//         </button>
//       </div>

//       {/* ✅ Alert if needed */}
//       {alert && (
//         <div className="mb-4 text-red-600 font-medium">
//           {alert}
//         </div>
//       )}

//       <button
//         className="px-4 py-2 bg-blue-600 text-white"
//         onClick={fetchWeight}
//         disabled={!connected}
//       >
//         Get Weight
//       </button>
//       <p className="mt-4">Current Weight: {weight}</p>

//       <div className="mt-6">
//         <h2 className="text-lg font-bold mb-2">Balance Readings</h2>
//         <table className="w-full border-collapse text-sm border">
//           <thead>
//             <tr className="bg-gray-100 border-b">
//               <th className="p-2 text-left">Result</th>
//               <th className="p-2 text-left">Time</th>
//               <th className="p-2 text-left">User</th>
//             </tr>
//           </thead>
//           <tbody>
//             {readings.map((r) => (
//               <tr key={r.id} className="border-b">
//                 <td className="p-2">{r.result}</td>
//                 <td className="p-2">
//                   {new Date(r.createdAt).toLocaleString()}
//                 </td>
//                 <td className="p-2">{r.userName || r.userId}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>

//       <div className="mt-6 flex gap-3">
//         <button
//           className="px-4 py-2 bg-green-600 text-white"
//           onClick={exportReadings}
//         >
//           Export Readings
//         </button>
//         <button
//           className="px-4 py-2 bg-purple-600 text-white"
//           onClick={exportAudit}
//         >
//           Export Audit
//         </button>
//       </div>
//     </div>
//   );
// }
