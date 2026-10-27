type FormType =
  | "MICRO_MIX"
  | "MICRO_MIX_WATER"
  | "STERILITY"
  | "APE"
  | "CHEMISTRY_MIX"
  | "COA";

type ApeReportType = "APE_VALIDATION_REPORT" | "APE_REPORT";

const REPORT_PATHS: Record<FormType, string> = {
  MICRO_MIX: "/reports/micro-mix",
  MICRO_MIX_WATER: "/reports/micro-mix-water",
  STERILITY: "/reports/sterility",
  APE: "/reports/ape",
  CHEMISTRY_MIX: "/chemistry-reports/chemistry-mix",
  COA: "/chemistry-reports/coa",
};

export function getReportQrUrl(
  formType: FormType,
  reportId?: string | null,
): string {
  if (!reportId) return "";

  const baseUrl = String(
    import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin,
  ).replace(/\/+$/, "");

  const reportPath = REPORT_PATHS[formType];
  const encodedId = encodeURIComponent(reportId);

  return `${baseUrl}${reportPath}/${encodedId}?qr=1`;
}

export function getApeChildQrUrl(
  parentReportId?: string | null,
  reportType?: ApeReportType,
): string {
  if (!parentReportId || !reportType) return "";

  const parentUrl = getReportQrUrl("APE", parentReportId);

  return `${parentUrl}&apeTab=${encodeURIComponent(reportType)}`;
}
