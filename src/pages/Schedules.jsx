// src/pages/Schedules.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { useToast } from "../components/Toast.jsx";

export default function Schedules() {
  const { hasMeetingMakerPlan } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null); // schedule id
  const [busy, setBusy] = useState(new Set()); // schedule ids with pending mutations

  async function fetchSchedules() {
    setLoading(true);
    try {
      const data = await api.get("/api/leadgen/scheduled-searches");
      setSchedules(data.schedules || []);
      setError("");
    } catch (err) {
      if (err.status === 401 || err.status === 402) return;
      setError(err.message || "Failed to load schedules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSchedules();
  }, []);

  function markBusy(id, on) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleToggleActive(schedule) {
    markBusy(schedule.id, true);
    try {
      const data = await api.patch(
        `/api/leadgen/scheduled-searches/${schedule.id}`,
        { active: !schedule.active }
      );
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? data.schedule : s))
      );
      toast(
        `Schedule ${schedule.active ? "paused" : "resumed"}.`,
        "success"
      );
    } catch (err) {
      toast(err.message || "Failed to update schedule.", "error");
    } finally {
      markBusy(schedule.id, false);
    }
  }

  async function handleDelete(schedule) {
    const ok = window.confirm(
      `Delete schedule "${schedule.name}"?\n\n` +
        `This does not delete any leads already produced by its previous runs.`
    );
    if (!ok) return;

    markBusy(schedule.id, true);
    try {
      await api.delete(`/api/leadgen/scheduled-searches/${schedule.id}`);
      setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
      toast("Schedule deleted.", "success");
    } catch (err) {
      toast(err.message || "Failed to delete schedule.", "error");
    } finally {
      markBusy(schedule.id, false);
    }
  }

  async function handleToggleAutoSend(schedule, nextOn, agentId) {
    markBusy(schedule.id, true);
    try {
      const body = { autoSendToMeetingMaker: nextOn };
      if (nextOn && agentId) body.sendToMeetingMakerAgentId = agentId;
      const data = await api.patch(
        `/api/leadgen/scheduled-searches/${schedule.id}`,
        body
      );
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? data.schedule : s))
      );
      toast(
        nextOn ? "Auto-send enabled." : "Auto-send disabled.",
        "success"
      );
    } catch (err) {
      if (err.code === "meetingmaker_plan_required") {
        toast("Auto-send requires a paid Meeting Maker plan.", "error");
      } else if (err.code === "agent_not_configured") {
        toast(
          "That agent isn't fully configured. Add persona + services first.",
          "error"
        );
      } else if (err.code === "invalid_agent_id") {
        toast("Pick an agent first.", "error");
      } else {
        toast(err.message || "Failed to update auto-send.", "error");
      }
    } finally {
      markBusy(schedule.id, false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Scheduled Searches</h1>
          <p className="text-sm text-gray-500 mt-1">
            These briefs re-run automatically on their interval. Each run
            produces a new job visible in{" "}
            <Link to="/searches" className="text-blue-600 hover:underline">
              Searches
            </Link>
            .
          </p>
        </div>
        <button onClick={() => nav("/searches/new")} className="btn-primary">
          New Schedule
        </button>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && schedules.length === 0 && (
        <div className="card p-6 text-center text-gray-500">
          <p className="mb-3">No schedules yet.</p>
          <p className="text-sm">
            Create one from{" "}
            <Link to="/searches/new" className="text-blue-600 hover:underline">
              New Search
            </Link>{" "}
            by ticking <strong>Schedule this search</strong>.
          </p>
        </div>
      )}

      {schedules.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Interval</th>
                <th className="p-3">Next Run</th>
                <th className="p-3">Auto-Send</th>
                <th className="p-3 text-right">Runs</th>
                <th className="p-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const isExpanded = expanded === s.id;
                const isBusy = busy.has(s.id);
                const isAutoSend = s.autoSendToMeetingMaker === true;
                const isPaused = s.active === false;

                return (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    isExpanded={isExpanded}
                    isBusy={isBusy}
                    isAutoSend={isAutoSend}
                    isPaused={isPaused}
                    hasMeetingMakerPlan={hasMeetingMakerPlan}
                    onToggleExpand={() =>
                      setExpanded((prev) => (prev === s.id ? null : s.id))
                    }
                    onToggleActive={() => handleToggleActive(s)}
                    onDelete={() => handleDelete(s)}
                    onToggleAutoSend={(nextOn, agentId) =>
                      handleToggleAutoSend(s, nextOn, agentId)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  schedule,
  isExpanded,
  isBusy,
  isAutoSend,
  isPaused,
  hasMeetingMakerPlan,
  onToggleExpand,
  onToggleActive,
  onDelete,
  onToggleAutoSend,
}) {
  const brief = schedule.brief || {};
  const services = Array.isArray(brief.services) ? brief.services : [];

  return (
    <>
      <tr className="border-t">
        <td className="p-3">
          <button
            onClick={onToggleExpand}
            className="text-left hover:text-blue-600"
          >
            <span className="font-medium">{schedule.name || "(unnamed)"}</span>
            {isPaused && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                paused
              </span>
            )}
          </button>
        </td>
        <td className="p-3 text-gray-700">
          {intervalLabel(schedule.intervalDays)}
        </td>
        <td className="p-3 text-gray-700 whitespace-nowrap">
          {isPaused ? "—" : formatDate(schedule.nextRunAt)}
        </td>
        <td className="p-3">
          {isAutoSend ? (
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
              title="Each run of this schedule auto-sends its leads to Meeting Maker"
            >
              🤖 On
            </span>
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )}
        </td>
        <td className="p-3 text-right text-gray-700">
          {schedule.runCount || 0}
        </td>
        <td className="p-3 text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-2">
            {schedule.lastJobId && (
              <Link
                to={`/searches/${schedule.lastJobId}`}
                className="text-blue-600 hover:underline text-sm"
              >
                Last run
              </Link>
            )}
            <button
              onClick={onToggleActive}
              disabled={isBusy}
              className="text-gray-700 hover:text-blue-700 text-sm disabled:opacity-40"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isBusy ? "…" : isPaused ? "▶" : "❚❚"}
            </button>
            <button
              onClick={onDelete}
              disabled={isBusy}
              className="text-red-600 hover:text-red-800 text-sm disabled:opacity-40"
              title="Delete schedule"
            >
              {isBusy ? "…" : "✕"}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50 border-t">
          <td colSpan={6} className="p-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm">
                  <strong>Services:</strong>{" "}
                  {services.length > 0 ? services.join(", ") : "—"}
                </p>
                <p className="text-sm mt-1">
                  <strong>ICP:</strong> {formatIcp(brief.icp)}
                </p>
                <p className="text-sm mt-1 text-gray-600">
                  <strong>Date range:</strong>{" "}
                  {brief.datePosted || "past_month"} ·{" "}
                  <strong>Limit:</strong> {brief.limit || "—"} ·{" "}
                  <strong>Last run:</strong>{" "}
                  {schedule.lastRunAt
                    ? formatDate(schedule.lastRunAt)
                    : "never"}
                </p>
              </div>

              {hasMeetingMakerPlan ? (
                <AutoSendEditor
                  schedule={schedule}
                  isBusy={isBusy}
                  onToggle={onToggleAutoSend}
                />
              ) : (
                <div className="bg-gray-100 border border-gray-200 rounded p-3 text-sm text-gray-700">
                  Auto-send requires a paid Meeting Maker plan.{" "}
                  <span className="text-gray-500">
                    This schedule will still produce leads normally.
                  </span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AutoSendEditor({ schedule, isBusy, onToggle }) {
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [localAgentId, setLocalAgentId] = useState(
    schedule.sendToMeetingMakerAgentId
      ? String(schedule.sendToMeetingMakerAgentId)
      : ""
  );
  const isAutoSend = schedule.autoSendToMeetingMaker === true;

  // Fetch agents lazily — only when the editor is rendered.
  useEffect(() => {
    let cancelled = false;
    setAgentsLoading(true);
    (async () => {
      try {
        const data = await api.get("/api/leadgen/bdr-agents");
        if (cancelled) return;
        setAgents(Array.isArray(data?.agents) ? data.agents : []);
      } catch {
        // swallow — dropdown stays empty, user can still toggle off
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the schedule's stored agent changes externally (e.g. after a
  // successful PATCH), sync the local selection.
  useEffect(() => {
    setLocalAgentId(
      schedule.sendToMeetingMakerAgentId
        ? String(schedule.sendToMeetingMakerAgentId)
        : ""
    );
  }, [schedule.sendToMeetingMakerAgentId]);

  function handleCheckboxChange(e) {
    const nextOn = e.target.checked;
    if (!nextOn) {
      // Turning OFF — no validation needed, backend clears the agent.
      onToggle(false, null);
      return;
    }

    // Turning ON — several guards before we attempt the PATCH.

    // 1. Agents still loading: refuse the click, reset the DOM to reflect
    //    the actual state. User can click again once agents are loaded.
    if (agentsLoading) {
      e.target.checked = false;
      return;
    }

    // 2. No configured agents at all: refuse the click. The in-JSX
    //    "No configured BDR agents found" message is already visible.
    if (agents.length === 0) {
      e.target.checked = false;
      return;
    }

    // 3. Use currently selected agent, or auto-select if only one exists.
    let candidate = localAgentId;
    if (!candidate && agents.length === 1) {
      candidate = String(agents[0].id);
      setLocalAgentId(candidate);
    }

    // 4. No agent selected and can't auto-select: refuse the click.
    //    The dropdown is visible; user must pick one.
    if (!candidate) {
      e.target.checked = false;
      return;
    }

    onToggle(true, candidate);
  }

  return (
    <div className="bg-white border border-gray-200 rounded p-3">
      <div className="flex items-start gap-3">
        <input
          id={`auto-send-${schedule.id}`}
          type="checkbox"
          checked={isAutoSend}
          onChange={handleCheckboxChange}
          disabled={isBusy || agentsLoading}
          className="mt-1"
          style={{ width: 18, height: 18 }}
        />
        <div className="flex-1">
          <label
            htmlFor={`auto-send-${schedule.id}`}
            className={`block font-semibold ${
              isBusy || agentsLoading
                ? "cursor-wait text-gray-500"
                : "cursor-pointer"
            }`}
          >
            Send to Meeting Maker automatically
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Each time this schedule runs, its leads will be added to Meeting
            Maker and assigned to the agent below.
          </p>

          {isAutoSend && (
            <div className="mt-3 space-y-2">
              {agentsLoading ? (
                <p className="text-sm text-gray-500">Loading agents…</p>
              ) : agents.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                  No configured BDR agents found. Add one in Meeting Maker
                  first.
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Assign to agent
                  </label>
                  <select
                    value={localAgentId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLocalAgentId(next);
                      if (next) onToggle(true, next);
                    }}
                    disabled={isBusy}
                    className="w-full px-3 py-2 border rounded bg-white"
                  >
                    <option value="">— Select an agent —</option>
                    {agents.map((a) => (
                      <option key={String(a.id)} value={String(a.id)}>
                        {a.name || "(unnamed agent)"}
                        {a.role ? ` — ${a.role}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function intervalLabel(days) {
  const m = {
    1: "every day",
    2: "every 2 days",
    3: "every 3 days",
    5: "every 5 days",
    7: "every week",
    14: "every 2 weeks",
    30: "every month",
  };
  return m[days] || `every ${days} days`;
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

function formatIcp(icp) {
  if (!icp || typeof icp !== "object") return "—";
  const parts = [];
  if (Array.isArray(icp.titles) && icp.titles.length)
    parts.push(`Titles: ${icp.titles.join(", ")}`);
  if (Array.isArray(icp.industries) && icp.industries.length)
    parts.push(`Industries: ${icp.industries.join(", ")}`);
  if (Array.isArray(icp.locations) && icp.locations.length)
    parts.push(`Locations: ${icp.locations.join(", ")}`);
  if (Array.isArray(icp.headcount) && icp.headcount.length)
    parts.push(`Headcount: ${icp.headcount.join(", ")}`);
  return parts.length ? parts.join(" · ") : "—";
}