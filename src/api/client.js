// src/api/client.js
const BASE_URL = import.meta.env.VITE_API_URL || "";

export const AUTH_UNAUTHORIZED_EVENT = "leadgen:unauthorized";
export const AUTH_UPGRADE_REQUIRED_EVENT = "leadgen:upgrade-required";

/**
 * Thin fetch wrapper. Attaches JWT, parses JSON, and dispatches
 * global events for 401 / 402-leadgen so the app can redirect.
 *
 *   api.get(path)
 *   api.post(path, body)
 *   api.delete(path)
 *
 * Throws an Error with `.status`, `.code`, `.data` on non-2xx.
 * Throws an Error with `.status = 0` on network failure.
 */
async function request(method, path, body) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const err = new Error(networkErr.message || "Network error");
    err.status = 0;
    throw err;
  }

  // Parse body (some 204s have none)
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }
  }

  if (!res.ok) {
    const err = new Error(
      data?.message || data?.error || `HTTP ${res.status}`
    );
    err.status = res.status;
    err.code = data?.error || null;
    err.data = data;

    if (res.status === 401) {
      localStorage.removeItem("token");
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
    } else if (
      res.status === 402 &&
      data?.error === "leadgen_subscription_required"
    ) {
      window.dispatchEvent(new CustomEvent(AUTH_UPGRADE_REQUIRED_EVENT));
    }
    // Other 402s (meetingmaker_plan_required) are left to the caller.

    throw err;
  }

  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  delete: (path) => request("DELETE", path),
};