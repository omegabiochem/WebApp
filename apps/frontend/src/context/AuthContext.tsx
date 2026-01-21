import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useEffect,
} from "react";
import { setToken as storeToken, clearToken, getToken, api } from "../lib/api";
import type { Role } from "../utils/roles";
import { socket } from "../lib/socket"; // ✅ add

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

  // If it somehow connected without token earlier, force reset
  if (socket.connected) socket.disconnect();

  socket.connect();
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const t = getToken();
      if (!t) {
        localStorage.removeItem("user");
        return;
      }
      try {
        const me = await api<User>("/auth/me");
        setTokenState(t);
        setUser(me);
        localStorage.setItem("user", JSON.stringify(me));

        // ✅ connect socket after token is validated
      connectSocketWithToken(t);

      } catch {
        clearToken();
        localStorage.removeItem("user");
        setTokenState(null);
        setUser(null);

        if (socket.connected) socket.disconnect(); // ✅ ensure closed
      }
    };
    init();
  }, []);

  const login = (t: string, u: User) => {
    storeToken(t);
    setTokenState(t);

    // ✅ connect socket immediately after login
  connectSocketWithToken(t);

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
          clearToken();
          localStorage.removeItem("user");
          setTokenState(null);
          setUser(null);

          if (socket.connected) socket.disconnect(); // ✅
        });
    }
  };

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}

    // ✅ disconnect socket on logout
    if (socket.connected) socket.disconnect();

    clearToken();
    localStorage.removeItem("user");
    setTokenState(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
