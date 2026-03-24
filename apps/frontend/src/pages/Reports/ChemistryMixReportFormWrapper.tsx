import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import type { ChemistryMixReportDTO } from "../../../../SharedTypes/Reports/ChemistryMixReportDto";
import type { COAReportDTO } from "../../../../SharedTypes/Reports/COAReportDto";
import { api } from "../../lib/api";
import ChemistryMixSubmissionForm from "./ChemistryMixSubmissionForm";
import COAReportForm from "./COAReportForm";

type FormType = "CHEMISTRY_MIX" | "COA";

type BaseReport = { id: string; formType: FormType };

type AnyReportDTO =
  | (BaseReport & ChemistryMixReportDTO)
  | (BaseReport & COAReportDTO);

// Type guards (optional but nice for TS)
function isChemistry(r: AnyReportDTO): r is BaseReport & ChemistryMixReportDTO {
  return r.formType === "CHEMISTRY_MIX";
}
function isCOA(r: AnyReportDTO): r is BaseReport & COAReportDTO {
  return r.formType === "COA";
}

export default function ChemistryMixReportFormWrapper() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<AnyReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;

    (async () => {
      try {
        setLoading(true);
        const data = await api<AnyReportDTO>(`/chemistry-reports/${id}`);
        if (!aborted) {
          setReport(data);
        }
      } catch (e: any) {
        if (!aborted) {
          setErr(e.message);
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [id]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-500">{err}</div>;
  if (!report) return <div className="p-4 text-red-500">Report not found</div>;

  if (isChemistry(report)) {
    return <ChemistryMixSubmissionForm report={report} />;
  }

  if (isCOA(report)) {
    return <COAReportForm report={report} />;
  }

  return (
    <div className="p-4 text-sm text-slate-600">
      Unknown form type: {String((report as any).formType)}
    </div>
  );
}
