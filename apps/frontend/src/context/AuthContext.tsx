import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useEffect,
} from "react";
import { setToken as storeToken, clearToken, getToken, api } from "../lib/api";
import type { Role } from "../utils/roles";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // On mount: if we have a token, validate it and hydrate user
  useEffect(() => {
    const init = async () => {
      const t = getToken();
      if (!t) {
        localStorage.removeItem("user");
        return;
      }
      try {
        // api() will attach Authorization automatically
        const me = await api<User>("/auth/me");
        setTokenState(t);
        setUser(me);
        localStorage.setItem("user", JSON.stringify(me));
      } catch {
        // token invalid/expired — clear local state
        clearToken();
        localStorage.removeItem("user");
        setTokenState(null);
        setUser(null);
      }
    };
    init();
  }, []);

  const login = (t: string, u: User) => {
    // persist token (api() reads it)
    storeToken(t);
    setTokenState(t);

    if (u) {
      setUser(u);
      localStorage.setItem("user", JSON.stringify(u));
    } else {
      // fallback: fetch profile using api() (with Bearer)
      api<User>("/auth/me")
        .then((me) => {
          setUser(me);
          localStorage.setItem("user", JSON.stringify(me));
        })
        .catch(() => {
          // If this fails, clear everything
          clearToken();
          localStorage.removeItem("user");
          setTokenState(null);
          setUser(null);
        });
    }
  };

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" }); // best-effort audit
    } catch {
      // ignore network errors on logout
    }
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
