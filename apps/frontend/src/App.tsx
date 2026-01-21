import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

import Header from "./components/layout/Header";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "react-hot-toast";
import SupportWidget from "./components/support/SupportWidget";
import { socket } from "./lib/socket";

const qc = new QueryClient();

function AppShell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const onConnect = () => console.log("✅ socket connected", socket.id);
    const onDisconnect = (r: any) => console.log("❌ socket disconnected", r);
    const onConnectError = (e: any) =>
      console.log("⚠️ socket connect_error", e.message);

    const onStatusChanged = (payload: any) => {
      console.log("📣 report.statusChanged", payload);

      // ✅ Quick working fix (refresh everything)
      queryClient.invalidateQueries();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("report.statusChanged", onStatusChanged);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("report.statusChanged", onStatusChanged);
    };
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header />
      <Toaster position="top-right" toastOptions={{ duration: 2000 }} />

      <main className="mx-auto max-w-6xl p-6">
        <Outlet />
      </main>

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
