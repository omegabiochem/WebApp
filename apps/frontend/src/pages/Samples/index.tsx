import { useState, useEffect } from "react";
import { api } from "../../lib/api";

export default function Samples() {
  const [code, setCode] = useState("");
  const [type, setType] = useState("");
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    try { setRows(await api<any[]>("/samples")); }
    catch { /* not logged in or API off */ }
  }
  useEffect(() => { load(); }, []);

  async function createSample() {
    await api("/samples", { method: "POST", body: JSON.stringify({ sampleCode: code, sampleType: type, clientId: "client_1" }) });
    setCode(""); setType(""); load();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold mb-4">Samples</h1>
      <div className="bg-white rounded-xl shadow p-4 max-w-xl mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input className="border rounded-md p-2" placeholder="Sample Code" value={code} onChange={e=>setCode(e.target.value)} />
        <input className="border rounded-md p-2" placeholder="Sample Type" value={type} onChange={e=>setType(e.target.value)} />
        <button className="bg-[var(--brand)] text-white rounded-md px-4" onClick={createSample}>Create</button>
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold mb-2">Recent Samples</h2>
        <ul className="space-y-1 text-sm">{rows.map(r => <li key={r.id}>{r.sampleCode} • {r.sampleType} • {r.status}</li>)}</ul>
      </div>
    </>
  );
}
