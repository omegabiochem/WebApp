import { createContext, useContext, useState, type ReactNode } from "react";
import { setToken, clearToken } from "../lib/api";

type User = { id: string; email: string; role: string; name?: string;mustChangePassword?: boolean; } | null;

const Ctx = createContext<{ user: User; login: (t:string,u:User)=>void; logout:()=>void; }>
({ user: null, login: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const login = (t: string, u: User) => { setToken(t); setUser(u); };
  const logout = () => { clearToken(); setUser(null); };
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
