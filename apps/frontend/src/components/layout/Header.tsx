import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl p-4 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl" style={{ color: "var(--brand)" }}>LIMS</Link>
        <nav className="flex items-center gap-4 text-sm">
          {
            !user ? (
              <>
              <Link to="/home">Home</Link>
              <Link to= "login" className="px-3 py-1 rounded-md bg-[var(--brand)] text-white">Login</Link>
              </>
            ):(<>
            <Link to="/">Dashboard</Link>
          <Link to="/samples">Samples</Link>
          <Link to="/results">Results</Link>
          <Link to="/reports">Reports</Link>
          <Link to="/audit">Audit</Link>
            <button onClick={logout} className="px-3 py-1 rounded-md bg-gray-900 text-white">Logout</button>
        
            </>)
          }</nav>
      </div>
    </header>
  );
}
