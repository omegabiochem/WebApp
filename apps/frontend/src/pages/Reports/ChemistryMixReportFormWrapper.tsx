import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import type { ChemistryMixReportDTO } from "../../../../SharedTypes/Reports/ChemistryMixReportDto";
import type { COAReportDTO } from "../../../../SharedTypes/Reports/COAReportDto";
import { api } from "../../lib/api";
import ChemistryMixSubmissionForm from "./ChemistryMixSubmissionForm";
import COAReportForm from "./COAReportForm";
import ChemistryMixReportFormView from "./ChemistryMixReportFormView";
import COAReportFormView from "./COAReportFormView";

type AnyReportDTO =
  | (ChemistryMixReportDTO & { id: string; formType: "CHEMISTRY_MIX" })
  | (COAReportDTO & { id: string; formType: "COA" });

export default function ChemistryMixReportFormWrapper() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qrReadOnly = searchParams.get("qr") === "1";

  const [report, setReport] = useState<AnyReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setErr(null);
      setReport(null);

      if (!id) {
        setErr("Missing report ID.");
        setLoading(false);
        return;
      }

      try {
        const data = await api<AnyReportDTO>(
          `/chemistry-reports/${encodeURIComponent(id)}`,
        );
        if (!cancelled) setReport(data);
      } catch (error: any) {
        if (!cancelled) {
          setErr(
            error?.body?.message ?? error?.message ?? "Failed to load report.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="p-4">Loading report…</div>;
  if (err) return <div className="p-4 text-red-600">{String(err)}</div>;
  if (!report) return <div className="p-4 text-red-600">Report not found.</div>;

  if (qrReadOnly) {
    return (
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
        <div className="mb-4 rounded-lg border bg-white p-3 text-sm text-slate-600">
          OMEGA LIMS · Read-only report
        </div>
        {report.formType === "CHEMISTRY_MIX" ? (
          <ChemistryMixReportFormView
            report={report}
            onClose={() => {}}
            showSwitcher={false}
            pane="REPORT"
          />
        ) : report.formType === "COA" ? (
          <COAReportFormView
            report={report}
            onClose={() => {}}
            showSwitcher={false}
            pane="REPORT"
          />
        ) : (
          <div className="p-4">Unsupported report type.</div>
        )}
      </main>
    );
  }

  // Existing dashboard editing and correction links stay unchanged.
  if (report.formType === "CHEMISTRY_MIX") {
    return <ChemistryMixSubmissionForm report={report} />;
  }
  if (report.formType === "COA") {
    return <COAReportForm report={report} />;
  }
  return <div className="p-4">Unknown form type.</div>;
}
