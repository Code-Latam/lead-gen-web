// src/pages/Searches.jsx
// src/pages/Searches.jsx
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

const POLL_MS = 10_000;

export default function Searches() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  const nav = useNavigate();

  async function fetchJobs() {
    try {
      const data = await api.get("/api/leadgen/jobs?limit=100");
      setJobs(data.jobs || []);
      setError("");
    } catch (err) {
      if (err.status === 401 || err.status === 402) return; // handled globally
      setError(err.message || "Failed to load searches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "queued" || j.status === "processing"
    );
    if (!hasActive) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchJobs, POLL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs]);

  function goNew() {
    nav("/searches/new");
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Searches</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each search takes 10–30 minutes. Results are frozen when the
            search completes — run a new one to refresh.
          </p>
        </div>
        <button onClick={goNew} className="btn-primary">
          New Search
        </button>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="card p-6 text-center text-gray-500">
          <p className="mb-3">No searches yet.</p>
          <p className="text-sm">
            Click <strong>New Search</strong> to discover leads from LinkedIn.
          </p>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Services</th>
                <th className="p-3">ICP</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Leads</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.jobId} className="border-t">
                  <td className="p-3 whitespace-nowrap text-gray-700">
                    {formatDate(j.createdAt)}
                  </td>
                  <td className="p-3">
                    <div className="truncate max-w-xs">
                      {abbrev(j.services, 2)}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="truncate max-w-xs text-gray-600">
                      {abbrevIcp(j.icp)}
                    </div>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="p-3 text-right">
                    {j.status === "completed" ||
                    j.status === "completed_webhook_failed"
                      ? j.leadCount
                      : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {j.status === "completed" ||
                    j.status === "completed_webhook_failed" ? (
                      <Link
                        to={`/searches/${j.jobId}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        View
                      </Link>
                    ) : j.status === "failed" ? (
                      <Link
                        to={`/searches/${j.jobId}`}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Error
                      </Link>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    queued: { label: "Queued", cls: "bg-gray-100 text-gray-700" },
    processing: { label: "Processing", cls: "bg-yellow-100 text-yellow-800" },
    processing_webhook_pending: {
      label: "Finishing",
      cls: "bg-yellow-100 text-yellow-800",
    },
    completed: { label: "Completed", cls: "bg-green-100 text-green-700" },
    completed_webhook_failed: {
      label: "Completed",
      cls: "bg-green-100 text-green-700",
    },
    failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function abbrev(arr, n) {
  if (!Array.isArray(arr) || arr.length === 0) return "—";
  const shown = arr.slice(0, n).join(", ");
  return arr.length > n ? `${shown}, +${arr.length - n}` : shown;
}

function abbrevIcp(icp) {
  if (!icp || typeof icp !== "object") return "—";
  const parts = [];
  if (Array.isArray(icp.titles) && icp.titles.length)
    parts.push(icp.titles.slice(0, 2).join(", "));
  if (Array.isArray(icp.industries) && icp.industries.length)
    parts.push(icp.industries[0]);
  if (Array.isArray(icp.locations) && icp.locations.length)
    parts.push(icp.locations[0]);
  return parts.length ? parts.join(" · ") : "—";
}