import { createPortal } from "react-dom";
import MicroMixReportFormView from "../pages/Reports/MicroMixReportFormView";
import MicroMixWaterReportFormView from "../pages/Reports/MicroMixWaterReportFormView";
import SterilityReportFormView from "../pages/Reports/SterilityReportFormView";
import ChemistryMixReportFormView from "../pages/Reports/ChemistryMixReportFormView";
import COAReportFormView from "../pages/Reports/COAReportFormView";
import COAReportForm from "../pages/Reports/COAReportForm";
import React from "react";
import ChemistryMixSubmissionForm from "../pages/Reports/ChemistryMixSubmissionForm";
import MicroMixReportForm from "../pages/Reports/MicroMixReportForm";
import MicroMixWaterReportForm from "../pages/Reports/MicroMixWaterReportForm";
import SterilityReportForm from "../pages/Reports/SterilityReportForm";
import { useAuth } from "../context/AuthContext";

type WorkspaceMode = "VIEW" | "UPDATE";
type WorkspaceLayout = "VERTICAL" | "HORIZONTAL";

type ReportItem = {
  id: string;
  formType: string;
  formNumber: string;
  reportNumber?: string | null;
  status: string;
};

type CorrectionLaunchKind = "REQUEST_CHANGE" | "RAISE_CORRECTION";
type Props = {
  open: boolean;
  reports: ReportItem[];
  mode: WorkspaceMode;
  layout: WorkspaceLayout;
  activeId?: string | null;
  correctionKinds?: CorrectionLaunchKind[]; // ✅ add this
  onClose: () => void;
  onLayoutChange: (layout: WorkspaceLayout) => void;
  onFocus?: (id: string) => void;
};

function paneFor(status: string): "FORM" | "ATTACHMENTS" {
  return status === "UNDER_CLIENT_FINAL_REVIEW" ||
    status === "FINAL_APPROVED" ||
    status === "UNDER_CLIENT_REVIEW"
    ? "ATTACHMENTS"
    : "FORM";
}

export default function ReportWorkspaceModal({
  open,
  reports,
  mode,
  layout,
  activeId,
  correctionKinds = [],
  onClose,
  onLayoutChange,
  onFocus,
}: Props) {
  const reportRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);
  const topChipRefs = React.useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );

  const { user } = useAuth();

  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const showReportNumberForRoles = new Set([
    "MICRO",
    "CHEMISTRY",
    "MC",
    "QA",
    "FRONTDESK",
    "ADMIN",
    "SYSTEMADMIN",
  ]);

  const useReportNumberChip = showReportNumberForRoles.has(
    String(user?.role || ""),
  );

  function getChipLabel(r: ReportItem) {
    if (useReportNumberChip) {
      return r.reportNumber?.trim() || r.formNumber;
    }
    return r.formNumber;
  }

  const sortedReports = React.useMemo(() => {
    const copy = [...reports];

    copy.sort((a, b) => {
      const aLabel = getChipLabel(a).toLowerCase();
      const bLabel = getChipLabel(b).toLowerCase();

      return sortDir === "asc"
        ? aLabel.localeCompare(bLabel, undefined, { numeric: true })
        : bLabel.localeCompare(aLabel, undefined, { numeric: true });
    });

    return copy;
  }, [reports, sortDir, useReportNumberChip]);

  function scrollToReport(id: string) {
    const el = reportRefs.current[id];
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: layout === "VERTICAL" ? "start" : "nearest",
      inline: layout === "HORIZONTAL" ? "start" : "nearest",
    });
  }

  React.useEffect(() => {
    if (!open) return;
    if (!reports.length) return;

    const root = scrollAreaRef.current;
    if (!root) return;

    const visibleRatios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.reportId;
          if (!id) continue;

          visibleRatios.set(
            id,
            entry.isIntersecting ? entry.intersectionRatio : 0,
          );
        }

        let bestId: string | null = null;
        let bestRatio = -1;

        for (const r of sortedReports) {
          const ratio = visibleRatios.get(r.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = r.id;
          }
        }

        if (bestId && bestId !== activeId) {
          onFocus?.(bestId);
        }
      },
      {
        root,
        threshold: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85],
      },
    );

    for (const r of sortedReports) {
      const el = reportRefs.current[r.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [open, sortedReports, activeId, onFocus, layout]);

  React.useEffect(() => {
    if (!activeId) return;

    const chip = topChipRefs.current[activeId];
    if (!chip) return;

    chip.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeId]);

  if (!open || !reports.length) return null;

  const shouldLaunchCorrectionInUpdate =
    mode === "UPDATE" && correctionKinds.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[94vh] w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "VIEW"
                ? "Selected Reports Preview"
                : "Selected Reports Update"}
            </h2>
            <p className="text-sm text-slate-500">{reports.length} report(s)</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-1"
              title={`Sort ${sortDir === "asc" ? "Ascending" : "Descending"}`}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>

            <button
              type="button"
              onClick={() => onLayoutChange("VERTICAL")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                layout === "VERTICAL"
                  ? "bg-blue-600 text-white"
                  : "border hover:bg-slate-50"
              }`}
            >
              Vertical
            </button>

            <button
              type="button"
              onClick={() => onLayoutChange("HORIZONTAL")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                layout === "HORIZONTAL"
                  ? "bg-blue-600 text-white"
                  : "border hover:bg-slate-50"
              }`}
            >
              Horizontal
            </button>

            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="border-b px-6 py-2">
          <div className="flex gap-2 overflow-auto">
            {sortedReports.map((r) => (
              <button
                key={r.id}
                ref={(el) => {
                  topChipRefs.current[r.id] = el;
                }}
                type="button"
                onClick={() => {
                  onFocus?.(r.id);
                  scrollToReport(r.id);
                }}
                className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                  activeId === r.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "hover:bg-slate-50"
                }`}
              >
                {getChipLabel(r)}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollAreaRef} className="flex-1 overflow-auto px-6 py-4">
          <div
            className={
              layout === "VERTICAL"
                ? "space-y-6"
                : "flex min-w-max gap-6 items-start"
            }
          >
            {sortedReports.map((r) => (
              <div
                key={r.id}
                data-report-id={r.id}
                ref={(el) => {
                  reportRefs.current[r.id] = el;
                }}
                className={
                  layout === "VERTICAL"
                    ? "rounded-2xl border bg-slate-50 p-4"
                    : "w-[920px] shrink-0 rounded-2xl border bg-slate-50 p-4"
                }
              >
                <div className="mb-3">
                  <div className="font-semibold">{getChipLabel(r)}</div>
                  <div className="text-xs text-slate-500">
                    {r.formType} • {r.status}
                  </div>
                </div>

                {mode === "VIEW" ? (
                  <>
                    {r.formType === "MICRO_MIX" && (
                      <MicroMixReportFormView
                        report={r}
                        onClose={() => {}}
                        showSwitcher={false}
                        pane={paneFor(String(r.status))}
                      />
                    )}

                    {r.formType === "MICRO_MIX_WATER" && (
                      <MicroMixWaterReportFormView
                        report={r}
                        onClose={() => {}}
                        showSwitcher={false}
                        pane={paneFor(String(r.status))}
                      />
                    )}

                    {r.formType === "STERILITY" && (
                      <SterilityReportFormView
                        report={r}
                        onClose={() => {}}
                        showSwitcher={false}
                        pane={paneFor(String(r.status))}
                      />
                    )}

                    {r.formType === "CHEMISTRY_MIX" && (
                      <ChemistryMixReportFormView
                        report={r}
                        onClose={() => {}}
                        showSwitcher={false}
                        pane={paneFor(String(r.status))}
                      />
                    )}

                    {r.formType === "COA" && (
                      <COAReportFormView
                        report={r}
                        onClose={() => {}}
                        showSwitcher={false}
                        pane={paneFor(String(r.status))}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {r.formType === "MICRO_MIX" && (
                      <MicroMixReportForm
                        report={r}
                        embedded={true}
                        pageMode="UPDATE"
                        forcePageReadOnly={false}
                        hideTopActions={false}
                        hideBottomActions={false}
                        correctionLaunch={shouldLaunchCorrectionInUpdate}
                        correctionKinds={correctionKinds}
                        isWorkspaceActive={activeId === r.id}
                        onClose={() => {}}
                      />
                    )}
                    {r.formType === "MICRO_MIX_WATER" && (
                      <MicroMixWaterReportForm
                        report={r}
                        embedded={true}
                        pageMode="UPDATE"
                        forcePageReadOnly={false}
                        hideTopActions={false}
                        hideBottomActions={false}
                        correctionLaunch={shouldLaunchCorrectionInUpdate}
                        correctionKinds={correctionKinds}
                        isWorkspaceActive={activeId === r.id}
                        onClose={() => {}}
                      />
                    )}
                    {r.formType === "STERILITY" && (
                      <SterilityReportForm
                        report={r}
                        embedded={true}
                        pageMode="UPDATE"
                        forcePageReadOnly={false}
                        hideTopActions={false}
                        hideBottomActions={false}
                        correctionLaunch={shouldLaunchCorrectionInUpdate}
                        correctionKinds={correctionKinds}
                        isWorkspaceActive={activeId === r.id}
                        onClose={() => {}}
                      />
                    )}
                    {r.formType === "COA" && (
                      <COAReportForm
                        report={r}
                        embedded={true}
                        pageMode="UPDATE"
                        forcePageReadOnly={false}
                        hideTopActions={false}
                        hideBottomActions={false}
                        correctionLaunch={shouldLaunchCorrectionInUpdate}
                        correctionKinds={correctionKinds}
                        isWorkspaceActive={activeId === r.id}
                        onClose={() => {}}
                      />
                    )}

                    {r.formType === "CHEMISTRY_MIX" && (
                      <ChemistryMixSubmissionForm
                        report={r}
                        embedded={true}
                        pageMode="UPDATE"
                        forcePageReadOnly={false}
                        hideTopActions={false}
                        hideBottomActions={false}
                        correctionLaunch={shouldLaunchCorrectionInUpdate}
                        correctionKinds={correctionKinds}
                        isWorkspaceActive={activeId === r.id}
                        onClose={() => {}}
                      />
                    )}

                    {/* {r.formType !== "COA" && (
                      <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
                        Update mode not wired yet for {r.formType}.
                      </div>
                    )} */}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
