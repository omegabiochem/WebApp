export type DatePreset =
  | "ALL"
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "CUSTOM";

export function toDateOnlyISO_UTC(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


export function startOfDayISO(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
  return dt.toISOString();
}

export function endOfDayISO(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999));
  return dt.toISOString();
}


export function matchesDateRange(
  dateISO: string | null,
  from?: string,
  to?: string,
) {
  if (!dateISO) return true; // keep old ones visible if no date
  if (!from && !to) return true;

  const t = new Date(dateISO).getTime();
  if (Number.isNaN(t)) return true;

  if (from) {
    const fromT = new Date(startOfDayISO(from)).getTime();
    if (t < fromT) return false;
  }
  if (to) {
    const toT = new Date(endOfDayISO(to)).getTime();
    if (t > toT) return false;
  }
  return true;
}

export function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(d);
}
