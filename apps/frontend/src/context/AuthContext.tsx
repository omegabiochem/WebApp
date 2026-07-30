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
import {
  setToken as storeToken,
  clearToken,
  getToken,
  api,
} from "../lib/api";
import type { Role } from "../utils/roles";
import { socket } from "../lib/socket";

// type User = {
//   id: string;
//   email: string;
//   role: Role;
//   name?: string;
//   mustChangePassword?: boolean;
//   clientCode?: string;
// } | null;

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
  if (socket.connected) socket.disconnect();
  socket.connect();
}

const IDLE_MS = 15 * 60 * 1000;

// const IDLE_MS = 60 * 1000;
const LAST_ACTIVITY_KEY = "omega_last_activity";

function getLastActivity(): number {
  const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));

  return Number.isFinite(value) && value > 0 ? value : 0;
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // timers
  const idleTimerRef = useRef<number | null>(null);

  // prevent double logout calls
  const loggingOutRef = useRef(false);

  const lastRecordedActivityRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = null;
  }, []);

 const hardLogout = useCallback(() => {
  if (socket.connected) socket.disconnect();

  clearToken();
  localStorage.removeItem("user");
  localStorage.removeItem(LAST_ACTIVITY_KEY);

  setTokenState(null);
  setUser(null);

  clearTimers();
}, [clearTimers]);

  const logout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;

    try {
      // Best-effort server audit + clear refresh cookie
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      hardLogout();
      loggingOutRef.current = false;
    }
  }, [hardLogout]);



  const lastActivityPingRef = useRef(0);

  const pingActivity = useCallback(async () => {
    if (!getToken()) return;

    const now = Date.now();

    // do not call API every mouse move
    if (now - lastActivityPingRef.current < 60_000) return;

    lastActivityPingRef.current = now;

    try {
      await api("/auth/activity", { method: "POST" });
    } catch {
      // ignore
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

    // This supports users logged in before this update.
    if (!lastActivity) {
      lastActivity = Date.now();
      localStorage.setItem(
        LAST_ACTIVITY_KEY,
        String(lastActivity),
      );
    }

    const inactiveTime = Date.now() - lastActivity;
    const remainingTime = IDLE_MS - inactiveTime;

    if (remainingTime <= 0) {
      void logout();
      return;
    }

    idleTimerRef.current = window.setTimeout(() => {
      if (disposed) return;

      const latestActivity = getLastActivity();
      const inactiveFor = Date.now() - latestActivity;

      if (!latestActivity || inactiveFor >= IDLE_MS) {
        void logout();
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

  if (
    previousActivity &&
    now - previousActivity >= IDLE_MS
  ) {
    void logout();
    return;
  }

  // Prevent excessive localStorage writes from mouse movement.
  if (now - lastRecordedActivityRef.current < 1000) {
    return;
  }

  lastRecordedActivityRef.current = now;

  localStorage.setItem(
    LAST_ACTIVITY_KEY,
    String(now),
  );

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

  document.addEventListener(
    "visibilitychange",
    onVisibilityChange,
  );

  window.addEventListener("focus", onFocus);
  window.addEventListener("storage", onStorageChange);

  return () => {
    disposed = true;
    clearTimers();

    activityEvents.forEach((eventName) => {
      window.removeEventListener(eventName, onActivity);
    });

    document.removeEventListener(
      "visibilitychange",
      onVisibilityChange,
    );

    window.removeEventListener("focus", onFocus);
    window.removeEventListener(
      "storage",
      onStorageChange,
    );
  };
}, [
  isAuthenticated,
  logout,
  pingActivity,
  clearTimers,
]);

  // init session on load
  useEffect(() => {
    const init = async () => {
    const t = getToken();

if (!t) {
  localStorage.removeItem("user");
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  return;
}

const lastActivity = getLastActivity();

if (
  lastActivity &&
  Date.now() - lastActivity >= IDLE_MS
) {
  hardLogout();
  return;
}

// Support sessions created before adding LAST_ACTIVITY_KEY.
if (!lastActivity) {
  localStorage.setItem(
    LAST_ACTIVITY_KEY,
    String(Date.now()),
  );
}

      try {
        // api.ts will auto-refresh if needed (via /auth/refresh)
        const me = await api<User>("/auth/me");

        // set state from current token value (may have been refreshed)
        const latestToken = getToken();
        if (latestToken) {
          setTokenState(latestToken);
          connectSocketWithToken(latestToken);
        } else {
          // if token vanished, treat as logged out
          hardLogout();
          return;
        }

        setUser(me);
        localStorage.setItem("user", JSON.stringify(me));

       
      } catch {
        hardLogout();
      }
    };

    init();
  }, [hardLogout]);

const login = useCallback(
  (t: string, u: User) => {
    storeToken(t);
    setTokenState(t);

    // Login counts as the beginning of an active session.
    localStorage.setItem(
      LAST_ACTIVITY_KEY,
      String(Date.now()),
    );

    connectSocketWithToken(t);

    if (u) {
      setUser(u);
      localStorage.setItem("user", JSON.stringify(u));
    } else {
      api<User>("/auth/me")
        .then((me) => {
          setUser(me);
          localStorage.setItem(
            "user",
            JSON.stringify(me),
          );
        })
        .catch(() => {
          hardLogout();
        });
    }
  },
  [hardLogout],
);

  // If token removed (e.g. refresh failed and api.ts cleared it), reflect it in state
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
