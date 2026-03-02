export function rememberedPath(path: string) {
  const saved = sessionStorage.getItem(`lastSearch:${path}`) || "";
  return `${path}${saved}`;
}

export function getParam(sp: URLSearchParams, key: string, fallback = "") {
  return sp.get(key) ?? fallback;
}

export function getEnum<T extends string>(
  sp: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = sp.get(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function getInt(sp: URLSearchParams, key: string, fallback: number) {
  const raw = sp.get(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
