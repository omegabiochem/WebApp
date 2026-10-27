const STORAGE_KEY = "omegaReportLoginRedirect";

type ReturnLocation = {
  pathname?: string;
  search?: string;
};

const REPORT_PATHS = [
  /^\/reports\/micro-mix\/[^/]+$/,
  /^\/reports\/micro-mix-water\/[^/]+$/,
  /^\/reports\/sterility\/[^/]+$/,
  /^\/reports\/ape\/[^/]+$/,
  /^\/chemistry-reports\/chemistry-mix\/[^/]+$/,
  /^\/chemistry-reports\/coa\/[^/]+$/,
];

function isReportPath(pathname: string): boolean {
  return REPORT_PATHS.some((pattern) => pattern.test(pathname));
}

function buildSafeReportRedirect(
  pathname: string,
  search: string,
): string | null {
  if (!isReportPath(pathname)) return null;

  const params = new URLSearchParams(search);

  // QR redirect is only for links explicitly opened in QR mode.
  if (params.get("qr") !== "1") return null;

  const safeParams = new URLSearchParams();
  safeParams.set("qr", "1");

  if (pathname.startsWith("/reports/ape/")) {
    const apeTab = params.get("apeTab");

    if (apeTab === "APE_VALIDATION_REPORT" || apeTab === "APE_REPORT") {
      safeParams.set("apeTab", apeTab);
    }
  }

  return `${pathname}?${safeParams.toString()}`;
}

export function saveReportLoginRedirect(
  location: ReturnLocation | null | undefined,
): void {
  const pathname = location?.pathname ?? "";
  const search = location?.search ?? "";

  const redirect = buildSafeReportRedirect(pathname, search);

  if (!redirect) return;

  sessionStorage.setItem(STORAGE_KEY, redirect);
}

export function takeReportLoginRedirect(fallback: string): string {
  const saved = sessionStorage.getItem(STORAGE_KEY);

  sessionStorage.removeItem(STORAGE_KEY);

  if (!saved) return fallback;

  try {
    const url = new URL(saved, window.location.origin);

    if (url.origin !== window.location.origin) {
      return fallback;
    }

    return buildSafeReportRedirect(url.pathname, url.search) ?? fallback;
  } catch {
    return fallback;
  }
}
