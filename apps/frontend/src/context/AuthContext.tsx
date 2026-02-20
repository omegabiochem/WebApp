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

// type User = {
//   id: string;
//   email: string;
//   role: Role;
//   name?: string;
//   mustChangePassword?: boolean;
//   clientCode?: string;
// } | null;

type User = {
  userId?: string;
  sub?: string;
  uid?: string;
  email?: string;
  role: Role;
  name?: string;
  mustChangePassword?: boolean;
  clientCode?: string;
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

const IDLE_MS = 15 * 60 * 1000; // 15 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // timers
  const idleTimerRef = useRef<number | null>(null);

  // prevent double logout calls
  const loggingOutRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const hardLogout = useCallback(() => {
    // no network call, just drop local session immediately
    if (socket.connected) socket.disconnect();
    clearToken();
    localStorage.removeItem("user");
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

  const scheduleIdleLogout = useCallback(() => {
    if (!getToken()) return;

    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      logout();
    }, IDLE_MS);
  }, [logout]);

  // Attach “activity” listeners when logged in
  useEffect(() => {
    if (!token) return;

    const onActivity = () => scheduleIdleLogout();

    // start timer immediately
    scheduleIdleLogout();

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    events.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    );

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity as any));
    };
  }, [token, scheduleIdleLogout]);

  // init session on load
  useEffect(() => {
    const init = async () => {
      const t = getToken();
      if (!t) {
        localStorage.removeItem("user");
        return;
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

        scheduleIdleLogout();
      } catch {
        hardLogout();
      }
    };

    init();
  }, [hardLogout, scheduleIdleLogout]);

  const login = useCallback(
    (t: string, u: User) => {
      storeToken(t);
      setTokenState(t);

      connectSocketWithToken(t);

      scheduleIdleLogout();

      if (u) {
        setUser(u);
        localStorage.setItem("user", JSON.stringify(u));
      } else {
        api<User>("/auth/me")
          .then((me) => {
            setUser(me);
            localStorage.setItem("user", JSON.stringify(me));
          })
          .catch(() => {
            hardLogout();
          });
      }
    },
    [hardLogout, scheduleIdleLogout],
  );

  // If token removed (e.g. refresh failed and api.ts cleared it), reflect it in state
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "token") return;
      const t = getToken();
      if (!t) {
        // token cleared elsewhere → logout locally
        hardLogout();
      } else {
        setTokenState(t);
        connectSocketWithToken(t);
        scheduleIdleLogout();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hardLogout, scheduleIdleLogout]);

  return (
    <Ctx.Provider value={{ user, token, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
