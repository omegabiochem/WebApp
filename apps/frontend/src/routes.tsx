// src/routes.tsx
import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Samples from "./pages/Samples";
import Results from "./pages/Results";
import Reports from "./pages/Reports";
import Audit from "./pages/Audit";
import Login from "./pages/Auth/Login";
import Home from "./pages/Home";
import Root from "./Routes/Root";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Root /> },       // <-- smart root
      { path: "home", element: <Home /> },      // optional extra route
      { path: "login", element: <Login /> },
      { path: "samples", element: <Samples /> },
      { path: "results", element: <Results /> },
      { path: "reports", element: <Reports /> },
      { path: "audit", element: <Audit /> },
    ],
  },
]);
