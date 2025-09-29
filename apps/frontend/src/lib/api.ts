const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
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

  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) throw new Error((await res.text().catch(()=>'')) || `HTTP ${res.status}`);

  const ct = res.headers.get("content-type") || "";
  // @ts-expect-error allow void
  return ct.includes("application/json") ? await res.json() as T : undefined;
}


