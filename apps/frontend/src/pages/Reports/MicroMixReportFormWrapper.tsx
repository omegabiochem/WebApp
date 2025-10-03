// src/pages/Reports/MicroMixReportPrintPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import MicroMixReportFormView from "./MicroMixReportFormView";
import type { MicroMixReportDTO } from "../../../../SharedTypes/Reports/MicroMixReport";

const API_BASE =
  import.meta.env?.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:3000";

export default function MicroMixReportPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const [report, setReport] = useState<MicroMixReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const tokenFromQuery = sp.get("t") || "";
  const authToken = useMemo(
    () => tokenFromQuery || localStorage.getItem("token") || "",
    [tokenFromQuery]
  );

  useEffect(() => {
    (window as any).__PRINT_READY__ = false; // reset
    (window as any).__PRINT_ERROR__ = null;
  }, []);

  useEffect(() => {
    async function fetchReport() {
      if (!id) {
        setErrorMsg("Missing report id");
        setLoading(false);
        return;
      }
      if (!authToken) {
        setErrorMsg("Missing auth token");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/reports/micro-mix/${id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`GET report failed: ${res.status} ${t}`);
        }
        const data: MicroMixReportDTO = await res.json();
        setReport(data);
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [id, authToken]);

  // Always set a deterministic ready marker in the DOM (OK or ERROR)
  useEffect(() => {
    const el = document.getElementById("__ready");
    if (!loading) {
      if (errorMsg) {
        (window as any).__PRINT_ERROR__ = errorMsg;
        (window as any).__PRINT_READY__ = true;
        if (el) el.setAttribute("data-state", "error");
      } else if (report) {
        (window as any).__PRINT_READY__ = true;
        if (el) el.setAttribute("data-state", "ok");
      } else {
        (window as any).__PRINT_READY__ = true;
        if (el) el.setAttribute("data-state", "empty");
      }
    } else {
      if (el) el.setAttribute("data-state", "loading");
    }
  }, [loading, report, errorMsg]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (errorMsg) {
    return (
      <div style={{ padding: 16, color: "crimson" }}>
        <div id="__ready" data-state="error" />
        {errorMsg}
      </div>
    );
  }
  if (!report) {
    return (
      <div style={{ padding: 16, color: "crimson" }}>
        <div id="__ready" data-state="empty" />
        Report not found
      </div>
    );
  }

  return (
    <div className="p-4">
      <div id="__ready" data-state="ok" />
      <MicroMixReportFormView report={report} onClose={() => {}} showSwitcher={false} pane="FORM"/>
    </div>
  );
}
