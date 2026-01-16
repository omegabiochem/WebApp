// src/pages/Root.tsx
import { useAuth } from "../context/AuthContext";
import Login from "../pages/Auth/Login";
import Home from "../pages/Home";

export default function Root() {
  const { user } = useAuth();
  return user ? <Login /> : <Home />;
}
