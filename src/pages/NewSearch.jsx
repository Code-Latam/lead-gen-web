// src/pages/NewSearch.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";

const HEADCOUNT_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10001+",
];

const DATE_OPTIONS = [
  { value: "past_24_hours", label: "Past 24 hours" },
  { value: "past_week", label: "Past week" },
  { value: "past_month", label: "Past month" },
  { value: "past_year", label: "Past year" },
];

// Must match ScheduledSearch schema enum and leadGenScheduled.js
const INTERVAL_OPTIONS = [
  { value: 1, label: "Every day" },
  { value: 2, label: "Every 2 days" },
  { value: 3, label: "Every 3 days" },
  { value: 5, label: "Every 5 days" },
  { value: 7, label: "Every week" },
  { value: 14, label: "Every 2 weeks" },
  { value: 30, label: "Every month" },
];

const ALLOWED_BDR_ROLES = [
  "business development representative",
  "bdr",
];

/**
 * Mirrors the server-side leadGenJobs.js validation for a valid
 * auto-send agent. Client-side filter is UX only — the backend
 * re-validates and returns 400/404 with a specific error code if
 * anything slips through.
 */
function isEligibleAutoSendAgent(agent) {
  if (!agent) return false;
  const role = String(agent.role || "").trim().toLowerCase();
  if (!ALLOWED_BDR_ROLES.includes(role)) return false;
  if (agent.isActive === false) return false;

  const persona = String(agent.persona || "").trim();
  if (!persona || persona === "Empty") return false;

  const services = Array.isArray(agent.services) ? agent.services : [];
  if (services.length === 0) return false;
  if (services.length === 1 && services[0] === "Empty") return false;

  return true;
}

export default function NewSearch() {
  const nav = useNavigate();
  const toast = useToast();

  // Form state
  const [services, setServices] = useState([""]);
  const [titles, setTitles] = useState("");
  const [industries, setIndustries] = useState("");
  const [locations, setLocations] = useState("");
  const [headcount, setHeadcount] = useState([]);
  const [keywords, setKeywords] = useState("");
  const [datePosted, setDatePosted] = useState("past_month");

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [intervalDays, setIntervalDays] = useState(7);
  const [scheduleName, setScheduleName] = useState("");

  // Auto-send state
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [autoSendAgentId, setAutoSendAgentId] = useState("");
  const [bdrAgents, setBdrAgents] = useState([]);
  const [bdrAgentsLoading, setBdrAgentsLoading] = useState(false);

  // Entitlement state (fetched from /auth/me)
  const [hasMeetingMakerPlan, setHasMeetingMakerPlan] = useState(false);
  const [entitlementLoaded, setEntitlementLoaded] = useState(false);

  // Pre-fill state
  const [prefillSource, setPrefillSource] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Fetch entitlement (drives the auto-send card visibility) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get("/auth/me");
        if (cancelled) return;
        const client = data?.client || {};
        const eligible =
          client.leadGenSubscribed === true &&
          typeof client.plan === "string" &&
          client.plan !== "free";
        setHasMeetingMakerPlan(eligible);
      } catch (err) {
        // Non-fatal — the auto-send card simply stays hidden.
        console.warn("Failed to load entitlement:", err?.message);
      } finally {
        if (!cancelled) setEntitlementLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch BDR agents (only when the entitlement is present) ──
  useEffect(() => {
    if (!hasMeetingMakerPlan) return;
    let cancelled = false;
    setBdrAgentsLoading(true);
    (async () => {
      try {
        const data = await api.get("/api/agents");
        if (cancelled) return;
        const all = Array.isArray(data?.agents) ? data.agents : [];
        const eligible = all.filter(isEligibleAutoSendAgent);
        setBdrAgents(eligible);
        // Preselect if there's exactly one — saves a click
        if (eligible.length === 1 && !autoSendAgentId) {
          setAutoSendAgentId(String(eligible[0]._id));
        }
      } catch (err) {
        console.warn("Failed to load BDR agents:", err?.message);
      } finally {
        if (!cancelled) setBdrAgentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMeetingMakerPlan]);

  // ── Pre-fill from the most recent completed search ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get("/api/leadgen/jobs?limit=20");
        if (cancelled) return;
        // Pre-fill from the most recent non-failed job — includes queued and
        // processing jobs, so edits made just before a new run are picked up.
        const lastDone = (data.jobs || []).find((j) => j.status !== "failed");

        if (!lastDone) return;

        const icp = lastDone.icp || {};
        const lastServices = Array.isArray(lastDone.services)
          ? lastDone.services
          : [];

        if (lastServices.length > 0) setServices(lastServices);
        if (Array.isArray(icp.titles) && icp.titles.length)
          setTitles(icp.titles.join(", "));
        if (Array.isArray(icp.industries) && icp.industries.length)
          setIndustries(icp.industries.join(", "));
        if (Array.isArray(icp.locations) && icp.locations.length)
          setLocations(icp.locations.join(", "));
        if (Array.isArray(icp.headcount) && icp.headcount.length)
          setHeadcount(icp.headcount);
        if (Array.isArray(icp.keywords) && icp.keywords.length)
          setKeywords(icp.keywords.join(", "));
        if (lastDone.datePosted) setDatePosted(lastDone.datePosted);

        setPrefillSource(lastDone.createdAt || true);
      } catch (err) {
        console.warn("Pre-fill from last search failed:", err?.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateService(idx, value) {
    setServices((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }
  function addService() {
    if (services.length >= 10) return;
    setServices((prev) => [...prev, ""]);
  }
  function removeService(idx) {
    if (services.length <= 1) return;
    setServices((prev) => prev.filter((_, i) => i !== idx));
  }
  function toggleHeadcount(option) {
    setHeadcount((prev) =>
      prev.includes(option)
        ? prev.filter((h) => h !== option)
        : [...prev, option]
    );
  }
  function clearPrefill() {
    setServices([""]);
    setTitles("");
    setIndustries("");
    setLocations("");
    setHeadcount([]);
    setKeywords("");
    setDatePosted("past_month");
    // NOTE: no setLimit here — limit is not a state variable; the
    // payload hardcodes limit: 20. (Previous versions called
    // setLimit(10) which threw ReferenceError.)
    setPrefillSource(null);
    setError("");
  }

  function buildBriefOrError() {
    const cleanServices = services.map((s) => s.trim()).filter(Boolean);
    if (cleanServices.length === 0) {
      return { error: "At least one service is required." };
    }

    const splitCsv = (s) =>
      s.split(",").map((x) => x.trim()).filter(Boolean);

    const icp = {
      titles: splitCsv(titles),
      industries: splitCsv(industries),
      locations: splitCsv(locations),
      headcount,
      keywords: splitCsv(keywords),
    };

    if (
      icp.titles.length === 0 &&
      icp.industries.length === 0 &&
      icp.locations.length === 0
    ) {
      return {
        error: "Provide at least one of: titles, industries, or locations.",
      };
    }

    return {
      payload: {
        services: cleanServices,
        icp,
        datePosted,
        limit: 20,
      },
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const built = buildBriefOrError();
    if (built.error) {
      setError(built.error);
      return;
    }

    // Auto-send is one-off only. If somehow both are on (e.g. user
    // toggled auto-send, then toggled schedule without clearing), refuse
    // rather than silently dropping the flag.
    if (scheduleEnabled && autoSendEnabled) {
      setError(
        "Auto-send is only available for one-off searches. Turn off the schedule to enable it."
      );
      return;
    }

    // Auto-send guard: agent must be selected
    if (autoSendEnabled && !autoSendAgentId) {
      setError(
        "Pick a BDR agent to auto-send leads to, or uncheck 'Send to Meeting Maker automatically'."
      );
      return;
    }

    setSubmitting(true);
    try {
      if (scheduleEnabled) {
        // Create a recurring schedule instead of an immediate job.
        // Auto-send is deliberately not sent here — scheduled-searches
        // route does not support it yet.
        const data = await api.post("/api/leadgen/scheduled-searches", {
          ...built.payload,
          intervalDays,
          name: scheduleName.trim() || undefined,
        });
        toast(
          `Schedule created. First automatic run ${formatDate(data.nextRunAt)}.`,
          "success"
        );
        nav("/searches");
      } else {
        // Build the job payload. Auto-send fields only added when
        // the user opted in — otherwise the route treats them as
        // defaults (false / null).
        const payload = { ...built.payload };
        if (autoSendEnabled) {
          payload.autoSendToMeetingMaker = true;
          payload.sendToMeetingMakerAgentId = autoSendAgentId;
        }
        const data = await api.post("/api/leadgen/jobs", payload);
        nav(`/searches/${data.jobId}`);
      }
    } catch (err) {
      if (err.code === "services_required") {
        setError("At least one service is required.");
      } else if (err.code === "icp_required") {
        setError("Provide at least one of: titles, industries, or locations.");
      } else if (err.code === "invalid_interval") {
        setError("Pick a valid repeat interval.");
      } else if (err.code === "meetingmaker_plan_required") {
        // API client deliberately does NOT auto-redirect for this 402
        // (see client.js comment). Show inline so the user knows
        // exactly why auto-send was rejected.
        setError(
          "Auto-send requires a paid Meeting Maker plan. Upgrade to enable this feature."
        );
      } else if (err.code === "invalid_agent_id") {
        setError(
          "Select a valid BDR agent before enabling auto-send."
        );
      } else if (err.code === "agent_not_found") {
        setError(
          "The selected agent no longer exists. Pick another agent."
        );
      } else if (err.code === "agent_inactive") {
        setError(
          "The selected agent is inactive. Activate it or pick another."
        );
      } else if (err.code === "agent_role_not_bdr") {
        setError(
          "The selected agent is not a BDR. Pick a Business Development Representative agent."
        );
      } else if (err.code === "agent_not_configured") {
        setError(
          "The selected agent isn't fully configured. Add a persona and services before using it for auto-send."
        );
      } else {
        setError(err.message || "Failed to submit.");
      }
      setSubmitting(false);
    }
  }

  const submitLabel = submitting
    ? scheduleEnabled
      ? "Creating schedule…"
      : "Starting…"
    : scheduleEnabled
    ? "Create Schedule"
    : "Start Search";

  const nextRunPreview = scheduleEnabled
    ? formatDate(addDays(new Date(), intervalDays))
    : null;

  // Show the auto-send card only when the user could plausibly use it.
  // Entitlement drives visibility; the card itself is disabled when
  // a schedule is on (auto-send + schedule don't combine yet).
  const showAutoSendCard = entitlementLoaded && hasMeetingMakerPlan;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <Link to="/searches" className="text-blue-600 hover:underline text-sm">
          ← Back to Searches
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-1">
        {scheduleEnabled ? "New Scheduled Search" : "New Search"}
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        {scheduleEnabled
          ? `Runs automatically ${intervalLabel(intervalDays)}. Each run takes 10–30 minutes and returns up to 20 high-intent leads.`
          : "A search takes 10–30 minutes. It returns up to 20 high-intent leads. Most searches return 1–5; a richer brief returns more."}
      </p>

      {prefillSource && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 flex items-start gap-3">
          <div className="flex-1 text-sm text-blue-900">
            💡 Pre-filled from your last search ({formatDate(prefillSource)}).
            Edit anything before starting.
          </div>
          <button
            type="button"
            onClick={clearPrefill}
            className="text-xs text-blue-700 hover:underline whitespace-nowrap"
          >
            Clear form
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-1">Services</h2>
          <p className="text-xs text-gray-500 mb-3">
            Describe what you sell. 2–4 specific offerings work better than
            one generic phrase.
          </p>
          <div className="space-y-2">
            {services.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={s}
                  onChange={(e) => updateService(i, e.target.value)}
                  placeholder={
                    i === 0
                      ? 'e.g. "AI-powered LinkedIn outreach and cold email automation for B2B SaaS"'
                      : "Another service"
                  }
                  className="flex-1 px-3 py-2 border rounded"
                  maxLength={500}
                />
                {services.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeService(i)}
                    className="btn-secondary px-3"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {services.length < 10 && (
            <button
              type="button"
              onClick={addService}
              className="btn-secondary mt-3"
            >
              + Add service
            </button>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-1">
            Ideal Customer Profile
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Comma-separated. Provide at least one of titles, industries, or
            locations.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Titles</label>
              <input
                type="text"
                value={titles}
                onChange={(e) => setTitles(e.target.value)}
                placeholder="VP Sales, Head of Sales, CRO, Founder"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Industries
              </label>
              <input
                type="text"
                value={industries}
                onChange={(e) => setIndustries(e.target.value)}
                placeholder="SaaS, B2B Software, Technology"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Locations
              </label>
              <input
                type="text"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="United States, Canada, United Kingdom"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Headcount (optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {HEADCOUNT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleHeadcount(opt)}
                    className={`px-3 py-1 rounded border text-sm ${
                      headcount.includes(opt)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Keywords (optional)
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="hiring SDRs, outbound, cold email"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-3">Search parameters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Date range
              </label>
              <select
                value={datePosted}
                onChange={(e) => setDatePosted(e.target.value)}
                className="w-full px-3 py-2 border rounded bg-white"
              >
                {DATE_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {showAutoSendCard && (
          <div className="card p-6">
            <div className="flex items-start gap-3">
              <input
                id="auto-send-toggle"
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(e) => setAutoSendEnabled(e.target.checked)}
                disabled={scheduleEnabled}
                className="mt-1"
                style={{ width: 18, height: 18 }}
              />
              <div className="flex-1">
                <label
                  htmlFor="auto-send-toggle"
                  className={`block font-semibold ${
                    scheduleEnabled ? "cursor-not-allowed text-gray-500" : "cursor-pointer"
                  }`}
                >
                  Send to Meeting Maker automatically
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  When this search finishes, the leads will be added to
                  Meeting Maker and assigned to the agent you pick below.
                  {scheduleEnabled
                    ? " (Not available for scheduled searches — you can send results manually from the search detail page after each run.)"
                    : ""}
                </p>

                {!scheduleEnabled && autoSendEnabled && (
                  <div className="mt-4 space-y-3">
                    {bdrAgentsLoading ? (
                      <p className="text-sm text-gray-500">Loading agents…</p>
                    ) : bdrAgents.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                        You don't have any configured BDR agents. Add a
                        Business Development Representative agent before
                        using auto-send.
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Assign to agent
                          </label>
                          <select
                            value={autoSendAgentId}
                            onChange={(e) => setAutoSendAgentId(e.target.value)}
                            className="w-full px-3 py-2 border rounded bg-white"
                          >
                            <option value="">— Select an agent —</option>
                            {bdrAgents.map((a) => (
                              <option key={String(a._id)} value={String(a._id)}>
                                {a.name || "(unnamed agent)"}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-700">
                          Every lead this search produces will count against
                          the selected agent's quota. Leads already in
                          Meeting Maker for this client are skipped
                          automatically.
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="card p-6">
          <div className="flex items-start gap-3">
            <input
              id="schedule-toggle"
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="mt-1"
              style={{ width: 18, height: 18 }}
            />
            <div className="flex-1">
              <label
                htmlFor="schedule-toggle"
                className="block font-semibold cursor-pointer"
              >
                Schedule this search
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Run the same brief automatically on a repeating interval. You
                can pause or delete it any time.
              </p>

              {scheduleEnabled && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Repeat interval
                    </label>
                    <select
                      value={intervalDays}
                      onChange={(e) =>
                        setIntervalDays(parseInt(e.target.value, 10))
                      }
                      className="w-full px-3 py-2 border rounded bg-white"
                    >
                      {INTERVAL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Schedule name (optional)
                    </label>
                    <input
                      type="text"
                      value={scheduleName}
                      onChange={(e) => setScheduleName(e.target.value)}
                      placeholder="e.g. Weekly SaaS ICP"
                      className="w-full px-3 py-2 border rounded"
                      maxLength={80}
                    />
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700">
                    First automatic run: <strong>{nextRunPreview}</strong>. Then{" "}
                    {intervalLabel(intervalDays)}.
                    <br />
                    <span className="text-xs text-gray-500">
                      Creating a schedule does not run a search now. If you also
                      want results today, submit once without the schedule
                      first.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitLabel}
          </button>
          <Link to="/searches" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
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
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}