// import {
//   createContext,
//   useContext,
//   useState,
//   type ReactNode,
//   useEffect,
// } from "react";
// import { setToken as storeToken, clearToken, getToken, api } from "../lib/api";
// import type { Role } from "../utils/roles";
// import { socket } from "../lib/socket"; // ✅ add

// type User = {
//   id: string;
//   email: string;
//   role: Role;
//   name?: string;
//   mustChangePassword?: boolean;
//   clientCode?: string;
// } | null;

// type AuthContextType = {
//   user: User;
//   token: string | null;
//   login: (t: string, u: User) => void;
//   logout: () => void;
// };

// const Ctx = createContext<AuthContextType>({
//   user: null,
//   token: null,
//   login: () => {},
//   logout: () => {},
// });

// function connectSocketWithToken(t: string) {
//   if (!t) return;
//   socket.auth = { token: t };

//   // If it somehow connected without token earlier, force reset
//   if (socket.connected) socket.disconnect();

//   socket.connect();
// }


// export function AuthProvider({ children }: { children: ReactNode }) {
//   const [user, setUser] = useState<User>(null);
//   const [token, setTokenState] = useState<string | null>(null);

//   useEffect(() => {
//     const init = async () => {
//       const t = getToken();
//       if (!t) {
//         localStorage.removeItem("user");
//         return;
//       }
//       try {
//         const me = await api<User>("/auth/me");
//         setTokenState(t);
//         setUser(me);
//         localStorage.setItem("user", JSON.stringify(me));

//         // ✅ connect socket after token is validated
//       connectSocketWithToken(t);

//       } catch {
//         clearToken();
//         localStorage.removeItem("user");
//         setTokenState(null);
//         setUser(null);

//         if (socket.connected) socket.disconnect(); // ✅ ensure closed
//       }
//     };
//     init();
//   }, []);

//   const login = (t: string, u: User) => {
//     storeToken(t);
//     setTokenState(t);

//     // ✅ connect socket immediately after login
//   connectSocketWithToken(t);

//     if (u) {
//       setUser(u);
//       localStorage.setItem("user", JSON.stringify(u));
//     } else {
//       api<User>("/auth/me")
//         .then((me) => {
//           setUser(me);
//           localStorage.setItem("user", JSON.stringify(me));
//         })
//         .catch(() => {
//           clearToken();
//           localStorage.removeItem("user");
//           setTokenState(null);
//           setUser(null);

//           if (socket.connected) socket.disconnect(); // ✅
//         });
//     }
//   };

//   const logout = async () => {
//     try {
//       await api("/auth/logout", { method: "POST" });
//     } catch {}

//     // ✅ disconnect socket on logout
//     if (socket.connected) socket.disconnect();

//     clearToken();
//     localStorage.removeItem("user");
//     setTokenState(null);
//     setUser(null);
//   };

//   return (
//     <Ctx.Provider value={{ user, token, login, logout }}>
//       {children}
//     </Ctx.Provider>
//   );
// }

// export const useAuth = () => useContext(Ctx);




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
  id: string;
  email: string;
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

// ----------- helpers: jwt exp + timers -----------
function getJwtExpMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part));
    if (!payload?.exp) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

const IDLE_MS = 15 * 60 * 1000; // 15 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // timers
  const idleTimerRef = useRef<number | null>(null);
  const expTimerRef = useRef<number | null>(null);

  // prevent double logout calls
  const loggingOutRef = useRef(false);

  const clearTimers = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (expTimerRef.current) window.clearTimeout(expTimerRef.current);
    idleTimerRef.current = null;
    expTimerRef.current = null;
  };

  const hardLogout = useCallback(() => {
    // no network call, just drop local session immediately
    if (socket.connected) socket.disconnect();
    clearToken();
    localStorage.removeItem("user");
    setTokenState(null);
    setUser(null);
    clearTimers();
  }, []);

  const logout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;

    try {
      // Best effort server audit
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      hardLogout();
      loggingOutRef.current = false;
    }
  }, [hardLogout]);

  const scheduleIdleLogout = useCallback(() => {
    if (!token) return;

    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      // auto logout after inactivity
      logout();
    }, IDLE_MS);
  }, [token, logout]);

  const scheduleExpLogout = useCallback(
    (t: string) => {
      if (!t) return;
      if (expTimerRef.current) window.clearTimeout(expTimerRef.current);

      const expMs = getJwtExpMs(t);
      if (!expMs) return;

      const msLeft = expMs - Date.now();
      if (msLeft <= 0) {
        logout();
        return;
      }
      expTimerRef.current = window.setTimeout(() => logout(), msLeft);
    },
    [logout]
  );

  // Attach “activity” listeners when logged in
  useEffect(() => {
    if (!token) return;

    const onActivity = () => scheduleIdleLogout();

    // start timer immediately
    scheduleIdleLogout();

    // capture user activity
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    events.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
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

      // If JWT already expired, log out immediately
      const expMs = getJwtExpMs(t);
      if (expMs && expMs <= Date.now()) {
        hardLogout();
        return;
      }

      try {
        const me = await api<User>("/auth/me");
        setTokenState(t);
        setUser(me);
        localStorage.setItem("user", JSON.stringify(me));

        connectSocketWithToken(t);

        // schedule timers
        scheduleExpLogout(t);
        scheduleIdleLogout();
      } catch {
        hardLogout();
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // keep one-time init

  const login = useCallback(
    (t: string, u: User) => {
      storeToken(t);
      setTokenState(t);

      connectSocketWithToken(t);

      // schedule timers immediately
      scheduleExpLogout(t);
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
    [hardLogout, scheduleExpLogout, scheduleIdleLogout]
  );

  // If token changes (rare), reschedule exp timer
  useEffect(() => {
    if (!token) {
      clearTimers();
      return;
    }
    scheduleExpLogout(token);
  }, [token, scheduleExpLogout]);

  return (
    <Ctx.Provider value={{ user, token, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
