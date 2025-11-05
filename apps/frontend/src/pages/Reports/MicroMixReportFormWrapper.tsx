// pages/Reports/MicroMixReportFormWrapper.tsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

import MicroMixReportForm from "./MicroMixReportForm"; // MICRO_MIX
import MicroMixWaterReportForm from "./MicroMixWaterReportForm"; // MICRO_MIX_WATER
// import MicroReportForm from "./MicroReportForm"; // MICRO_GENERAL
// import MicroWaterReportForm from "./MicroWaterReportForm"; // MICRO_GENERAL_WATER

// Import your specific DTOs
import type { MicroMixReportDTO } from "../../../../SharedTypes/Reports/MicroMixReportDto";
import type { MicroMixWaterReportDTO } from "../../../../SharedTypes/Reports/MicroMixWaterReportDto";
import type { MicroGeneralReportDTO } from "../../../../SharedTypes/Reports/MicroGeneralReportDto";
import type { MicroGeneralWaterReportDTO } from "../../../../SharedTypes/Reports/MicroGeneralWaterReportDto";

// base discriminator that MUST be present in API response
type FormType =
  | "MICRO_MIX"
  | "MICRO_MIX_WATER"
  | "MICRO_GENERAL"
  | "MICRO_GENERAL_WATER";

type BaseReport = { id: string; formType: FormType };

// Discriminated union of all DTOs (each must include formType at runtime)
type AnyReportDTO =
  | (BaseReport & MicroMixReportDTO)
  | (BaseReport & MicroMixWaterReportDTO)
  | (BaseReport & MicroGeneralReportDTO)
  | (BaseReport & MicroGeneralWaterReportDTO);

// Type guards (optional but nice for TS)
function isMix(r: AnyReportDTO): r is BaseReport & MicroMixReportDTO {
  return r.formType === "MICRO_MIX";
}
function isMixWater(r: AnyReportDTO): r is BaseReport & MicroMixWaterReportDTO {
  return r.formType === "MICRO_MIX_WATER";
}
// function isGeneral(r: AnyReportDTO): r is BaseReport & MicroGeneralReportDTO {
//   return r.formType === "MICRO_GENERAL";
// }
// function isGeneralWater(
//   r: AnyReportDTO
// ): r is BaseReport & MicroGeneralWaterReportDTO {
//   return r.formType === "MICRO_GENERAL_WATER";
// }

export default function MicroMixReportFormWrapper() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<AnyReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        // IMPORTANT: the API must return formType (your backend’s flattenReport already does)
        const data = await api<AnyReportDTO>(`/reports/${id}`);
        if (!aborted) setReport(data);
      } catch (e: any) {
        if (!aborted) setErr(e?.message ?? "Failed to load report");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [id]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-500">{err}</div>;
  if (!report) return <div className="p-4 text-red-500">Report not found</div>;

  // Render the correct editor based on formType
  if (isMix(report)) return <MicroMixReportForm report={report} />;
  if (isMixWater(report)) return <MicroMixWaterReportForm report={report} />;
  // if (isGeneral(report)) return <MicroReportForm report={report} />;
  // if (isGeneralWater(report)) return <MicroWaterReportForm report={report} />;

  return (
    <div className="p-4 text-sm text-slate-600">
      Unknown form type: {String((report as any).formType)}
    </div>
  );
}
