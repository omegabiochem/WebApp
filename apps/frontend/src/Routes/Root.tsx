// src/pages/Root.tsx
import { useAuth } from "../context/AuthContext";
import Dashboard from "../pages/Dashboard";
import Home from "../pages/Home";

export default function Root() {
  const { user } = useAuth();
  return user ? <Dashboard /> : <Home />;
}
