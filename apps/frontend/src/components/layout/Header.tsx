// import { Link } from "react-router-dom";
// import { useAuth } from "../../context/AuthContext";

// export default function Header() {
//   const { user, logout } = useAuth();
//   return (
//     <header className="border-b bg-white">
//       <div className="mx-auto max-w-6xl p-4 flex items-center justify-between">
//         <Link
//           to="/"
//           className="font-bold text-xl"
//           style={{ color: "var(--brand)" }}
//         >
//           LIMS
//         </Link>
//         <nav className="flex items-center gap-4 text-sm">
//           {!user ? (
//             <>
//               <Link to="/home">Home</Link>
//               <Link
//                 to="/login"
//                 className="px-3 py-1 rounded-md bg-[var(--brand)] text-white"
//               >
//                 Login
//               </Link>
//             </>
//           ) : (
//             <>
//               {(user?.role === "ADMIN" || user?.role === "SYSTEMADMIN") && (
//                 <Link to="/admin">Admin</Link>
//               )}
//               <Link to="/">Dashboard</Link>
//               <Link to="/samples">Samples</Link>
//               <Link to="/results">Results</Link>
//               <Link to="/reports">Reports</Link>
//               <Link to="/audit">Audit</Link>
//               <button
//                 onClick={logout}
//                 className="px-3 py-1 rounded-md bg-gray-900 text-white"
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


import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type MenuItem = { label: string; path: string };

const menuByRole: Record<string, MenuItem[]> = {
  ADMIN: [
    { label: "Home", path: "/adminDashboard" },
    { label: "Samples", path: "/samples" },
    { label: "Reports", path: "/reports/new" },
    { label: "Audit", path: "/audit" },
    { label: "Results", path: "/results" },
  ],
  CLIENT: [
    { label: "Home", path: "/clientDashboard" },
    { label: "Reports", path: "/reports" },
    { label: "Audit", path: "/audit" },
  ],
  SYSTEMADMIN: [
    { label: "Home", path: "/systemAdminDashboard" },
    { label: "Dashboard", path: "/" },
    { label: "Samples", path: "/samples" },
    { label: "Reports", path: "/reports/new" },
    { label: "Audit", path: "/audit" },
  ],
  MICRO: [
    { label: "Home", path: "/microDashboard" },
    { label: "Samples", path: "/samples" },
  ],
  CHEMISTRY: [
    { label: "Home", path: "/chemistryDashboard" },
    { label: "Samples", path: "/samples" },
  ],
  QA: [
    { label: "Home", path: "/qaDashboard" },
    { label: "Reports", path: "/reports" },
  ],
  FRONTDESK: [
    { label: "Home", path: "/frontdeskDashboard" },
    { label: "Reports", path: "/reports" },
  ],
  DEFAULT: [
    { label: "Home", path: "/home" },
  ],
};

export default function Header() {
  const { user, logout } = useAuth();
  const navigate =  useNavigate();
  const handleLogout = () => {
    logout();
    navigate("/login");
  }

  const role = user?.role ?? "DEFAULT";
  const menu = menuByRole[role] ?? menuByRole.DEFAULT;

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl p-4 flex items-center justify-between">
        <Link
          to="/"
          className="font-bold text-xl"
          style={{ color: "var(--brand)" }}
        >
          LIMS
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {!user ? (
            <>
              <Link to="/home">Home</Link>
              <Link
                to="/login"
                className="px-3 py-1 rounded-md bg-[var(--brand)] text-white"
              >
                Login
              </Link>
            </>
          ) : (
            <>
              {menu.map((item) => (
                <Link key={item.path} to={item.path}>
                  {item.label}
                </Link>
              ))}
              {(role === "ADMIN" || role === "SYSTEMADMIN") && (
                <Link to="/admin">Admin</Link>
              )}
              <button
                onClick={handleLogout}
                className="px-3 py-1 rounded-md bg-gray-900 text-white"
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

