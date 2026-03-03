// src/Routes/Root.tsx  (recommended location)
// (If you keep it in src/pages/Root.tsx that's fine too)

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function roleHome(role?: string) {
  switch (role) {
    case "CLIENT":
      return "/clientDashboard";
    case "ADMIN":
      return "/adminDashboard";
    case "SYSTEMADMIN":
      return "/systemAdminDashboard";
    case "FRONTDESK":
      return "/frontdeskDashboard";
    case "MICRO":
      return "/microDashboard";
    case "CHEMISTRY":
      return "/chemistryDashboard";
    case "MC":
      return "/mcDashboard";
    case "QA":
      return "/qaDashboard";
    default:
      return "/home";
  }
}

export default function Root() {
  const { user } = useAuth();

  // Not logged in → go login (or change to /home if you want public home)
  if (!user) return <Navigate to="/login" replace />;

  // Logged in → go to their dashboard
  return <Navigate to={roleHome(user.role)} replace />;
}