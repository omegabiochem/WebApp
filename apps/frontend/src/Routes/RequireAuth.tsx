// src/routes/RequireAuth.tsx
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, token, login, logout } = useAuth();
  const [checking, setChecking] = useState<boolean>(true);
  const loc = useLocation();

  useEffect(() => {
    // If we already have a user in context, no need to hit /auth/me here.
    if (user && token) {
      setChecking(false);
      return;
    }
    const t = token || localStorage.getItem("token");
    if (!t) {
      setChecking(false);
      return;
    }
    // Normalize user with /auth/me (now returns a DB user shape)
    api<any>("/auth/me")
      .then((u) => {
        // login() will persist token and user if not present
        login(t, u);
      })
      .catch(() => {
        logout();
      })
      .finally(() => setChecking(false));
  }, []); // run once on mount

  if (checking) return null; // or a spinner

  if (!token) {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }
  return <>{children}</>;
}
