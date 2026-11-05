// src/lib/export.js

/**
 * Export leads to .xlsx, .csv, or .pdf (detailed card report).
 * All heavy dependencies are lazy-loaded on first use.
 */

/* ────────────────────────────────────────────────────────────────
   Excel / CSV export (unchanged)
   ──────────────────────────────────────────────────────────────── */

export async function exportLeads(leads, format = "xlsx", filenameBase = "leads") {
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error("No leads to export");
  }

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

/* ────────────────────────────────────────────────────────────────
   PDF export — detailed per-lead card report

   Layout:
     - Cover: title, generated date, count, brief (services + ICP)
     - Per lead: name, title/company, score, intent, ICP fit,
                 "why this lead" (reasoning), "what they said"
                 (evidence), source URL, published date
     - Page number in footer

   A4 portrait, 2cm margins. Each lead card is sized dynamically
   based on wrapped-text height, so long evidence/reasoning never
   gets truncated. Cards flow across pages; if a card can't fit
   in the remaining space, a page break is inserted.
   ──────────────────────────────────────────────────────────────── */

export async function exportLeadsToPdf(
  leads,
  { brief = null, filenameBase = "leads" } = {}
) {
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error("No leads to export");
  }

  const { default: jsPDF } = await import("jspdf");

  const PAGE_W = 210;       // A4 width mm
  const PAGE_H = 297;       // A4 height mm
  const MARGIN = 20;        // left/right
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM_MARGIN = 18; // leaves room for page numbers
  const CARD_GAP = 6;
  const CARD_PAD = 5;

  // Colors
  const BLACK = [17, 24, 39];      // gray-900
  const GRAY = [107, 114, 128];    // gray-500
  const LIGHT_GRAY = [229, 231, 235]; // gray-200
  const ACCENT = [37, 99, 235];    // blue-600
  const GREEN = [21, 128, 61];     // green-700
  const AMBER = [180, 83, 9];      // amber-700

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = MARGIN;

  // ── Cover header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BLACK);
  doc.text("Intent Radar — Lead Report", MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  const generatedOn = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(
    `${leads.length} lead${leads.length === 1 ? "" : "s"}  ·  Generated ${generatedOn}`,
    MARGIN,
    y
  );
  y += 6;

  // ── Brief block (optional) ──
  if (brief && (brief.services?.length || brief.icp)) {
    y = drawBriefBlock(doc, brief, MARGIN, y, CONTENT_W, {
      BLACK,
      GRAY,
      LIGHT_GRAY,
    });
    y += CARD_GAP;
  }

  // ── Lead cards ──
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const cardHeight = measureCard(doc, lead, CONTENT_W, CARD_PAD, i + 1, leads.length);
    const remaining = PAGE_H - BOTTOM_MARGIN - y;

    if (cardHeight > remaining) {
      addFooter(doc, PAGE_W, PAGE_H, MARGIN, GRAY);
      doc.addPage();
      y = MARGIN;
    }

    y = drawCard(doc, lead, MARGIN, y, CONTENT_W, CARD_PAD, cardHeight, i + 1, leads.length, {
      BLACK,
      GRAY,
      LIGHT_GRAY,
      ACCENT,
      GREEN,
      AMBER,
    });
    y += CARD_GAP;
  }

  addFooter(doc, PAGE_W, PAGE_H, MARGIN, GRAY);

  const timestamp = new Date().toISOString().slice(0, 10);
  doc.save(`${filenameBase}-${timestamp}.pdf`);
}

/* ────────────────────────────────────────────────────────────────
   Card drawing + measuring
   ──────────────────────────────────────────────────────────────── */

// Measure how tall the card would be for this lead, without drawing
function measureCard(doc, lead, width, pad, idx, total) {
  const innerW = width - pad * 2;
  let h = pad; // top padding

  // Title row: "Lead N of M"
  h += 5;

  // Name (larger font)
  h += 6;
  h += 2;

  // Title · Company line
  h += 4.5;
  h += 4; // gap

  // Meta row (score, intent, icp fit) — single line, may wrap
  const metaLines = doc.splitTextToSize(metaLine(lead), innerW).length;
  h += metaLines * 4 + 2;
  h += 4; // gap

  // "WHY THIS LEAD" label
  h += 4;
  h += 1;

  // Reasoning (wrapped)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const reasoningLines = doc
    .splitTextToSize(lead.reasoning || "(no reasoning provided)", innerW)
    .length;
  h += reasoningLines * 4;
  h += 4; // gap

  // "EVIDENCE FROM POST" label
  h += 4;
  h += 1;

  // Evidence (wrapped, italic-ish indented)
  const evidence = lead.intentSignal?.evidence || "(no evidence captured)";
  const evidenceLines = doc.splitTextToSize(`"${evidence}"`, innerW - 4).length;
  h += evidenceLines * 4;
  h += 4; // gap

  // Source + published line
  h += 4;

  h += pad; // bottom padding
  return h;
}

function drawCard(doc, lead, x, y, width, pad, cardHeight, idx, total, colors) {
  const startY = y;
  const innerX = x + pad;
  const innerW = width - pad * 2;

  // Card border
  doc.setDrawColor(...colors.LIGHT_GRAY);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, cardHeight, 2, 2, "S");

  y += pad;

  // ── Title row: "Lead N of M" (right) + score badge (left) ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...colors.GRAY);
  doc.text(`Lead ${idx} of ${total}`, x + width - pad, y + 3, {
    align: "right",
  });

  // Score badge (colored)
  const score = typeof lead.score === "number" ? lead.score : null;
  if (score !== null) {
    const color =
      score >= 0.8 ? colors.GREEN : score >= 0.6 ? colors.AMBER : colors.GRAY;
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Score ${score.toFixed(2)}`, innerX, y + 3);
    doc.setFont("helvetica", "normal");
  }
  y += 5;

  // ── Name ──
  doc.setTextColor(...colors.BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown", innerX, y + 5);
  y += 6;
  y += 2;

  // ── Title · Company ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...colors.GRAY);
  const titleLine = [lead.title, lead.companyName].filter(Boolean).join("  ·  ");
  if (titleLine) {
    const wrapped = doc.splitTextToSize(titleLine, innerW);
    doc.text(wrapped, innerX, y + 4);
    y += wrapped.length * 4.5;
  }
  y += 4;

  // ── Meta row: Intent · ICP fit · Location ──
  doc.setFontSize(9);
  doc.setTextColor(...colors.BLACK);
  const meta = metaLine(lead);
  const metaWrapped = doc.splitTextToSize(meta, innerW);
  doc.text(metaWrapped, innerX, y + 3);
  y += metaWrapped.length * 4 + 2;
  y += 4;

  // ── WHY THIS LEAD ──
  y = drawLabel(doc, "WHY THIS LEAD", innerX, y, colors.GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...colors.BLACK);
  const reasoning = lead.reasoning || "(no reasoning provided)";
  const reasoningLines = doc.splitTextToSize(reasoning, innerW);
  doc.text(reasoningLines, innerX, y + 3);
  y += reasoningLines.length * 4 + 4;

  // ── EVIDENCE ──
  y = drawLabel(doc, "EVIDENCE FROM POST", innerX, y, colors.GRAY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...colors.GRAY);
  const evidence = lead.intentSignal?.evidence || "(no evidence captured)";
  const evidenceLines = doc.splitTextToSize(`"${evidence}"`, innerW - 4);
  // Indent the evidence by 4mm
  doc.text(evidenceLines, innerX + 4, y + 3);
  y += evidenceLines.length * 4 + 4;

  // ── Source URL + published ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (lead.sourceUrl) {
    doc.setTextColor(...colors.ACCENT);
    doc.textWithLink("View source post ↗", innerX, y + 3, {
      url: lead.sourceUrl,
    });
  }
  const publishedText = lead.publishedDate
    ? `  ·  Published ${formatShortDate(lead.publishedDate)}`
    : "";
  if (publishedText) {
    doc.setTextColor(...colors.GRAY);
    const w = lead.sourceUrl ? doc.getTextWidth("View source post ↗") : 0;
    doc.text(publishedText, innerX + w, y + 3);
  }

  return startY + cardHeight;
}

function drawLabel(doc, text, x, y, color) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...color);
  doc.text(text, x, y + 3);
  doc.setFont("helvetica", "normal");
  return y + 4;
}

function metaLine(lead) {
  const parts = [];
  const intentType = lead.intentSignal?.type;
  if (intentType) parts.push(`Intent: ${intentType}`);
  if (lead.icpFit) parts.push(`ICP fit: ${lead.icpFit}`);
  if (lead.location) parts.push(lead.location);
  return parts.join("  ·  ");
}

function drawBriefBlock(doc, brief, x, y, width, colors) {
  const pad = 4;
  const innerX = x + pad;
  const innerW = width - pad * 2;

  // Measure
  const servicesText = (brief.services || []).join("  ·  ");
  const icpParts = [];
  if (brief.icp?.titles?.length) icpParts.push(`Titles: ${brief.icp.titles.join(", ")}`);
  if (brief.icp?.industries?.length) icpParts.push(`Industries: ${brief.icp.industries.join(", ")}`);
  if (brief.icp?.locations?.length) icpParts.push(`Locations: ${brief.icp.locations.join(", ")}`);
  const icpText = icpParts.join("  ·  ");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const serviceLines = servicesText ? doc.splitTextToSize(servicesText, innerW).length : 0;
  const icpLines = icpText ? doc.splitTextToSize(icpText, innerW).length : 0;
  const height = pad * 2 + 4 + (serviceLines ? 4 + serviceLines * 4 : 0) + (icpLines ? 4 + icpLines * 4 : 0);

  // Draw box
  doc.setDrawColor(...colors.LIGHT_GRAY);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, height, 2, 2, "S");

  let cursor = y + pad;

  // "Search brief" label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...colors.GRAY);
  doc.text("SEARCH BRIEF", innerX, cursor + 3);
  cursor += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...colors.BLACK);

  if (serviceLines) {
    doc.text("Services:", innerX, cursor + 3);
    doc.setTextColor(...colors.GRAY);
    const wrapped = doc.splitTextToSize(servicesText, innerW);
    doc.text(wrapped, innerX, cursor + 7);
    cursor += 4 + serviceLines * 4;
  }

  if (icpLines) {
    doc.setTextColor(...colors.BLACK);
    doc.text("ICP:", innerX, cursor + 3);
    doc.setTextColor(...colors.GRAY);
    const wrapped = doc.splitTextToSize(icpText, innerW);
    doc.text(wrapped, innerX, cursor + 7);
    cursor += 4 + icpLines * 4;
  }

  return y + height;
}

/* ────────────────────────────────────────────────────────────────
   Footer with page numbers — added after each page break and
   once more on the final page.
   ──────────────────────────────────────────────────────────────── */

function addFooter(doc, pageW, pageH, margin, grayColor) {
  const total = doc.getNumberOfPages();
  const current = doc.getCurrentPageInfo().pageNumber;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...grayColor);
  doc.text(`Page ${current} of ${total}`, pageW - margin, pageH - 8, {
    align: "right",
  });
  doc.text("Generated by Intent Radar", margin, pageH - 8);
}

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}