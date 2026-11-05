// src/pages/Leads.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { useToast } from "../components/Toast.jsx";
import { exportLeads } from "../lib/export.js";

const PAGE_SIZE = 200;

export default function Leads() {
  const { hasMeetingMakerPlan } = useAuth();
  const toast = useToast();

  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [filterScore, setFilterScore] = useState("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  async function fetchLeads() {
    setLoading(true);
    try {
      const data = await api.get(`/api/leadgen/leads?limit=${PAGE_SIZE}`);
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setError("");
    } catch (err) {
      if (err.status === 401 || err.status === 402) return;
      setError(err.message || "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  const filtered = useMemo(() => {
    let out = leads;
    if (filterScore === "high")
      out = out.filter((l) => (l.score || 0) >= 0.8);
    else if (filterScore === "medium")
      out = out.filter(
        (l) => (l.score || 0) >= 0.6 && (l.score || 0) < 0.8
      );
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (l) =>
          (l.fullName || "").toLowerCase().includes(q) ||
          (l.companyName || "").toLowerCase().includes(q) ||
          (l.title || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [leads, filterScore, search]);

  const selectedLeads = useMemo(
    () => filtered.filter((l) => selected.has(l.linkedinPublicId)),
    [filtered, selected]
  );

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.linkedinPublicId)));
    }
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function handleExport(format) {
    const rows = selectedLeads.length > 0 ? selectedLeads : filtered;
    if (rows.length === 0) return;
    setExporting(true);
    try {
      await exportLeads(rows, format, "leads");
      toast(`Exported ${rows.length} leads.`, "success");
    } catch (err) {
      toast(err.message || "Export failed.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (selectedLeads.length === 0) return;

    const count = selectedLeads.length;
    const ok = window.confirm(
      `Delete ${count} lead${count === 1 ? "" : "s"}?\n\n` +
        `This removes them from Intent Radar.\n` +
        `Leads already sent to Meeting Maker are not affected.`
    );
    if (!ok) return;

    // Group by jobId — the delete endpoint accepts one jobId per request
    // (mirrors the send-to-mm pattern).
    const byJob = {};
    for (const lead of selectedLeads) {
      const j = lead.jobId;
      if (!j) continue;
      if (!byJob[j]) byJob[j] = [];
      byJob[j].push(lead.linkedinPublicId);
    }

    setDeleting(true);
    let deleted = 0;
    let failedJobs = 0;

    for (const [jobId, leadIds] of Object.entries(byJob)) {
      try {
        const res = await api.post("/api/leadgen/leads/delete", {
          jobId,
          leadIds,
        });
        deleted += res.deleted || 0;
      } catch (err) {
        failedJobs++;
        if (err.status === 409) {
          toast(
            "One or more of these leads belong to a search that is currently running. Wait for it to finish.",
            "error"
          );
        } else {
          toast(err.message || "Failed to delete some leads.", "error");
        }
      }
    }

    setDeleting(false);

    if (deleted > 0) {
      toast(
        `Deleted ${deleted} lead${deleted === 1 ? "" : "s"}${
          failedJobs > 0 ? ` (${failedJobs} search(es) failed)` : ""
        }.`,
        failedJobs > 0 ? "info" : "success"
      );
      // Optimistic local removal for the ones that succeeded. Simplest
      // is to refetch — the server is the source of truth and this
      // avoids drifting the aggregate view.
      clearSelection();
      fetchLeads();
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} lead{total === 1 ? "" : "s"} from your searches
          </p>
        </div>
        <Link to="/searches/new" className="btn-primary">
          New Search
        </Link>
      </div>

      <div className="card p-3 mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company, title…"
          className="px-3 py-2 border rounded flex-1 min-w-0"
        />
        <select
          value={filterScore}
          onChange={(e) => setFilterScore(e.target.value)}
          className="px-3 py-2 border rounded bg-white"
        >
          <option value="all">All scores</option>
          <option value="high">High (≥0.8)</option>
          <option value="medium">Medium (0.6–0.8)</option>
        </select>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card p-6 text-center text-gray-500">
          {total === 0
            ? "No leads yet. Run a search to start discovering leads."
            : "No leads match your filters."}
        </div>
      )}

      {filtered.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={
                        selected.size === filtered.length && filtered.length > 0
                      }
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Company</th>
                  <th className="p-3 text-right">Score</th>
                  <th className="p-3">Intent</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Sent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.linkedinPublicId} className="border-t">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.linkedinPublicId)}
                        onChange={() => toggleOne(lead.linkedinPublicId)}
                      />
                    </td>
                    <td className="p-3 font-medium">
                      {lead.fullName || "—"}
                    </td>
                    <td className="p-3 text-gray-700">{lead.title || "—"}</td>
                    <td className="p-3 text-gray-700">
                      {lead.companyName || "—"}
                    </td>
                    <td className="p-3 text-right">
                      <ScoreBadge score={lead.score} />
                    </td>
                    <td className="p-3 text-gray-700">
                      {lead.intentSignal?.type || "—"}
                    </td>
                    <td className="p-3">
                      {lead.sourceUrl ? (
                        <a
                          href={lead.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">
                      {lead.sentStatus ? (
                        <span className="text-green-700 text-xs font-medium">
                          ✓ {lead.sentStatus}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 bg-white border-t p-3 mt-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-700">
              {selected.size > 0
                ? `${selected.size} selected`
                : `${filtered.length} shown`}
            </span>
            {selected.size > 0 && (
              <button
                onClick={clearSelection}
                className="text-sm text-gray-600 hover:underline"
              >
                Clear
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => handleExport("xlsx")}
              disabled={exporting || deleting}
              className="btn-secondary"
            >
              {exporting ? "Exporting…" : "Export Excel"}
            </button>
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting || deleting}
              className="btn-secondary"
            >
              Export CSV
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0 || deleting}
              className="btn-secondary"
              title={
                selected.size === 0
                  ? "Select leads first"
                  : "Delete selected leads"
              }
              style={{ color: selected.size === 0 ? undefined : "#b91c1c" }}
            >
              {deleting ? "Deleting…" : "Delete selected"}
            </button>
            {hasMeetingMakerPlan ? (
              <button
                onClick={() => setSendOpen(true)}
                disabled={selected.size === 0 || deleting}
                className="btn-primary"
                title={
                  selected.size === 0
                    ? "Select leads first"
                    : undefined
                }
              >
                Send to Meeting Maker
              </button>
            ) : (
              <button
                disabled
                className="btn-primary"
                title="Upgrade your Meeting Maker plan to send leads."
              >
                Send to Meeting Maker
              </button>
            )}
          </div>
        </>
      )}

      {sendOpen && (
        <SendToMmDialog
          leads={selectedLeads}
          onClose={() => setSendOpen(false)}
          onSuccess={(batchId) => {
            setSendOpen(false);
            clearSelection();
            toast(
              `Sent ${selectedLeads.length} leads to Meeting Maker.`,
              "success"
            );
            fetchLeads();
          }}
        />
      )}
    </div>
  );
}

function ScoreBadge({ score }) {
  if (typeof score !== "number") return <span>—</span>;
  const color =
    score >= 0.8
      ? "bg-green-100 text-green-700"
      : score >= 0.6
      ? "bg-yellow-100 text-yellow-800"
      : "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}
    >
      {score.toFixed(2)}
    </span>
  );
}

function SendToMmDialog({ leads, onClose, onSuccess }) {
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState(
    localStorage.getItem("leadgen:lastAgentId") || ""
  );
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get("/api/leadgen/bdr-agents");
        if (cancelled) return;
        const list = data.agents || [];
        setAgents(list);
        if (!agentId && list.length > 0) {
          setAgentId(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Failed to load agents.");
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!agentId) return;
    setSubmitting(true);
    setError("");
    try {
      const byJob = {};
      for (const lead of leads) {
        const j = lead.jobId;
        if (!byJob[j]) byJob[j] = [];
        byJob[j].push(lead.linkedinPublicId);
      }
      let lastBatchId = null;
      for (const [jobId, leadIds] of Object.entries(byJob)) {
        const res = await api.post("/api/leadgen/leads/send-to-mm", {
          jobId,
          leadIds,
          agentId,
        });
        lastBatchId = res.batchId;
      }
      localStorage.setItem("leadgen:lastAgentId", agentId);
      onSuccess(lastBatchId);
    } catch (err) {
      if (err.code === "meetingmaker_plan_required") {
        setError(
          "Your Meeting Maker plan doesn't include lead imports. Upgrade Meeting Maker to send."
        );
      } else if (err.code === "agent_not_configured") {
        setError(
          "That agent isn't configured yet. Configure it in Meeting Maker first."
        );
      } else {
        setError(err.message || "Send failed.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold mb-1">Send to Meeting Maker</h2>
        <p className="text-sm text-gray-600 mb-4">
          Send {leads.length} lead{leads.length === 1 ? "" : "s"} to a BDR
          agent.
        </p>

        {loadingAgents && (
          <p className="text-sm text-gray-500">Loading agents…</p>
        )}

        {!loadingAgents && agents.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3 mb-4 text-sm">
            No configured BDR agents found. Create and configure one in
            Meeting Maker first.
          </div>
        )}

        {!loadingAgents && agents.length > 0 && (
          <label className="block mb-4">
            <span className="block text-sm font-medium mb-1">Agent</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 border rounded bg-white"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={
              submitting || !agentId || loadingAgents || agents.length === 0
            }
            className="btn-primary"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}