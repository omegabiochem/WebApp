
// apps/web/src/lib/api.ts
export const API_URL = import.meta.env.VITE_API_URL as string;
export const WS_URL  = import.meta.env.VITE_WS_URL as string | undefined;

// usage
// await fetch(`${API_URL}/auth/login`, { method: 'POST', ... });

let token = "";

export function setToken(t: string) {
  token = t;
  localStorage.setItem("token", token);
}
export function clearToken() {
  token = "";
  localStorage.removeItem("token");
}

export function getToken() {
  if (token) return token;
  return localStorage.getItem("token");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const auth = getToken();                            // ✅ always read
  if (auth) headers.set("Authorization", `Bearer ${auth}`);

  const res = await fetch(API_URL + path, { ...init, headers });
  if (!res.ok) throw new Error((await res.text().catch(()=>'')) || `HTTP ${res.status}`);

  const ct = res.headers.get("content-type") || "";
  // @ts-expect-error allow void
  return ct.includes("application/json") ? await res.json() as T : undefined;
}


