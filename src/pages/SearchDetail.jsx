// src/pages/SearchDetail.jsx
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { exportLeads, exportLeadsToPdf } from "../lib/export.js";

const POLL_MS = 10_000;

export default function SearchDetail() {
  const { jobId } = useParams();
  const toast = useToast();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const pollRef = useRef(null);

  async function fetchJob() {
    try {
      const data = await api.get(`/api/leadgen/jobs/${jobId}`);
      setJob(data.job);
      setError("");
    } catch (err) {
      if (err.status === 401 || err.status === 402) return;
      setError(err.message || "Failed to load search.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchJob();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (!job) return;
    const active =
      job.status === "queued" ||
      job.status === "processing" ||
      job.status === "processing_webhook_pending";

    if (!active) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchJob, POLL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  async function handleExport(format) {
    if (!job?.output?.leads?.length) return;
    setExporting(true);
    try {
      await exportLeads(job.output.leads, format, `search-${jobId.slice(0, 8)}`);
      toast(`Exported ${job.output.leads.length} leads.`, "success");
    } catch (err) {
      toast(err.message || "Export failed.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf() {
    if (!job?.output?.leads?.length) return;

    const brief = {
      services: job.input?.services || [],
      icp: job.input?.icp || {},
    };

    setPdfExporting(true);
    try {
      await exportLeadsToPdf(job.output.leads, {
        brief,
        filenameBase: `search-${jobId.slice(0, 8)}`,
      });
      toast(
        `Exported ${job.output.leads.length} lead${
          job.output.leads.length === 1 ? "" : "s"
        } to PDF.`,
        "success"
      );
    } catch (err) {
      toast(err.message || "PDF export failed.", "error");
    } finally {
      setPdfExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 text-gray-500">Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3">
          {error}
        </div>
        <Link to="/searches" className="btn-secondary mt-4 inline-block">
          Back to Searches
        </Link>
      </div>
    );
  }

  if (!job) return null;

  const leads = job.output?.leads || [];
  const stats = job.output?.stats || {};
  const isRunning =
    job.status === "queued" ||
    job.status === "processing" ||
    job.status === "processing_webhook_pending";
  const isDone =
    job.status === "completed" || job.status === "completed_webhook_failed";
  const isFailed = job.status === "failed";
  const anyExporting = exporting || pdfExporting;

  // Auto-send context for this job
  const isAutoSend = job.input?.autoSendToMeetingMaker === true;
  const autoSendStats = stats.autoSend || null;

  // DeepSeek indicator — only show in the running block when it
  // actually contributed something.
  const deepseekQueries = stats.deepseekQueries || 0;
  const deepseekFetched = stats.deepseekLeadsFetched || 0;
  const hasDeepseek = deepseekQueries > 0;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-4">
        <Link to="/searches" className="text-blue-600 hover:underline text-sm">
          ← Back to Searches
        </Link>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Search {jobId.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Created {formatDate(job.createdAt)} · Mode: {job.mode} · Limit:{" "}
            {job.input?.limit || "—"}
          </p>
        </div>
        {isDone && leads.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("xlsx")}
              disabled={anyExporting}
              className="btn-primary"
            >
              {exporting ? "Exporting…" : "Export Excel"}
            </button>
            <button
              onClick={() => handleExport("csv")}
              disabled={anyExporting}
              className="btn-secondary"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportPdf}
              disabled={anyExporting}
              className="btn-secondary"
            >
              {pdfExporting ? "Generating…" : "Export PDF"}
            </button>
          </div>
        )}
      </div>

      <div className="card p-4 mb-4">
        <p className="text-sm">
          <strong>Services:</strong>{" "}
          {(job.input?.services || []).join(", ") || "—"}
        </p>
        <p className="text-sm mt-1">
          <strong>ICP:</strong> {formatIcp(job.input?.icp)}
        </p>
      </div>

      {/* ── Auto-send status banner ──
          Three states:
            1. Running + auto-send armed → blue "will send when done" note
            2. Done + auto-send completed successfully (or partial) → green
            3. Done + auto-send failed (0 created) → red
          Non-auto-send jobs render nothing here. */}
      {isAutoSend && isRunning && <AutoSendArmedBanner />}
      {isAutoSend && isDone && (
        <AutoSendResultBanner
          stats={autoSendStats}
          personsCreatedCount={
            Array.isArray(job.output?.personsCreated)
              ? job.output.personsCreated.length
              : 0
          }
        />
      )}

      {isRunning && (
        <div className="card p-6 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="font-medium">
              {job.status === "queued"
                ? "Queued — waiting for worker…"
                : "Running…"}
            </p>
          </div>
          <ul className="space-y-1 text-sm text-gray-600">
            <li>
              {stats.queriesRun > 0 ? "✓" : "·"} Queries generated
              {stats.queriesRun > 0 && ` (${stats.queriesRun})`}
            </li>
            <li>
              {stats.postsReturned > 0 ? "✓" : "·"} LinkedIn posts searched
              {stats.postsReturned > 0 && ` (${stats.postsReturned})`}
            </li>
            {hasDeepseek && (
              <li>
                {deepseekFetched > 0 ? "✓" : "·"} Web-search results
                {deepseekFetched > 0 && ` (${deepseekFetched})`}
              </li>
            )}
            <li>
              {stats.scored > 0 ? "✓" : "·"} Posts scored with AI
              {stats.scored > 0 && ` (${stats.scored})`}
            </li>
            <li>
              {stats.passedScore > 0 ? "✓" : "·"} Leads built
              {stats.passedScore > 0 && ` (${stats.passedScore})`}
            </li>
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            This typically takes 10–30 minutes. You can navigate away — the
            search continues in the background.
          </p>
        </div>
      )}

      {isFailed && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4 mb-4">
          <p className="font-medium mb-1">Search failed</p>
          <p className="text-sm">{job.error || "Unknown error."}</p>
          <Link to="/searches/new" className="btn-secondary mt-3 inline-block">
            Retry with a new search
          </Link>
        </div>
      )}

      {isDone && (
        <>
          <div className="card p-4 mb-4 bg-green-50 border-green-200">
            <p className="text-sm">
              <strong>{leads.length}</strong> lead
              {leads.length === 1 ? "" : "s"} found ·{" "}
              <SourceSummary stats={stats} />
            </p>
          </div>

          {leads.length === 0 ? (
            <div className="card p-6 text-center text-gray-500">
              No leads passed the threshold. Try broadening your ICP or
              service description.
            </div>
          ) : (
            <LeadsTable leads={leads} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Shown while a job with autoSendToMeetingMaker:true is still
 * running. Tells the user what's about to happen so they aren't
 * surprised when Persons appear in Meeting Maker without them
 * clicking anything.
 */
function AutoSendArmedBanner() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-sm text-blue-900">
      🤖 <strong>Auto-send armed.</strong> When this search finishes, the
      leads will be added to Meeting Maker automatically and assigned to the
      agent you selected.
    </div>
  );
}

/**
 * Shown on a completed job with autoSendToMeetingMaker:true.
 *
 * Reads counts from job.output.stats.autoSend.counts, which the
 * worker writes (see intentDiscoveryService.js). Falls back to a
 * simple "N leads sent" line for jobs that predate this change
 * (no stats.autoSend block) but somehow have the flag set — which
 * shouldn't happen in practice, but costs nothing to defend
 * against.
 */
function AutoSendResultBanner({ stats, personsCreatedCount }) {
  // Fallback path — no stats block available (legacy job).
  if (!stats) {
    if (personsCreatedCount === 0) return null;
    return (
      <div className="bg-green-50 border border-green-200 rounded p-3 mb-4 text-sm text-green-900">
        🤖 <strong>Sent to Meeting Maker:</strong> {personsCreatedCount} lead
        {personsCreatedCount === 1 ? "" : "s"} created.
      </div>
    );
  }

  const { status, counts } = stats;
  const created = counts?.created || 0;
  const duplicate = counts?.duplicate || 0;
  const invalid = counts?.invalid || 0;
  const errorCount = counts?.error || 0;

  // Failed: nothing was created at all.
  if (status === "failed" && created === 0) {
    const detail = [];
    if (invalid > 0)
      detail.push(`${invalid} could not be matched to a LinkedIn profile`);
    if (errorCount > 0) detail.push(`${errorCount} failed with an error`);

    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 mb-4 text-sm">
        <p>
          🤖 <strong>Auto-send failed.</strong> 0 leads could be added to
          Meeting Maker.
          {detail.length > 0 && ` (${detail.join("; ")})`}
        </p>
        <p className="text-xs mt-1 text-red-700">
          Check that the selected agent is still active and configured. If the
          problem persists, try sending the leads manually from this page.
        </p>
      </div>
    );
  }

  // Success / partial.
  const parts = [];
  if (created > 0)
    parts.push(
      `${created} lead${created === 1 ? "" : "s"} created`
    );
  if (duplicate > 0)
    parts.push(
      `${duplicate} already existed in Meeting Maker`
    );
  if (invalid > 0)
    parts.push(`${invalid} skipped (no LinkedIn profile)`);
  if (errorCount > 0) parts.push(`${errorCount} failed`);

  // Determine tone: green if no failures, yellow if partial.
  const hasFailures = invalid > 0 || errorCount > 0;
  const cls = hasFailures
    ? "bg-yellow-50 border-yellow-200 text-yellow-900"
    : "bg-green-50 border-green-200 text-green-900";

  const heading = hasFailures
    ? "Auto-sent to Meeting Maker (partial)"
    : "Auto-sent to Meeting Maker";

  return (
    <div className={`${cls} border rounded p-3 mb-4 text-sm`}>
      🤖 <strong>{heading}:</strong> {parts.join(" · ")}.
    </div>
  );
}

function LeadsTable({ leads }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="p-3">Name</th>
            <th className="p-3">Title</th>
            <th className="p-3">Company</th>
            <th className="p-3 text-right">Score</th>
            <th className="p-3">Intent</th>
            <th className="p-3">Source</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.linkedinPublicId} className="border-t">
              <td className="p-3 font-medium">{lead.fullName || "—"}</td>
              <td className="p-3 text-gray-700">{lead.title || "—"}</td>
              <td className="p-3 text-gray-700">{lead.companyName || "—"}</td>
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
                    View post ↗
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders the "from N unique posts · M had intent · K passed..." line.
 *
 * - Old jobs (pre-DeepSeek): deepseekQueries === 0 or undefined → legacy wording
 * - New jobs where DeepSeek contributed 0 leads: still legacy wording
 * - New jobs where DeepSeek contributed ≥1 lead: mention web-search results
 *
 * Handles old jobs gracefully because they don't have the deepseek* stats.
 */
function SourceSummary({ stats }) {
  const uniquePosts = stats.uniquePosts || 0;
  const passedIntent = stats.passedIntent || 0;
  const unipilePassed = stats.passedScore || 0;
  const deepseekFetched = stats.deepseekLeadsFetched || 0;
  const deepseekPassed = stats.deepseekPassed || 0;

  // Determine whether web search contributed anything to this job.
  // If not, fall back to the legacy wording so old jobs render unchanged
  // and new jobs where DeepSeek failed don't show "+ 0 web results".
  const hasWebContrib =
    deepseekFetched > 0 && (deepseekPassed > 0 || unipilePassed > 0 || true);

  // Legacy path (also covers any job where DeepSeek returned nothing)
  if (!hasWebContrib) {
    return (
      <>
        from <strong>{uniquePosts}</strong> unique posts ·{" "}
        {passedIntent} had intent · <strong>{unipilePassed}</strong> passed
        the score threshold
      </>
    );
  }

  // New path — both sources contributed.
  const passedParts = [];
  if (unipilePassed > 0) passedParts.push(`${unipilePassed} from LinkedIn`);
  if (deepseekPassed > 0) passedParts.push(`${deepseekPassed} from web search`);

  return (
    <>
      from <strong>{uniquePosts}</strong> LinkedIn post
      {uniquePosts === 1 ? "" : "s"} + <strong>{deepseekFetched}</strong>{" "}
      web-search result{deepseekFetched === 1 ? "" : "s"}
      {passedParts.length > 0 && (
        <>
          {" "}· <strong>{unipilePassed + deepseekPassed}</strong> passed the
          score threshold ({passedParts.join(" + ")})
        </>
      )}
    </>
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
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score.toFixed(2)}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatIcp(icp) {
  if (!icp || typeof icp !== "object") return "—";
  const parts = [];
  if (icp.titles?.length) parts.push(`Titles: ${icp.titles.join(", ")}`);
  if (icp.industries?.length)
    parts.push(`Industries: ${icp.industries.join(", ")}`);
  if (icp.locations?.length) parts.push(`Locations: ${icp.locations.join(", ")}`);
  if (icp.headcount?.length)
    parts.push(`Headcount: ${icp.headcount.join(", ")}`);
  return parts.length ? parts.join(" · ") : "—";
}