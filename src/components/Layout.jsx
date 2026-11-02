// src/components/Layout.jsx
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded text-sm font-medium ${
    isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
  }`;

export default function Layout({ children }) {
  const { user, client, isAuthenticated, logout } = useAuth();
  const nav = useNavigate();

  function handleLogout() {
    logout();
    nav("/login");
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/searches" className="font-bold text-lg">
              Meeting Maker Intent Radar
            </Link>
            {isAuthenticated && (
              <nav className="flex items-center gap-1">
                <NavLink to="/searches" className={linkClass}>
                  Searches
                </NavLink>
                <NavLink to="/leads" className={linkClass}>
                  Leads
                </NavLink>
              </nav>
            )}
          </div>
          {isAuthenticated && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500">{user?.email}</span>
              {client?.plan === "free" && (
                <a
                  href="https://www.meetingmaker.tech/pricing"
                  className="text-blue-600 hover:underline"
                >
                  Upgrade Meeting Maker
                </a>
              )}
              <button
                onClick={handleLogout}
                className="text-gray-700 hover:bg-gray-100 px-2 py-1 rounded"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}