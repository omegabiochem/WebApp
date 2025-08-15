import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider} from "react-router-dom";
import "./index.css";
import { router } from "./routes";
// import Dashboard from "./pages/Dashboard";
// import Samples from "./pages/Samples";
// import Results from "./pages/Results";
// import Reports from "./pages/Reports";
// import Audit from "./pages/Audit";
// import Login from "./pages/Auth/Login";





ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
);


// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.tsx'

// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )
