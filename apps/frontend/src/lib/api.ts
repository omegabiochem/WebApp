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

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(API_URL + "/auth/refresh", {
          method: "POST",
          credentials: "include", // ✅ send omega_rt cookie
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) return null;
        const data = await res.json();

        if (data?.accessToken) {
          setToken(data.accessToken);
          if (data.user)
            localStorage.setItem("user", JSON.stringify(data.user));
          return data.accessToken as string;
        }
        return null;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  // only set JSON header when we actually send JSON
  if (
    !headers.has("Content-Type") &&
    init.body &&
    typeof init.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }

  const auth = getToken();
  if (auth) headers.set("Authorization", `Bearer ${auth}`);

  const doFetch = () =>
    fetch(API_URL + path, {
      ...init,
      headers,
      credentials: "include", // ✅ IMPORTANT: allow refresh cookie on all calls
    });

  let res = await doFetch();

  // 401? Try refresh ONCE, then retry original request
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await doFetch();
    }
  }

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  let body: any = null;
  try {
    body = isJson ? await res.json() : await res.text();
  } catch {
    body = null;
  }

  if (!res.ok) {
    // ✅ Only clear token if refresh also failed (still 401)
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
    err.body = body;
    throw err;
  }

  // @ts-expect-error allow void
  return isJson ? (body as T) : undefined;
}

// // apps/web/src/lib/api.ts
// export const API_URL = import.meta.env.VITE_API_URL as string;
// export const WS_URL = import.meta.env.VITE_WS_URL as string | undefined;

// let token = "";

// export function setToken(t: string) {
//   token = t;
//   localStorage.setItem("token", token);
// }
// export function clearToken() {
//   token = "";
//   localStorage.removeItem("token");
// }

// export function getToken() {
//   if (token) return token;
//   return localStorage.getItem("token");
// }

// export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
//   const headers = new Headers(init.headers);
//   if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

//   const auth = getToken();
//   if (auth) headers.set("Authorization", `Bearer ${auth}`);

//   const res = await fetch(API_URL + path, { ...init, headers });

//   const ct = res.headers.get("content-type") || "";
//   const isJson = ct.includes("application/json");

//   let body: any = null;
//   try {
//     body = isJson ? await res.json() : await res.text();
//   } catch {
//     body = null;
//   }

//   if (!res.ok) {
//     // auto logout on 401
//     if (res.status === 401) {
//       clearToken();
//       localStorage.removeItem("user");
//     }

//     const err: any = new Error(
//       (typeof body === "string" && body.trim()) ||
//         body?.message ||
//         body?.error ||
//         `HTTP ${res.status}`,
//     );
//     err.status = res.status;
//     err.body = body; // <-- keep structured errors
//     throw err;
//   }

//   // @ts-expect-error allow void
//   return isJson ? (body as T) : undefined;
// }// // apps/web/src/lib/api.ts
