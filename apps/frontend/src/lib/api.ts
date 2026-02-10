

// apps/web/src/lib/api.ts
export const API_URL = import.meta.env.VITE_API_URL as string;
export const WS_URL = import.meta.env.VITE_WS_URL as string | undefined;

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

  const auth = getToken();
  if (auth) headers.set("Authorization", `Bearer ${auth}`);

  const res = await fetch(API_URL + path, { ...init, headers });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  let body: any = null;
  try {
    body = isJson ? await res.json() : await res.text();
  } catch {
    body = null;
  }

  if (!res.ok) {
    // auto logout on 401
    if (res.status === 401) {
      clearToken();
      localStorage.removeItem("user");
    }

    const err: any = new Error(
      (typeof body === "string" && body.trim()) ||
        body?.message ||
        body?.error ||
        `HTTP ${res.status}`,
    );
    err.status = res.status;
    err.body = body; // <-- keep structured errors
    throw err;
  }

  // @ts-expect-error allow void
  return isJson ? (body as T) : undefined;
}// // apps/web/src/lib/api.ts
