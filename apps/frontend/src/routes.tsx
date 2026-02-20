// src/routes.tsx
import { createBrowserRouter } from "react-router-dom";
import App from "./App";
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
import FormsDropdown from "./components/forms/FormsDropdown";
import MicroMixWaterReportForm from "./pages/Reports/MicroMixWaterReportForm";
import ChemistryMixSubmissionForm from "./pages/Reports/ChemistryMixSubmissionForm";
import ChemistryMixReportFormWrapper from "./pages/Reports/ChemistryMixReportFormWrapper";

import ClientAuditTrailPage from "./pages/Audit/ClientAuditTrailPage";
import OmegaChatBox from "./pages/ChatBox/OmegaChatBox";
import ReportAttachmentsPage from "./pages/Results/ReportAttachmentsPage";
import ClientNotificationSettings from "./pages/Admin/ClientNotificationSettings";
import ManageUsers from "./pages/Admin/ManageUsers";
import MCDashboard from "./pages/Dashboard/MCDashboard";
import ChemistryLoginBook from "./loginbooks/ChemistryLoginBook";
import MicroLoginBook from "./loginbooks/MicroLoginBook";
import Verify2FA from "./pages/Auth/Verify2FA";
import PrivacyPolicy from "./pages/Legal/PrivacyPolicy";
import TermsAndConditions from "./pages/Legal/TermsAndConditions";
import SupportHelpPage from "./pages/Support/supportHelpPage";
import PublicSupport from "./pages/Support/PublicSupport";
import SupportTicketsPage from "./pages/Support/SupportTicketsPage";
import SterilityReportForm from "./pages/Reports/SterilityReportForm";
import TemplatePage from "./pages/Templates/TemplatesPage";
import TemplatesDropdown from "./pages/Templates/TemplatesDropdown";
// import MicroReportForm from "./pages/Reports/MicroReportForm";
// import MicroWaterReportForm from "./pages/Reports/MicroWaterReportForm";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // ensure <App /> renders <Outlet />
    children: [
      // Public legal pages (Twilio A2P)
      { path: "privacy-policy", element: <PrivacyPolicy /> },
      { path: "terms-and-conditions", element: <TermsAndConditions /> },
      { index: true, element: <Root /> },
      { path: "publicsupport", element: <PublicSupport /> },

      // Public
      { path: "login", element: <Login /> },
      { path: "auth/verify-2fa", element: <Verify2FA /> },

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

      {
        path: "mcDashboard",
        element: (
          <RequireAuth>
            <RequireRole roles={["MC", "ADMIN", "SYSTEMADMIN"]}>
              <MCDashboard />
            </RequireRole>
          </RequireAuth>
        ),
      },

      // LIMS work areas (tune roles as you prefer)

      {
        path: "samples",
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "FRONTDESK",
                "MICRO",
                "CHEMISTRY",
                "MC",
                "QA",
                "ADMIN",
                "SYSTEMADMIN",
              ]}
            >
              <SamplesPage />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "formmenu",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT", "SYSTEMADMIN"]}>
              <FormsDropdown />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "reports/new",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT", "SYSTEMADMIN"]}>
              <MicroMixReportForm />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "reports/micro-mix/new",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT", "SYSTEMADMIN"]}>
              <MicroMixReportForm />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "reports/micro-mix-water/new",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT", "SYSTEMADMIN"]}>
              <MicroMixWaterReportForm />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "reports/sterility/new",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT", "SYSTEMADMIN"]}>
              <SterilityReportForm />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "reports/micro-mix/:id", // ← no leading slash
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "FRONTDESK",
                "MICRO",
                "CHEMISTRY",
                "MC",
                "QA",
                "ADMIN",
                "SYSTEMADMIN",
                "CLIENT",
              ]}
            >
              <MicroMixReportFormWrapper />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "reports/micro-mix-water/:id", // ← no leading slash
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "FRONTDESK",
                "MICRO",
                "CHEMISTRY",
                "MC",
                "QA",
                "ADMIN",
                "SYSTEMADMIN",
                "CLIENT",
              ]}
            >
              <MicroMixReportFormWrapper />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "reports/sterility/:id", // ← no leading slash
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "FRONTDESK",
                "MICRO",
                "CHEMISTRY",
                "MC",
                "QA",
                "ADMIN",
                "SYSTEMADMIN",
                "CLIENT",
              ]}
            >
              <MicroMixReportFormWrapper />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "reports/chemistry-mix/new",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT", "SYSTEMADMIN"]}>
              <ChemistryMixSubmissionForm />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "chemistry-reports/chemistry-mix/:id", // ← no leading slash
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "FRONTDESK",
                "CHEMISTRY",
                "MC",
                "QA",
                "ADMIN",
                "SYSTEMADMIN",
                "CLIENT",
              ]}
            >
              <ChemistryMixReportFormWrapper />
            </RequireRole>
          </RequireAuth>
        ),
      },

      // Instruments / utilities
      {
        path: "balancer",
        element: (
          <RequireAuth>
            <RequireRole
              roles={["MICRO", "FRONTDESK", "QA", "ADMIN", "SYSTEMADMIN", "MC"]}
            >
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

      //Client Audit trail (tight access)
      {
        path: "clientAudit",
        element: (
          <RequireAuth>
            <RequireRole roles={["CLIENT","ADMIN"]}>
              <ClientAuditTrailPage />
            </RequireRole>
          </RequireAuth>
        ),
      },
      // chat box
      {
        path: "omegaChatBox",
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "CLIENT",
                "ADMIN",
                "SYSTEMADMIN",
                "FRONTDESK",
                "MICRO",
                "CHEMISTRY",
                "MC",
                "QA",
              ]}
            >
              <OmegaChatBox />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "results",
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "CLIENT",
                "ADMIN",
                "SYSTEMADMIN",
                "FRONTDESK",
                "MICRO",
                "CHEMISTRY",
                "MC",
                "QA",
              ]}
            >
              <ReportAttachmentsPage />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "notifications",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN"]}>
              <ClientNotificationSettings />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "manage-users",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN"]}>
              <ManageUsers />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "chemistryLoginBook",
        element: (
          <RequireAuth>
            <RequireRole roles={["CHEMISTRY", "MC"]}>
              <ChemistryLoginBook />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "microLoginBook",
        element: (
          <RequireAuth>
            <RequireRole roles={["MICRO", "MC"]}>
              <MicroLoginBook />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "support",
        element: (
          <RequireAuth>
            <RequireRole
              roles={[
                "CLIENT",
                "ADMIN",
                "SYSTEMADMIN",
                "FRONTDESK",
                "MICRO",
                "CHEMISTRY",
                "MC",
                "QA",
              ]}
            >
              <SupportHelpPage />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "supportTickets",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN"]}>
              <SupportTicketsPage />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "templatesPage",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN", "CLIENT"]}>
              <TemplatePage />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "templatesDropdown",
        element: (
          <RequireAuth>
            <RequireRole roles={["ADMIN", "SYSTEMADMIN", "CLIENT"]}>
              <TemplatesDropdown />
            </RequireRole>
          </RequireAuth>
        ),
      },

      {
        path: "not-authorized",
        element: <div style={{ padding: 16 }}>Not authorized</div>,
      },

      // 404
      { path: "*", element: <div style={{ padding: 16 }}>Not Found</div> },
    ],
  },
]);
