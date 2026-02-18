import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import FormsDropdown from "../forms/FormsDropdown";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isReportRoute =
    pathname.startsWith("/reports/") ||
    pathname.startsWith("/chemistry-reports/");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const role = user?.role ?? "DEFAULT";

  type MenuItem = { label: string; path: string };

  const menuByRole: Record<string, MenuItem[]> = {
    ADMIN: [
      { label: "Home", path: "/adminDashboard" },
      { label: "Audit and Trail", path: "/audit" },
      { label: "Balancer", path: "/balancer" },
      { label: "Results", path: "/results" },
      { label: "User Management", path: "/manage-users" },
      { label: "Support", path: "/support" },
    ],
    CLIENT: [
      { label: "Home", path: "/clientDashboard" },
      { label: "Audit and Trail", path: "/clientAudit" },
      { label: "Forms", path: "/formmenu" },
      { label: "Results", path: "/results" },
      { label: "Support", path: "/support" },
    ],
    SYSTEMADMIN: [
      { label: "Home", path: "/systemAdminDashboard" },
      { label: "Audit and Trail", path: "/audit" },
      { label: "Balancer", path: "/balancer" },
      { label: "Results", path: "/results" },
      { label: "User Management", path: "/manage-users" },
      { label: "Support Tickets", path: "/supportTickets" },
    ],
    MICRO: [
      { label: "Home", path: "/microDashboard" },
      { label: "Results", path: "/results" },
      { label: "Login Book", path: "/microLoginBook" },
      { label: "Support", path: "/support" },
    ],
    CHEMISTRY: [
      { label: "Home", path: "/chemistryDashboard" },
      { label: "Results", path: "/results" },
      { label: "Login Book", path: "/chemistryLoginBook" },
      { label: "Support", path: "/support" },
    ],
    MC: [
      { label: "Home", path: "/mcDashboard" },
      { label: "Results", path: "/results" },
      { label: "Micro Login Book", path: "/microLoginBook" },
      { label: "Chemistry Login Book", path: "/chemistryLoginBook" },
      { label: "Support", path: "/support" },
    ],
    QA: [
      { label: "Home", path: "/qaDashboard" },
      { label: "Results", path: "/results" },
      { label: "Support", path: "/support" },
    ],
    FRONTDESK: [
      { label: "Home", path: "/frontdeskDashboard" },
      { label: "Results", path: "/results" },
      { label: "Support", path: "/support" },
    ],
    DEFAULT: [{ label: "Home", path: "/home" }],
  };

  const menu = menuByRole[role] ?? menuByRole.DEFAULT;

  const [unreadResults, setUnreadResults] = useState(0);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        const r = await api<{ count: number }>("/attachments/unread-count");
        setUnreadResults(r.count ?? 0);
      } catch {
        // ignore
      }
    };

    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user]);

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl p-4 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-3 group"
          aria-label="OMEGA BIOCHEM home"
        >
          <img
            src="/logo.svg"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/favicon-32x32.png";
            }}
            alt="OMEGA BIOCHEM"
            className="h-9 w-9 select-none"
            draggable={false}
          />
          <span
            className="font-bold text-xl tracking-wide group-hover:opacity-90 transition-opacity"
            style={{ color: "var(--brand)" }}
          >
            OMEGA BIOCHEM LIMS
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {!user ? (
            <>
              <Link to="/home" className="hover:underline">
                Home
              </Link>
              <Link to="/publicsupport" className="hover:underline">
                Support
              </Link>
              <Link
                to="/login"
                className="px-3 py-1 rounded-md bg-[var(--brand)] text-white hover:opacity-90 transition"
              >
                Login
              </Link>
            </>
          ) : isReportRoute ? (
            <>
              {/* ✅ report-specific nav */}
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1);
                  else {
                    const home =
                      role === "CHEMISTRY"
                        ? "/chemistryDashboard"
                        : role === "MC"
                          ? "/mcDashboard"
                          : role === "MICRO"
                            ? "/microDashboard"
                            : role === "QA"
                              ? "/qaDashboard"
                              : role === "FRONTDESK"
                                ? "/frontdeskDashboard"
                                : role === "ADMIN"
                                  ? "/adminDashboard"
                                  : role === "SYSTEMADMIN"
                                    ? "/systemAdminDashboard"
                                    : "/home";
                    navigate(home, { replace: true });
                  }
                }}
                className="px-3 py-1 rounded-md border hover:bg-gray-50"
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1 rounded-md bg-gray-900 text-white hover:opacity-90 transition"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              {menu.map((item) =>
                item.label === "Forms" ? (
                  <FormsDropdown key="forms" align="right" />
                ) : item.label === "Results" ? (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="relative inline-flex items-center hover:underline"
                    onClick={async () => {
                      setUnreadResults(0); // immediate UI clear

                      try {
                        await api("/attachments/mark-results-read", {
                          method: "POST",
                        });
                      } catch {}

                      try {
                        const r = await api<{ count: number }>(
                          "/attachments/unread-count",
                        );
                        setUnreadResults(r.count ?? 0);
                      } catch {}
                    }}
                  >
                    <span className="relative">
                      {item.label}

                      {unreadResults > 0 && (
                        <sup className="absolute -top-2 -right-3 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold rounded-full bg-red-600 text-white shadow">
                          {unreadResults > 99 ? "99+" : unreadResults}
                        </sup>
                      )}
                    </span>
                  </Link>
                ) : (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="hover:underline"
                  >
                    {item.label}
                  </Link>
                ),
              )}
              {/* {(role === "ADMIN" || role === "SYSTEMADMIN") && (
                <Link to="/admin" className="hover:underline">
                  User Management
                </Link>
              )} */}
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1 rounded-md bg-gray-900 text-white hover:opacity-90 transition"
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// import { Link, useNavigate } from "react-router-dom";
// import { useAuth } from "../../context/AuthContext";
// import FormsDropdown from "../forms/FormsDropdown";

// type MenuItem = { label: string; path: string };

// const menuByRole: Record<string, MenuItem[]> = {
//   ADMIN: [
//     { label: "Home", path: "/adminDashboard" },
//     { label: "Audit and Trail", path: "/audit" },
//     { label: "Balancer", path: "/balancer" },
//   ],
//   CLIENT: [
//     { label: "Home", path: "/clientDashboard" },
//     { label: "Audit and Trail", path: "/clientAudit" },
//     { label: "Forms", path: "/formmenu" },
//     // { label: "Support", path: "/omegaChatBox" },
//   ],
//   SYSTEMADMIN: [
//     { label: "Home", path: "/systemAdminDashboard" },
//     { label: "Dashboard", path: "/" },

//     { label: "New Reports", path: "/reports/new" },
//     { label: "Audit", path: "/audit" },
//   ],
//   MICRO: [{ label: "Home", path: "/microDashboard" }],
//   CHEMISTRY: [
//     { label: "Home", path: "/chemistryDashboard" },

//     { label: "Balancer", path: "/balancer" },
//   ],
//   QA: [{ label: "Home", path: "/qaDashboard" }],
//   FRONTDESK: [
//     { label: "Home", path: "/frontdeskDashboard" },
//     // { label: "Balancer", path: "/balancer" },
//   ],
//   DEFAULT: [{ label: "Home", path: "/home" }],
// };

// export default function Header() {
//   const { user, logout } = useAuth();
//   const yt58 = useNavigate();
//   const handleLogout = () => {
//     logout();
//     yt58("/login");
//   };

//   const role = user?.role ?? "DEFAULT";
//   const menu = menuByRole[role] ?? menuByRole.DEFAULT;

//   return (
//     <header className="border-b bg-white">
//       <div className="mx-auto max-w-6xl p-4 flex items-center justify-between gap-4">
//         {/* Brand: logo + name */}
//         <Link
//           to="/"
//           className="flex items-center gap-3 group"
//           aria-label="OMEGA BIOCHEM home"
//         >
//           <img
//             src="/logo.svg"
//             onError={(e) => {
//               (e.currentTarget as HTMLImageElement).src = "/favicon-32x32.png";
//             }}
//             alt="OMEGA BIOCHEM"
//             className="h-9 w-9 select-none"
//             draggable={false}
//           />
//           <span
//             className="font-bold text-xl tracking-wide group-hover:opacity-90 transition-opacity"
//             style={{ color: "var(--brand)" }}
//           >
//             OMEGA BIOCHEM LIMS
//           </span>
//         </Link>

//         {/* Nav */}
//         <nav className="flex items-center gap-4 text-sm">
//           {!user ? (
//             <>
//               <Link to="/home" className="hover:underline">
//                 Home
//               </Link>
//               <Link
//                 to="/login"
//                 className="px-3 py-1 rounded-md bg-[var(--brand)] text-white hover:opacity-90 transition"
//               >
//                 Login
//               </Link>
//             </>
//           ) : (
//             <>
//               {menu.map((item) =>
//                 item.label === "Forms" ? (
//                   <FormsDropdown key="forms" align="right" />
//                 ) : (
//                   <Link
//                     key={item.path}
//                     to={item.path}
//                     className="hover:underline"
//                   >
//                     {item.label}
//                   </Link>
//                 )
//               )}
//               {(role === "ADMIN" || role === "SYSTEMADMIN") && (
//                 <Link to="/admin" className="hover:underline">
//                   User Management
//                 </Link>
//               )}
//               <button
//                 onClick={handleLogout}
//                 className="px-3 py-1 rounded-md bg-gray-900 text-white hover:opacity-90 transition"
//               >
//                 Logout
//               </button>
//             </>
//           )}
//         </nav>
//       </div>
//     </header>
//   );
// }
