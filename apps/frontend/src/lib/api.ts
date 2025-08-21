const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
let token = "";

export function setToken(t: string) {
  token = t;
  localStorage.setItem("token", token);
}
export function clearToken() {
  localStorage.removeItem("token");
  token = "";
}

export function getToken() {
  if (token) return token;
  return localStorage.getItem("token");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Normalize whatever init.headers is (Headers | string[][] | Record<string,string>)
  const headers = new Headers(init.headers);

  // Always send JSON unless caller overrides later
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Only set Authorization when we have a token
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(BASE + path, {
    ...init,
    headers, // safe, always the right shape
  });

  if (!res.ok) {
    // Try to surface server error text
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  // If the API sometimes returns 204/empty, guard it:
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // @ts-expect-error – caller should type T as void or string for non‑JSON
    return undefined;
  }
  return (await res.json()) as T;
}
