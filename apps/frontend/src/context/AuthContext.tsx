// apps/web/src/context/AuthContext.tsx
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { setToken as storeToken, clearToken, getToken, api } from "../lib/api";
import type { Role } from "../utils/roles";
import { socket } from "../lib/socket";

type User = {
  id?: string;
  userId?: string;
  sub?: string;
  uid?: string;
  email?: string;
  role: Role;
  name?: string;
  mustChangePassword?: boolean;
  clientCode?: string | null;

  authMode?: "NORMAL" | "COMMON";
  commonAccountId?: string | null;
  commonAccountUserId?: string | null;
  actingAsUserId?: string | null;
  actingAsName?: string | null;
} | null;

type LogoutReason = "MANUAL" | "IDLE_TIMEOUT";

type AuthContextType = {
  user: User;
  token: string | null;
  login: (t: string, u: User) => void;
  logout: () => void;
};

const Ctx = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

function connectSocketWithToken(t: string) {
  if (!t) return;

  socket.auth = { token: t };

  if (socket.connected) {
    socket.disconnect();
  }

  socket.connect();
}

const IDLE_MS = 15 * 60 * 1000;
const LAST_ACTIVITY_KEY = "omega_last_activity";

function getLastActivity(): number {
  const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setTokenState] = useState<string | null>(null);

  const idleTimerRef = useRef<number | null>(null);
  const loggingOutRef = useRef(false);
  const lastRecordedActivityRef = useRef(0);
  const lastActivityPingRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = null;
  }, []);

  const hardLogout = useCallback(() => {
    if (socket.connected) {
      socket.disconnect();
    }

    clearToken();
    localStorage.removeItem("user");
    localStorage.removeItem(LAST_ACTIVITY_KEY);

    setTokenState(null);
    setUser(null);

    clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    const onForceLogout = (payload: {
      reason?: string;
      clientCode?: string;
    }) => {
      console.log("🚪 auth:force-logout received", payload);

      /*
       * Immediately clear frontend authentication.
       *
       * Do NOT call /auth/logout here because
       * the admin already invalidated the
       * backend session.
       */
      hardLogout();

      /*
       * Immediately move user to login.
       */
      window.location.replace("/login");
    };

    socket.on("auth:force-logout", onForceLogout);

    return () => {
      socket.off("auth:force-logout", onForceLogout);
    };
  }, [hardLogout]);

  const performLogout = useCallback(
    async (reason: LogoutReason) => {
      if (loggingOutRef.current) return;

      loggingOutRef.current = true;

      try {
        await api("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
      } catch {
        /*
         * At the 15-minute boundary, the access token may already be
         * expired. api.ts will try /auth/refresh, and the backend refresh
         * method records the IDLE_TIMEOUT audit as a fallback.
         */
      } finally {
        hardLogout();
        loggingOutRef.current = false;
      }
    },
    [hardLogout],
  );

  // Keep the public logout function argument-free so existing
  // onClick={logout} buttons do not pass a click event as the reason.
  const logout = useCallback(() => {
    void performLogout("MANUAL");
  }, [performLogout]);

  const pingActivity = useCallback(async () => {
    if (!getToken()) return;

    const now = Date.now();

    // Do not call the API for every mouse movement.
    if (now - lastActivityPingRef.current < 60_000) return;

    lastActivityPingRef.current = now;

    try {
      await api("/auth/activity", { method: "POST" });
    } catch {
      // A failed activity ping must not crash the application.
    }
  }, []);

  const isAuthenticated = Boolean(token);

  useEffect(() => {
    if (!isAuthenticated) return;

    let disposed = false;

    const armIdleTimer = () => {
      if (disposed || !getToken()) return;

      clearTimers();

      let lastActivity = getLastActivity();

      // Support users whose session began before this key existed.
      if (!lastActivity) {
        lastActivity = Date.now();
        localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivity));
      }

      const inactiveTime = Date.now() - lastActivity;
      const remainingTime = IDLE_MS - inactiveTime;

      if (remainingTime <= 0) {
        void performLogout("IDLE_TIMEOUT");
        return;
      }

      idleTimerRef.current = window.setTimeout(() => {
        if (disposed) return;

        const latestActivity = getLastActivity();
        const inactiveFor = Date.now() - latestActivity;

        if (!latestActivity || inactiveFor >= IDLE_MS) {
          void performLogout("IDLE_TIMEOUT");
        } else {
          // Activity may have occurred in another browser tab.
          armIdleTimer();
        }
      }, remainingTime);
    };

    const onActivity = () => {
      if (loggingOutRef.current || !getToken()) return;

      const now = Date.now();
      const previousActivity = getLastActivity();

      /*
       * When the browser suspended timers and the user returns after the
       * timeout, log out instead of allowing the new event to revive the
       * session.
       */
      if (previousActivity && now - previousActivity >= IDLE_MS) {
        void performLogout("IDLE_TIMEOUT");
        return;
      }

      // Prevent excessive localStorage writes from mouse movement.
      if (now - lastRecordedActivityRef.current < 1000) {
        return;
      }

      lastRecordedActivityRef.current = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));

      armIdleTimer();
      void pingActivity();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        armIdleTimer();
      }
    };

    const onFocus = () => {
      armIdleTimer();
    };

    const onStorageChange = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) {
        armIdleTimer();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "click",
      "keydown",
      "scroll",
      "wheel",
      "touchstart",
    ];

    armIdleTimer();

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, {
        passive: true,
      });
    });

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorageChange);

    return () => {
      disposed = true;
      clearTimers();

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });

      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorageChange);
    };
  }, [isAuthenticated, performLogout, pingActivity, clearTimers]);

  // Initialize the session on application load.
  useEffect(() => {
    const init = async () => {
      const currentToken = getToken();

      if (!currentToken) {
        localStorage.removeItem("user");
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        return;
      }

      const lastActivity = getLastActivity();

      if (lastActivity && Date.now() - lastActivity >= IDLE_MS) {
        await performLogout("IDLE_TIMEOUT");
        return;
      }

      // Support sessions created before LAST_ACTIVITY_KEY was added.
      if (!lastActivity) {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      }

      try {
        // api.ts automatically attempts /auth/refresh when needed.
        const me = await api<User>("/auth/me");

        // The token may have been refreshed while loading /auth/me.
        const latestToken = getToken();

        if (!latestToken) {
          hardLogout();
          return;
        }

        setTokenState(latestToken);
        connectSocketWithToken(latestToken);

        setUser(me);
        localStorage.setItem("user", JSON.stringify(me));
      } catch {
        hardLogout();
      }
    };

    void init();
  }, [hardLogout, performLogout]);

  const login = useCallback(
    (newToken: string, newUser: User) => {
      storeToken(newToken);
      setTokenState(newToken);

      // Login starts a new active session.
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

      connectSocketWithToken(newToken);

      if (newUser) {
        setUser(newUser);
        localStorage.setItem("user", JSON.stringify(newUser));
        return;
      }

      api<User>("/auth/me")
        .then((me) => {
          setUser(me);
          localStorage.setItem("user", JSON.stringify(me));
        })
        .catch(() => {
          hardLogout();
        });
    },
    [hardLogout],
  );

  // Reflect token changes made by another browser tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "token") return;

      const newToken = event.newValue;

      // Another browser tab logged out.
      if (!newToken) {
        hardLogout();
        return;
      }

      // Another tab refreshed or changed the token.
      storeToken(newToken);
      setTokenState(newToken);
      connectSocketWithToken(newToken);
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [hardLogout]);

  return (
    <Ctx.Provider value={{ user, token, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
