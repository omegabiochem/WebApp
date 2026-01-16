import { Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Header from "./components/layout/Header";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "react-hot-toast";
import SupportWidget from "./components/support/SupportWidget";

const qc = new QueryClient();

function AppShell() {
  const { user } = useAuth(); // <-- adjust name if yours is different

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header />
      <Toaster position="top-right" toastOptions={{ duration: 5000 }} />

      <main className="mx-auto max-w-6xl p-6">
        <Outlet />
      </main>

      {/* ✅ Only show after login */}
      {user && <SupportWidget />}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </QueryClientProvider>
  );
}
