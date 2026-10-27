import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { api } from "../../lib/api";
import MicroMixReportForm from "./MicroMixReportForm";
import MicroMixWaterReportForm from "./MicroMixWaterReportForm";
import SterilityReportForm from "./SterilityReportForm";
import ApeReportForm from "./ApeReportForm";
import MicroMixReportFormView from "./MicroMixReportFormView";
import MicroMixWaterReportFormView from "./MicroMixWaterReportFormView";
import SterilityReportFormView from "./SterilityReportFormView";
import ApeValidationReportView from "../LabReports/ApeValidationReportView";
import ApeReportView from "../LabReports/ApeReportView";

import type { MicroMixReportDTO } from "../../../../SharedTypes/Reports/MicroMixReportDto";
import type { MicroMixWaterReportDTO } from "../../../../SharedTypes/Reports/MicroMixWaterReportDto";
import type { SterilityReportDTO } from "../../../../SharedTypes/Reports/SterilityReportDto";
import type { APEReportDTO } from "../../../../SharedTypes/Reports/APEReportDto";

type ApeChildType = "APE_VALIDATION_REPORT" | "APE_REPORT";
type AnyReportDTO =
  | (MicroMixReportDTO & { id: string; formType: "MICRO_MIX" })
  | (MicroMixWaterReportDTO & { id: string; formType: "MICRO_MIX_WATER" })
  | (SterilityReportDTO & { id: string; formType: "STERILITY" })
  | (APEReportDTO & { id: string; formType: "APE" });

function ApeQrReadOnly({
  parent,
  initialTab,
}: {
  parent: APEReportDTO & { id: string; formType: "APE" };
  initialTab: ApeChildType;
}) {
  const [tab, setTab] = useState<ApeChildType>(initialTab);
  const [children, setChildren] = useState<Partial<Record<ApeChildType, any>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTab(initialTab), [initialTab, parent.id]);

  useEffect(() => {
    let cancelled = false;
    setChildren({});
    setLoading(true);
    setError(null);

    async function loadChildren() {
      try {
        const types: ApeChildType[] = ["APE_VALIDATION_REPORT", "APE_REPORT"];
        const responses = await Promise.all(
          types.map(async (reportType) => {
            try {
              const result = await api<any>(
                `/reports/ape-child/by-parent?parentReportId=${encodeURIComponent(parent.id)}&reportType=${reportType}`,
              );
              return { reportType, result };
            } catch (error: any) {
              // A missing child is possible; permission failures must not be masked.
              if (error?.status === 404) return { reportType, result: null };
              throw error;
            }
          }),
        );
        if (cancelled) return;
        const next: Partial<Record<ApeChildType, any>> = {};
        responses.forEach(({ reportType, result }) => {
          if (!result?.id) return;
          next[reportType] = {
            ...parent,
            ...result,
            id: result.id,
            reportType,
            parentReportId: parent.id,
            parentFormNumber: (parent as any).formNumber,
            parentReportNumber: (parent as any).reportNumber,
            parentStatus: (parent as any).status,
            workflowStatus: (parent as any).status,
            parentVersion: (parent as any).version ?? 0,
            childStatus: result.status,
            childVersion: result.version,
            status: (parent as any).status,
            clientCode: result.clientCode || (parent as any).clientCode || "",
          };
        });
        setChildren(next);
      } catch (error: any) {
        if (!cancelled)
          setError(
            String(
              error?.body?.message ??
                error?.message ??
                "Unable to load APE report.",
            ),
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, [parent.id]);

  const selected = children[tab];
  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("APE_VALIDATION_REPORT")}
          className={`rounded-lg border px-3 py-2 text-sm ${tab === "APE_VALIDATION_REPORT" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
        >
          APE Validation Report
        </button>
        <button
          type="button"
          onClick={() => setTab("APE_REPORT")}
          className={`rounded-lg border px-3 py-2 text-sm ${tab === "APE_REPORT" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
        >
          APE Report
        </button>
      </div>
      {loading ? (
        <p>Loading APE reports…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : !selected?.id ? (
        <p className="rounded-lg border bg-amber-50 p-4">
          This APE child report has not been saved or is unavailable.
        </p>
      ) : tab === "APE_VALIDATION_REPORT" ? (
        <ApeValidationReportView
          report={selected}
          embedded
          pageMode="VIEW"
          forcePageReadOnly
          hideTopActions
          hideBottomActions
          onClose={() => {}}
        />
      ) : (
        <ApeReportView
          report={selected}
          embedded
          pageMode="VIEW"
          forcePageReadOnly
          hideTopActions
          hideBottomActions
          onClose={() => {}}
        />
      )}
    </section>
  );
}

export default function MicroMixReportFormWrapper() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qrReadOnly = searchParams.get("qr") === "1";
  const apeTabParam = searchParams.get("apeTab");
  const initialApeTab: ApeChildType =
    apeTabParam === "APE_REPORT" ? "APE_REPORT" : "APE_VALIDATION_REPORT";

  const [report, setReport] = useState<AnyReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setReport(null);
    if (!id) {
      setErr("Missing report ID.");
      setLoading(false);
      return;
    }
    async function loadReport() {
      try {
        const data = await api<AnyReportDTO>(
          `/reports/${encodeURIComponent(id!)}`,
        );
        if (!cancelled) setReport(data);
      } catch (error: any) {
        if (!cancelled)
          setErr(
            String(
              error?.body?.message ??
                error?.message ??
                "Failed to load report.",
            ),
          );
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
  if (err) return <div className="p-4 text-red-600">{err}</div>;
  if (!report) return <div className="p-4 text-red-600">Report not found.</div>;

  if (qrReadOnly) {
    return (
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
        <div className="mb-4 rounded-lg border bg-white p-3 text-sm text-slate-600">
          OMEGA LIMS · Read-only report
        </div>
        {report.formType === "MICRO_MIX" ? (
          <MicroMixReportFormView
            report={report}
            onClose={() => {}}
            showSwitcher={false}
            pane="REPORT"
          />
        ) : report.formType === "MICRO_MIX_WATER" ? (
          <MicroMixWaterReportFormView
            report={report}
            onClose={() => {}}
            showSwitcher={false}
            pane="REPORT"
          />
        ) : report.formType === "STERILITY" ? (
          <SterilityReportFormView
            report={report}
            onClose={() => {}}
            showSwitcher={false}
            pane="REPORT"
          />
        ) : report.formType === "APE" ? (
          <ApeQrReadOnly parent={report} initialTab={initialApeTab} />
        ) : (
          <div>Unsupported report type.</div>
        )}
      </main>
    );
  }

  // Existing dashboard edit/correction routes remain exactly as before.
  if (report.formType === "MICRO_MIX")
    return <MicroMixReportForm report={report} />;
  if (report.formType === "MICRO_MIX_WATER")
    return <MicroMixWaterReportForm report={report} />;
  if (report.formType === "STERILITY")
    return <SterilityReportForm report={report} />;
  if (report.formType === "APE") return <ApeReportForm report={report} />;
  return <div className="p-4">Unknown form type.</div>;
}
