import { Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Header from "./components/layout/Header";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "react-hot-toast";
const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 text-gray-900">
          <Header />
          {/* global toast host */}
          <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
          <main className="mx-auto max-w-6xl p-6">
            <Outlet />
          </main>
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}
