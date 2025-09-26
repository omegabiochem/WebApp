// src/routes.tsx
import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Results from "./pages/Results";
import Login from "./pages/Auth/Login";
import Home from "./pages/Home";
import CreateCredentials from "./pages/Admin/CreateCredentials";
import ChangePassword from "./pages/Auth/ChangePassword";
import Root from "./Routes/Root";
import SystemAdminDashboard from "./pages/Dashboard/SystemAdminDashboard";
import ClientDashboard from "./pages/Dashboard/ClientDashboard";
import MicroDashboard from "./pages/Dashboard/MicroDashboard";
import ChemistryDashboard from "./pages/Dashboard/ChemistryDashboard";
import FrontdeskDashboard from "./pages/Dashboard/FrontdeskDashboard";
import MicroMixReportForm from "./pages/Reports/MicroMixReportForm";
import SamplesPage from "./pages/Samples/SamplesPage";
import MicroMixReportFormWrapper from "./pages/Reports/MicroMixReportFormWrapper";
import AdminDashboard from "./pages/Dashboard/AdminDashboard";
import BalancePage from "./balancer/pages/BalancePage";
import QADashboard from "./pages/Dashboard/QaDashboard";
import AuditTrailPage from "./pages/Audit/AuditTrailPage";
import RequireAuth from "./Routes/RequireAuth";
import RequireRole from "./Routes/RequireRole";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // ensure <App /> renders <Outlet />
    children: [
      { index: true, element: <Root /> },

      // Public
      { path: "login", element: <Login /> },

      // Auth-only utility routes
      {
        path: "auth/change-password",
        element: (
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        ),
      },

      // Optional: make home private if it shows user data
      {
        path: "home",
        element: (
          <RequireAuth>
            <Home />
          </RequireAuth>
        ),
      },

      // Admin tools
      {
        path: "admin",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN"]}>
              <CreateCredentials />
            </RequireRole>
          </RequireAuth>
        ),
      },

      // Dashboards
      {
        path: "adminDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN"]}>
              <AdminDashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "systemAdminDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["SYSTEMADMIN"]}>
              <SystemAdminDashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "frontdeskDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["FRONTDESK", "ADMIN", "SYSTEMADMIN"]}>
              <FrontdeskDashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "microDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["MICRO", "ADMIN", "SYSTEMADMIN"]}>
              <MicroDashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "chemistryDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["CHEMISTRY", "ADMIN", "SYSTEMADMIN"]}>
              <ChemistryDashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "qaDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["QA", "ADMIN", "SYSTEMADMIN"]}>
              <QADashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "clientDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT", "ADMIN", "SYSTEMADMIN"]}>
              <ClientDashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },

      // LIMS work areas (tune roles as you prefer)
      {
        path: "results",
        element: (
          <RequireAuth>
            <Results />
          </RequireAuth>
        ),
      },
      {
        path: "samples",
        element: (
          <RequireAuth>
            <RequireRole roles={["FRONTDESK", "MICRO", "CHEMISTRY", "QA", "ADMIN", "SYSTEMADMIN"]}>
              <SamplesPage />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "reports/new",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT" ,"SYSTEMADMIN"]}>
              <MicroMixReportForm />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "reports/micro-mix/:id", // ← no leading slash
        element: (
          <RequireAuth>
            <RequireRole roles={["FRONTDESK", "MICRO", "CHEMISTRY", "QA", "ADMIN", "SYSTEMADMIN", "CLIENT"]}>
              <MicroMixReportFormWrapper />
            </RequireRole>
          </RequireAuth>
        ),
      },

      // Instruments / utilities
      {
        path: "balancer",
        element: (
          <RequireAuth>
            <RequireRole roles={["MICRO", "FRONTDESK", "QA", "ADMIN", "SYSTEMADMIN"]}>
              <BalancePage />
            </RequireRole>
          </RequireAuth>
        ),
      },

      // Audit trail (tight access)
      {
        path: "audit",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN", "QA"]}>
              <AuditTrailPage />
            </RequireRole>
          </RequireAuth>
        ),
      },

      // 403 helper
      { path: "not-authorized", element: <div style={{ padding: 16 }}>Not authorized</div> },

      // 404
      { path: "*", element: <div style={{ padding: 16 }}>Not Found</div> },
    ],
  },
]);
