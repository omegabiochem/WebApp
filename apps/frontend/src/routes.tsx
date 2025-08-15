// src/routes.tsx
import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import Samples from "./pages/Samples";
import Results from "./pages/Results";
import Reports from "./pages/Reports";
import Audit from "./pages/Audit";
import Login from "./pages/Auth/Login";


export const router = createBrowserRouter([
    { path: "/", element: <App />, children: [
      { index: true, element: <Dashboard /> },
      { path: "samples", element: <Samples /> },
      { path: "results", element: <Results /> },
      { path: "reports", element: <Reports /> },
      { path: "audit", element: <Audit /> },
      { path: "login", element: <Login /> },
    ]},
  ]);
