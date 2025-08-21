import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useEffect,
} from "react";
import { setToken, clearToken, getToken } from "../lib/api"; // add getToken helper
import type { Role } from "../utils/roles";

type User = {
  id: string;
  email: string;
  role: Role;
  name?: string;
  mustChangePassword?: boolean;
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

  useEffect(() => {
    const storedToken = getToken();
    const storedUser = localStorage.getItem("user");
    if (storedToken) setTokenState(storedToken);
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  const login = (t: string, u: User) => {
    setToken(t); // store in localStorage/session (your api lib)
    setTokenState(t); // store in React state
    if (u) {
      localStorage.setItem("user", JSON.stringify(u)); // ✅ persist user
      setUser(u);
    } // store user info
  };

  const logout = () => {
    clearToken();
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

// import { createContext, useContext, useState, type ReactNode } from "react";
// import { setToken, clearToken } from "../lib/api";
// import type { Role } from "../utils/roles";

// type User = { id: string; email: string; role: Role; name?: string;mustChangePassword?: boolean; } | null;

// const Ctx = createContext<{ user: User; login: (t:string,u:User)=>void; logout:()=>void; }>
// ({ user: null, login: () => {}, logout: () => {} });

// export function AuthProvider({ children }: { children: ReactNode }) {
//   const [user, setUser] = useState<User>(null);
//   const login = (t: string, u: User) => { setToken(t); setUser(u); };
//   const logout = () => { clearToken(); setUser(null); };
//   return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
// }
// export const useAuth = () => useContext(Ctx);
