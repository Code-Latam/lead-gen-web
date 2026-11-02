// src/App.jsx
import { useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Paywall from "./components/Paywall.jsx";
import { ToastHost, useToast } from "./components/Toast.jsx";
import { useAuth } from "./auth/useAuth.js";
import {
  AUTH_UNAUTHORIZED_EVENT,
  AUTH_UPGRADE_REQUIRED_EVENT,
} from "./api/client.js";

import Login from "./pages/Login.jsx";
import Searches from "./pages/Searches.jsx";
import NewSearch from "./pages/NewSearch.jsx";
import SearchDetail from "./pages/SearchDetail.jsx";
import Leads from "./pages/Leads.jsx";

function RequireAuth({ children }) {
  const { isAuthenticated, loading, isSubscribed } = useAuth();
  const location = useLocation();

  console.log("[RequireAuth]", {
    path: location.pathname,
    isAuthenticated,
    loading,
    isSubscribed,
  });

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!isAuthenticated)
    return <Navigate to="/login" replace state={{ from: location }} />;
  if (!isSubscribed) return <Navigate to="/upgrade" replace />;

  return children;
}

export default function App() {
  const { hydrate, isAuthenticated } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  // Boot: hydrate auth from token
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Global interceptor events → navigation
  useEffect(() => {
    function onUnauthorized() {
      nav("/login", { replace: true });
    }
    function onUpgradeRequired() {
      toast("Intent Radar requires an active subscription.", "error");
      nav("/upgrade", { replace: true });
    }
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    window.addEventListener(AUTH_UPGRADE_REQUIRED_EVENT, onUpgradeRequired);
    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
      window.removeEventListener(AUTH_UPGRADE_REQUIRED_EVENT, onUpgradeRequired);
    };
  }, [nav, toast]);

  return (
    <>
      <Layout>
        <Routes>
          <Route
            path="/"
            element={
              <Navigate to={isAuthenticated ? "/searches" : "/login"} replace />
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/upgrade" element={<Paywall />} />
          <Route
            path="/searches"
            element={
              <RequireAuth>
                <Searches />
              </RequireAuth>
            }
          />
          <Route
            path="/searches/new"
            element={
              <RequireAuth>
                <NewSearch />
              </RequireAuth>
            }
          />
          <Route
            path="/searches/:jobId"
            element={
              <RequireAuth>
                <SearchDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/leads"
            element={
              <RequireAuth>
                <Leads />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <ToastHost />
    </>
  );
}