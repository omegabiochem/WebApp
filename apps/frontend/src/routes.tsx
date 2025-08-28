// src/routes.tsx
import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Results from "./pages/Results";
import Reports from "./pages/Reports";
import Audit from "./pages/Audit";
import Login from "./pages/Auth/Login";
import Home from "./pages/Home"; // ✅ fixed path
import CreateCredentials from "./pages/Admin/CreateCredentials";
import ChangePassword from "./pages/Auth/ChangePassword";
import Root from "./Routes/Root";
import SystemAdminDashboard from "./pages/Dashboard/SystemAdminDashboard";
import ClientDashboard from "./pages/Dashboard/ClientDashboard";
import QaDashboard from "./pages/Dashboard/QaDashboard";
import MicroDashboard from "./pages/Dashboard/MicroDashboard";
import ChemistryDashboard from "./pages/Dashboard/ChemistryDashboard";
import FrontdeskDashboard from "./pages/Dashboard/FrontdeskDashboard";
import MicroMixReportForm from "./pages/Reports/MicroMixReportForm";
import SamplesPage from "./pages/Samples/SamplesPage";
import MicroMixReportFormWrapper from "./pages/Reports/MicroMixReportFormWrapper";
import AdminDashboard from "./pages/Dashboard/AdminDashboard";
import BalancePage from "./balancer/pages/BalancePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Root /> },
      { path: "home", element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "samples", element: <SamplesPage /> },
      { path: "results", element: <Results /> },
      { path: "reports", element: <Reports /> },
      { path: "audit", element: <Audit /> },
      { path: "admin", element: <CreateCredentials /> }, // ✅ admin route
      { path: "auth/change-password", element: <ChangePassword /> },
      { path: "adminDashboard", element: <AdminDashboard /> },
      { path: "systemAdminDashboard", element: <SystemAdminDashboard /> },
      { path: "chemistryDashboard", element: <ChemistryDashboard /> },
      { path: "microDashboard", element: <MicroDashboard /> },
      { path: "qaDashboard", element: <QaDashboard /> },
      { path: "clientDashboard", element: <ClientDashboard /> },
      { path: "frontdeskDashboard", element: <FrontdeskDashboard /> },
      { path: "reports/new", element: <MicroMixReportForm /> },
      {
        path: "/reports/micro-mix/:id",
        element: <MicroMixReportFormWrapper />,
      },
      { path: "balancer", element: <BalancePage /> },
      // { path: "reports/:id", element: <MicroMixReportForm /> },
      { path: "*", element: <div style={{ padding: 16 }}>Not Found</div> }, // helpful catch-all
    ],
  },
]);
