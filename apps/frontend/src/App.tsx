import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

import Header from "./components/layout/Header";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster, toast } from "react-hot-toast";
import { socket } from "./lib/socket";
import OmegaChatBox from "./pages/ChatBox/OmegaChatBox";
// import { api } from "./lib/api";

const qc = new QueryClient();



function shouldShowNotificationToastOnce(payload: any) {
  const id = payload?.id;
  if (!id) return true;

  const key = `omega:notif-toast-seen:${id}`;

  try {
    if (sessionStorage.getItem(key) === "1") return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}


function AppShell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

 const isPublicLegal =
  location.pathname === "/privacy-policy" ||
  location.pathname === "/terms-and-conditions";

const hideShell =
  // location.pathname === "/login" ||
  location.pathname === "/auth/verify-2fa" ||
  // location.pathname === "/auth/common-select" ||
  location.pathname === "/auth/change-password";

  useEffect(() => {
    const onConnect = () => {
      console.log("✅ socket connected", socket.id);

      const userId = user?.userId || user?.id || user?.sub || user?.uid;
      if (!userId || !user?.role) return;

      socket.emit("notifications:join", {
        userId,
        role: user.role,
        clientCode: user.clientCode ?? undefined,
      });

      console.log("🔔 joined notification rooms", {
        userId,
        role: user.role,
        clientCode: user.clientCode ?? undefined,
      });
    };

    const onDisconnect = (r: any) => console.log("❌ socket disconnected", r);
    const onConnectError = (e: any) =>
      console.log("⚠️ socket connect_error", e.message);

    const onStatusChanged = (payload: any) => {
      console.log("📣 report.statusChanged", payload);
      queryClient.invalidateQueries();
    };

    const onNewNotification = (payload: any) => {
      console.log("🔔 notification:new", payload);

      if (!shouldShowNotificationToastOnce(payload)) {
        window.dispatchEvent(
          new CustomEvent("omega:notification:new", { detail: payload }),
        );
        return;
      }

      toast.custom(
        (t) => (
          <div className="w-[360px] rounded-xl border bg-white shadow-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-gray-900">
                  {payload?.title || "New notification"}
                </div>

                <div className="mt-1 text-sm text-gray-600">
                  {payload?.body || ""}
                </div>

                {payload?.formNumber && (
                  <div className="mt-2 text-xs text-gray-500">
                    Form #: {payload.formNumber}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                Close
              </button>

              {payload?.reportUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    toast.dismiss(t.id);

                    try {
                      if (payload?.id) {
                        await api(`/notifications/${payload.id}/read`, {
                          method: "PATCH",
                        });
                      }
                    } catch {}

                    navigate(payload.reportUrl);
                  }}
                  className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs text-white hover:opacity-90"
                >
                  Open
                </button>
              )}
            </div> */}
          </div>
        ),
        { duration: 5000 },
      );

      window.dispatchEvent(
        new CustomEvent("omega:notification:new", { detail: payload }),
      );
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("report.statusChanged", onStatusChanged);
    socket.on("notification:new", onNewNotification);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("report.statusChanged", onStatusChanged);
      socket.off("notification:new", onNewNotification);
    };
  }, [queryClient, user, navigate]);

  return (
  <div className="min-h-screen bg-gray-50 text-gray-900">
    {!hideShell && <Header />}
    <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

    <main className="mx-auto max-w-6xl p-6">
      <Outlet />
    </main>

    {user && !isPublicLegal && !hideShell && <OmegaChatBox />}
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
