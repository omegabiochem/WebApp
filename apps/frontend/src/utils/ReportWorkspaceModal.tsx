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
import ApeReportFormView from "../pages/Reports/ApeReportFormView";
import ApeReportForm from "../pages/Reports/ApeReportForm";
import ApeValidationReport from "../pages/LabReports/ApeValidationReport";
import ApeReport from "../pages/LabReports/ApeReport";
import { api } from "../lib/api";

type WorkspaceMode = "VIEW" | "UPDATE";
type WorkspaceLayout = "VERTICAL" | "HORIZONTAL";

type ViewPane = "FORM" | "REPORT" | "ATTACHMENTS";

type ReportItem = {
  id: string;
  formType: string;
  formNumber: string;
  reportNumber?: string | null;
  status: string;
  version?: number;

  client?: string | null;
  clientCode?: string | null;
  dateSent?: string | null;
  typeOfTest?: string | null;
  sampleType?: string | null;
  formulaNo?: string | null;
  description?: string | null;
  lotNo?: string | null;
  manufactureDate?: string | null;

  testSopNo?: string | null;
  testReference?: string | null;
  dateTested?: string | null;
  dateCompleted?: string | null;

  kind?: string;
};

type CorrectionLaunchKind = "REQUEST_CHANGE" | "RAISE_CORRECTION";
type ApeWorkspaceReportTab = "APE_VALIDATION_REPORT" | "APE_REPORT";
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
  onReportChanged?: (updated: any) => void;
};

function paneFor(status: string): ViewPane {
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
  onReportChanged,
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

  const [paneByReportId, setPaneByReportId] = React.useState<
    Record<string, ViewPane>
  >({});

  const [apeReportTabs, setApeReportTabs] = React.useState<
    Record<string, ApeWorkspaceReportTab>
  >({});

  const [apeChildReports, setApeChildReports] = React.useState<
    Record<string, any>
  >({});

  React.useEffect(() => {
    if (!open) return;

    const apeParents = reports.filter((r) => r.formType === "APE");
    if (!apeParents.length) return;

    let cancelled = false;

    async function loadSavedApeChildren() {
      const next: Record<string, any> = {};

      await Promise.all(
        apeParents.flatMap((parent) =>
          (
            ["APE_VALIDATION_REPORT", "APE_REPORT"] as ApeWorkspaceReportTab[]
          ).map(async (reportType) => {
            try {
              const child = await api<any>(
                `/reports/ape-child/by-parent?parentReportId=${encodeURIComponent(
                  parent.id,
                )}&reportType=${reportType}`,
              );

              if (!child?.id) return;

              next[apeChildKey(parent.id, reportType)] = {
                ...parent,
                ...child,
                reportType,
                parentReportId: parent.id,

                parentStatus: parent.status,
                workflowStatus: parent.status,
                parentVersion: parent.version ?? 0,

                childStatus: child.status,
                childVersion: child.version,

                // ✅ child screen follows parent workflow status
                status: parent.status,

                clientCode:
                  child.clientCode ||
                  parent.clientCode ||
                  String(parent.formNumber || "").split("-")[0] ||
                  "",
              };
            } catch (e) {
              console.error("Failed to load APE child report", e);
            }
          }),
        ),
      );

      if (cancelled) return;
      if (!Object.keys(next).length) return;

      setApeChildReports((prev) => ({
        ...prev,
        ...next,
      }));
    }

    loadSavedApeChildren();

    return () => {
      cancelled = true;
    };
  }, [open, reports]);

  if (!open || !reports.length) return null;

  const shouldLaunchCorrectionInUpdate =
    mode === "UPDATE" && correctionKinds.length > 0;

  const isSingleReport = sortedReports.length === 1;

  function handleReportChanged(original: ReportItem, updated: any) {
    onReportChanged?.({
      ...original,
      ...updated,
      id: original.id,
      status: updated?.status ?? original.status,
      reportNumber: updated?.reportNumber ?? original.reportNumber,
      version:
        typeof updated?.version === "number"
          ? updated.version
          : (original as any).version,
    });
  }

  function getApeReportTab(parentId: string): ApeWorkspaceReportTab {
    return apeReportTabs[parentId] ?? "APE_VALIDATION_REPORT";
  }

  function setApeReportTab(parentId: string, tab: ApeWorkspaceReportTab) {
    setApeReportTabs((prev) => ({
      ...prev,
      [parentId]: tab,
    }));
  }

  function apeChildKey(parentId: string, reportType: ApeWorkspaceReportTab) {
    return `${parentId}:${reportType}`;
  }

  function makeApeChildReport(
    parent: ReportItem,
    reportType: ApeWorkspaceReportTab,
  ) {
    const key = apeChildKey(parent.id, reportType);
    const saved = apeChildReports[key];

    if (saved) {
      return {
        ...parent,
        ...saved,

        // child identity
        id: saved.id,
        reportType,
        parentReportId: parent.id,

        // ✅ parent workflow source
        parentStatus: parent.status,
        workflowStatus: parent.status,
        parentVersion: parent.version ?? 0,

        // keep child info separately
        childStatus: saved.status,
        childVersion: saved.version,

        // ✅ child screen should use parent status
        status: parent.status,
      };
    }

    return {
      ...parent,
      id: null,
      parentReportId: parent.id,
      reportType,

      // ✅ parent workflow source
      parentStatus: parent.status,
      workflowStatus: parent.status,
      parentVersion: parent.version ?? 0,

      childStatus: "DRAFT",
      childVersion: 0,

      // ✅ start child screen from parent status
      status: parent.status || "UNDER_TESTING_REVIEW",

      reportNumber: "",
      formType: undefined,

      clientCode:
        parent.clientCode ||
        String(parent.formNumber || "").split("-")[0] ||
        "",
      dateSent: parent.dateSent ?? "",
      typeOfTest: parent.typeOfTest ?? "APE",
      sampleType: parent.sampleType ?? "",
      formulaNo: parent.formulaNo ?? "",
      description: parent.description ?? "",
      lotNo: parent.lotNo ?? "",
      manufactureDate: parent.manufactureDate ?? "",
      testSopNo: (parent as any).testSopNo ?? "",
      testReference: (parent as any).testReference ?? "USP <51> CURRENT",
      dateTested: parent.dateTested ?? "",
      dateCompleted: (parent as any).dateCompleted ?? "",
    };
  }

  function handleApeChildChanged(
    parent: ReportItem,
    reportType: ApeWorkspaceReportTab,
    updated: any,
  ) {
    const key = apeChildKey(parent.id, reportType);
    const base = makeApeChildReport(parent, reportType);

    setApeChildReports((prev) => ({
      ...prev,
      [key]: {
        ...base,
        ...updated,

        id: updated?.id ?? base.id,
        reportType,
        parentReportId: parent.id,

        parentStatus: parent.status,
        workflowStatus: parent.status,
        parentVersion: parent.version ?? 0,

        // ✅ parent status remains source of truth
        status: parent.status,

        childStatus: updated?.status,
        childVersion: updated?.version,
      },
    }));
  }

  function handleApeParentStatusChanged(parent: ReportItem, updated: any) {
    const nextStatus = updated?.status ?? parent.status;

    const nextVersion =
      typeof updated?.version === "number"
        ? updated.version
        : (parent.version ?? 0) + 1;

    const mergedParent = {
      ...parent,
      ...updated,

      // ✅ keep parent identity
      id: parent.id,
      formType: parent.formType,

      status: nextStatus,
      version: nextVersion,
      reportNumber: updated?.reportNumber ?? parent.reportNumber,
    };

    // ✅ notify dashboard with parent row, not child row
    onReportChanged?.(mergedParent);

    // ✅ update both APE child tabs locally
    setApeChildReports((prev) => {
      const next = { ...prev };

      (
        ["APE_VALIDATION_REPORT", "APE_REPORT"] as ApeWorkspaceReportTab[]
      ).forEach((reportType) => {
        const key = apeChildKey(parent.id, reportType);

        if (next[key]) {
          next[key] = {
            ...next[key],
            parentStatus: nextStatus,
            workflowStatus: nextStatus,
            parentVersion: nextVersion,
            status: nextStatus,
          };
        }
      });

      return next;
    });
  }

  function renderApeReportSubTabs(parent: ReportItem, readOnly: boolean) {
    const activeTab = getApeReportTab(parent.id);

    const tabButtonClass = (tab: ApeWorkspaceReportTab) =>
      [
        "rounded-lg px-3 py-1.5 text-sm font-semibold border transition",
        activeTab === tab
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ");

    return (
      <div className="space-y-3">
        <div className="rounded-xl border bg-white px-3 py-2">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            APE Reports
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={tabButtonClass("APE_VALIDATION_REPORT")}
              onClick={() =>
                setApeReportTab(parent.id, "APE_VALIDATION_REPORT")
              }
            >
              APE Validation Report
            </button>

            <button
              type="button"
              className={tabButtonClass("APE_REPORT")}
              onClick={() => setApeReportTab(parent.id, "APE_REPORT")}
            >
              APE Report
            </button>
          </div>
        </div>

        {activeTab === "APE_VALIDATION_REPORT" && (
          <ApeValidationReport
            report={makeApeChildReport(parent, "APE_VALIDATION_REPORT")}
            embedded={true}
            pageMode={readOnly ? "VIEW" : "UPDATE"}
            forcePageReadOnly={readOnly}
            hideTopActions={false}
            hideBottomActions={false}
            onClose={() => {}}
            onSaved={(updated) =>
              handleApeChildChanged(parent, "APE_VALIDATION_REPORT", updated)
            }
            onStatusChanged={(updated) =>
              handleApeParentStatusChanged(parent, updated)
            }
          />
        )}

        {activeTab === "APE_REPORT" && (
          <ApeReport
            report={makeApeChildReport(parent, "APE_REPORT")}
            embedded={true}
            pageMode={readOnly ? "VIEW" : "UPDATE"}
            forcePageReadOnly={readOnly}
            hideTopActions={false}
            hideBottomActions={false}
            onClose={() => {}}
            onSaved={(updated) =>
              handleApeChildChanged(parent, "APE_REPORT", updated)
            }
            onStatusChanged={(updated) =>
              handleApeParentStatusChanged(parent, updated)
            }
          />
        )}
      </div>
    );
  }

  function getPane(r: ReportItem): ViewPane {
    if (
      r.formType === "APE" &&
      mode === "UPDATE" &&
      String(user?.role || "") !== "CLIENT"
    ) {
      return paneByReportId[r.id] ?? "REPORT";
    }

    return paneByReportId[r.id] ?? paneFor(String(r.status));
  }

  function setPane(r: ReportItem, pane: ViewPane) {
    setPaneByReportId((prev) => ({
      ...prev,
      [r.id]: pane,
    }));
  }

  function renderMainTabs(r: ReportItem) {
    const activePane = getPane(r);

    const btnClass = (pane: ViewPane) =>
      [
        "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200",
        activePane === pane
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-blue-600",
      ].join(" ");

    return (
      <div className="no-print mb-3 flex justify-center">
        <div className="inline-flex items-center rounded-full border border-slate-300 bg-white p-1 shadow-sm">
          {(["FORM", "REPORT", "ATTACHMENTS"] as ViewPane[]).map((pane) => (
            <button
              key={pane}
              type="button"
              onClick={() => setPane(r, pane)}
              className={btnClass(pane)}
            >
              {pane === "ATTACHMENTS"
                ? "Attachments"
                : pane[0] + pane.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderApeWorkspaceBody(r: ReportItem) {
    const pane = getPane(r);
    const readOnly = mode === "VIEW";

    if (pane === "REPORT") {
      return renderApeReportSubTabs(r, readOnly);
    }

    if (pane === "ATTACHMENTS") {
      return (
        <ApeReportFormView
          report={r}
          onClose={() => {}}
          showSwitcher={false}
          pane="ATTACHMENTS"
        />
      );
    }

    // FORM tab
    if (mode === "VIEW") {
      return (
        <ApeReportFormView
          report={r}
          onClose={() => {}}
          showSwitcher={false}
          pane="FORM"
        />
      );
    }

    return (
      <ApeReportForm
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
        onSaved={(updated) => handleReportChanged(r, updated)}
        onStatusChanged={(updated) => handleReportChanged(r, updated)}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={
          isSingleReport
            ? "mx-auto flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            : "flex h-[94vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        }
      >
        <div className="sticky top-0 z-10 relative flex items-center justify-between border-b bg-white px-6 py-4">
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

            {!isSingleReport && (
              <>
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
              </>
            )}

            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {!isSingleReport && (
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
        )}

        <div
          ref={scrollAreaRef}
          className={
            isSingleReport
              ? "flex-1 overflow-auto bg-slate-100 px-4 py-5"
              : "flex-1 overflow-auto px-6 py-4"
          }
        >
          <div
            className={
              isSingleReport
                ? "mx-auto max-w-[920px]"
                : layout === "VERTICAL"
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
                  isSingleReport
                    ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    : layout === "VERTICAL"
                      ? "rounded-2xl border bg-slate-50 p-4"
                      : "w-[920px] shrink-0 rounded-2xl border bg-slate-50 p-4"
                }
              >
                {/* KEEP OLD MAIN DESIGN EXACTLY */}
                <div
                  className={
                    isSingleReport
                      ? "mb-4 flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-3"
                      : "mb-3"
                  }
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {getChipLabel(r)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.formType} • {r.status}
                    </div>
                  </div>

                  {isSingleReport && (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                      {mode === "VIEW" ? "View Mode" : "Update Mode"}
                    </span>
                  )}
                </div>

                {/* ONLY APE gets Form / Report / Attachments tabs here */}
                {r.formType === "APE" && renderMainTabs(r)}

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

                    {r.formType === "APE" && renderApeWorkspaceBody(r)}

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
                        onSaved={(updated) => handleReportChanged(r, updated)}
                        onStatusChanged={(updated) =>
                          handleReportChanged(r, updated)
                        }
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
                        onSaved={(updated) => handleReportChanged(r, updated)}
                        onStatusChanged={(updated) =>
                          handleReportChanged(r, updated)
                        }
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
                        onSaved={(updated) => handleReportChanged(r, updated)}
                        onStatusChanged={(updated) =>
                          handleReportChanged(r, updated)
                        }
                      />
                    )}

                    {r.formType === "APE" && renderApeWorkspaceBody(r)}

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
                        onSaved={(updated) => handleReportChanged(r, updated)}
                        onStatusChanged={(updated) =>
                          handleReportChanged(r, updated)
                        }
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
                        onSaved={(updated) => handleReportChanged(r, updated)}
                        onStatusChanged={(updated) =>
                          handleReportChanged(r, updated)
                        }
                      />
                    )}
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
