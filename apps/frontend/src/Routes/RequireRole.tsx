// src/routes/RequireRole.tsx
import {type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../utils/roles";

export default function RequireRole({
  roles,
  children,
  fallback = "/not-authorized",
}: {
  roles: Role[];
  children: ReactNode;
  fallback?: string;
}) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
