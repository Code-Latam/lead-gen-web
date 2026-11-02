// src/lib/export.js

/**
 * Export leads to .xlsx or .csv. Lazy-loads SheetJS only when needed.
 *
 * @param {Array<Object>} leads — array of lead objects from /api/leadgen/leads
 * @param {'xlsx'|'csv'} format
 * @param {string} filenameBase — e.g. "leads" (extension added automatically)
 */
export async function exportLeads(leads, format = "xlsx", filenameBase = "leads") {
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error("No leads to export");
  }

  // Column order matches what the leads table shows
  const columns = [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "fullName", label: "Full Name" },
    { key: "title", label: "Title" },
    { key: "companyName", label: "Company" },
    { key: "location", label: "Location" },
    { key: "linkedinUrl", label: "LinkedIn URL" },
    { key: "linkedinPublicId", label: "LinkedIn ID" },
    { key: "score", label: "Score" },
    { key: "icpFit", label: "ICP Fit" },
    { key: "intentType", label: "Intent Type" },
    { key: "intentEvidence", label: "Intent Evidence" },
    { key: "reasoning", label: "Reasoning" },
    { key: "sourceUrl", label: "Source Post" },
    { key: "publishedDate", label: "Published" },
    { key: "sentStatus", label: "Sent to MM" },
  ];

  const rows = leads.map((lead) => ({
    firstName: lead.firstName || "",
    lastName: lead.lastName || "",
    fullName: lead.fullName || "",
    title: lead.title || "",
    companyName: lead.companyName || "",
    location: lead.location || "",
    linkedinUrl: lead.linkedinUrl || "",
    linkedinPublicId: lead.linkedinPublicId || "",
    score: typeof lead.score === "number" ? lead.score : "",
    icpFit: lead.icpFit || "",
    intentType: lead.intentSignal?.type || "",
    intentEvidence: lead.intentSignal?.evidence || "",
    reasoning: lead.reasoning || "",
    sourceUrl: lead.sourceUrl || "",
    publishedDate: lead.publishedDate || "",
    sentStatus: lead.sentStatus || "",
  }));

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenameBase}-${timestamp}.${format}`;

  if (format === "csv") {
    downloadCsv(rows, columns, filename);
    return;
  }

  // xlsx — lazy load SheetJS
  const XLSX = await loadSheetJs();
  const worksheetData = [
    columns.map((c) => c.label),
    ...rows.map((row) => columns.map((c) => row[c.key] ?? "")),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  XLSX.writeFile(workbook, filename);
}

function downloadCsv(rows, columns, filename) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

let sheetJsPromise = null;
function loadSheetJs() {
  if (!sheetJsPromise) {
    // Dynamic import — SheetJS is a heavy dep, load only on first export.
    // If the package isn't installed, fall back to the CDN build.
    sheetJsPromise = import("xlsx")
      .then((mod) => mod.default || mod)
      .catch(() =>
        import(
          /* @vite-ignore */
          "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"
        )
      );
  }
  return sheetJsPromise;
}