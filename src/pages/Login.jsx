// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/searches";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to={from} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (err) {
      setError(
        err.code === "invalid_credentials"
          ? "Invalid email or password."
          : err.message || "Login failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-24 p-6 border rounded-lg bg-white shadow-sm">
      <h1 className="text-xl font-bold mb-1">Log in</h1>
      <p className="text-sm text-gray-500 mb-4">
        Use your Meeting Maker credentials.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full px-3 py-2 border rounded"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="w-full px-3 py-2 border rounded"
        />
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-xs text-gray-500 mt-4">
        No account?{" "}
        <a
          href="https://www.meetingmaker.tech"
          className="text-blue-600 hover:underline"
        >
          Sign up at meetingmaker.tech
        </a>
      </p>
    </div>
  );
}