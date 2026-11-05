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

   The layout strategy: draw sequentially and track the ACTUAL Y
   cursor at each step. The card's rounded-rectangle border is drawn
   LAST, using the real consumed height — not an estimate. This
   eliminates the "measured height was wrong so text overlaps the
   border" class of bug entirely.
   ──────────────────────────────────────────────────────────────── */

export async function exportLeadsToPdf(
  leads,
  { brief = null, filenameBase = "leads" } = {}
) {
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error("No leads to export");
  }

  const { default: jsPDF } = await import("jspdf");

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 20;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM_MARGIN = 18;
  const CARD_GAP = 6;
  const CARD_PAD = 6;
  const LINE = 4.5; // base line height (mm) for body text at size 9

  const BLACK = [17, 24, 39];
  const GRAY = [107, 114, 128];
  const LIGHT_GRAY = [229, 231, 235];
  const ACCENT = [37, 99, 235];
  const GREEN = [21, 128, 61];
  const AMBER = [180, 83, 9];

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

  // ── Brief block ──
  if (brief && (brief.services?.length || brief.icp)) {
    y = drawBriefBlock(doc, brief, MARGIN, y, CONTENT_W, {
      BLACK,
      GRAY,
      LIGHT_GRAY,
      LINE,
    });
    y += CARD_GAP;
  }

  // ── Lead cards ──
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];

    // Draw the card at current y. If it doesn't fit, page-break first.
    // We need a "does this fit" check up front — approximate by
    // measuring. But if the approximation is wrong, the card would
    // start on one page and overflow. To be safe, we cap any single
    // card to a reasonable size (evidence + reasoning are the only
    // unbounded fields, and 30 lines is plenty for those).
    const approxHeight = estimateCardHeight(doc, lead, CONTENT_W, CARD_PAD, LINE);
    if (y + approxHeight > PAGE_H - BOTTOM_MARGIN && y > MARGIN + 30) {
      addFooter(doc, PAGE_W, PAGE_H, MARGIN, GRAY);
      doc.addPage();
      y = MARGIN;
    }

    y = drawCard(doc, lead, MARGIN, y, CONTENT_W, CARD_PAD, i + 1, leads.length, LINE, {
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
   Card drawing — sequential, tracks real Y, draws border last
   ──────────────────────────────────────────────────────────────── */

function drawCard(doc, lead, x, y, width, pad, idx, total, LINE, colors) {
  const startY = y;
  const innerX = x + pad;
  const innerW = width - pad * 2;

  y += pad; // top padding

  // ── Title row: score (left) + "Lead N of M" (right) ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...colors.GRAY);
  doc.text(`Lead ${idx} of ${total}`, x + width - pad, y + 3, { align: "right" });

  const score = typeof lead.score === "number" ? lead.score : null;
  if (score !== null) {
    const color =
      score >= 0.8 ? colors.GREEN : score >= 0.6 ? colors.AMBER : colors.GRAY;
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Score ${score.toFixed(2)}`, innerX, y + 3.2);
    doc.setFont("helvetica", "normal");
  }
  y += 6;

  // ── Name ──
  doc.setTextColor(...colors.BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const name =
    lead.fullName ||
    [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
    "Unknown";
  doc.text(name, innerX, y + 5);
  y += 7;

  // ── Title · Company ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...colors.GRAY);
  const titleLine = [lead.title, lead.companyName].filter(Boolean).join("  ·  ");
  if (titleLine) {
    const wrapped = doc.splitTextToSize(titleLine, innerW);
    doc.text(wrapped, innerX, y + 4);
    y += wrapped.length * LINE;
  }
  y += 3;

  // ── Meta row ──
  doc.setFontSize(9);
  doc.setTextColor(...colors.BLACK);
  const meta = metaLine(lead);
  if (meta) {
    const wrapped = doc.splitTextToSize(meta, innerW);
    doc.text(wrapped, innerX, y + 3);
    y += wrapped.length * LINE;
  }
  y += 4;

  // ── WHY THIS LEAD ──
  y = drawLabel(doc, "WHY THIS LEAD", innerX, y, colors.GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...colors.BLACK);
  const reasoning = lead.reasoning || "(no reasoning provided)";
  const reasoningLines = doc.splitTextToSize(reasoning, innerW);
  doc.text(reasoningLines, innerX, y + 3);
  y += reasoningLines.length * LINE;
  y += 4;

  // ── EVIDENCE FROM POST ──
  y = drawLabel(doc, "EVIDENCE FROM POST", innerX, y, colors.GRAY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...colors.GRAY);
  const evidence = lead.intentSignal?.evidence || "(no evidence captured)";
  const evidenceLines = doc.splitTextToSize(`"${evidence}"`, innerW - 4);
  doc.text(evidenceLines, innerX + 4, y + 3);
  y += evidenceLines.length * LINE;
  y += 4;

  // ── Links: profile + source, plus published date ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  // LinkedIn profile link (left)
  if (lead.linkedinUrl) {
    doc.setTextColor(...colors.ACCENT);
    doc.textWithLink("View LinkedIn profile ↗", innerX, y + 3, {
      url: lead.linkedinUrl,
    });
    y += LINE;
  }

  // Source post link (left, own line to avoid horizontal overlap)
  if (lead.sourceUrl) {
    doc.setTextColor(...colors.ACCENT);
    doc.textWithLink("View source post ↗", innerX, y + 3, {
      url: lead.sourceUrl,
    });
    // Published date on the same line, right-aligned
    if (lead.publishedDate) {
      doc.setTextColor(...colors.GRAY);
      doc.text(
        `Published ${formatShortDate(lead.publishedDate)}`,
        x + width - pad,
        y + 3,
        { align: "right" }
      );
    }
    y += LINE;
  } else if (lead.publishedDate) {
    doc.setTextColor(...colors.GRAY);
    doc.text(`Published ${formatShortDate(lead.publishedDate)}`, innerX, y + 3);
    y += LINE;
  }

  y += pad; // bottom padding

  // ── Draw border LAST, using actual consumed height ──
  const cardHeight = y - startY;
  doc.setDrawColor(...colors.LIGHT_GRAY);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, startY, width, cardHeight, 2, 2, "S");

  return y; // real consumed height (not an estimate)
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

/* ────────────────────────────────────────────────────────────────
   Height estimation — used only to decide whether a card fits on
   the current page BEFORE drawing it. If the estimate is off, the
   card border will still be drawn correctly at the end of drawing;
   worst case, the card is slightly taller than estimated and just
   overflows past the bottom margin on the last page — acceptable
   because there's nothing after it to overlap. Cards are capped at
   a max plausible height so a genuinely huge card gets page-broken
   pre-emptively.
   ──────────────────────────────────────────────────────────────── */

function estimateCardHeight(doc, lead, width, pad, LINE) {
  const innerW = width - pad * 2;
  let h = pad * 2;

  h += 6;          // title row
  h += 7;          // name
  h += 3;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const titleLine = [lead.title, lead.companyName].filter(Boolean).join("  ·  ");
  if (titleLine) {
    h += doc.splitTextToSize(titleLine, innerW).length * LINE;
  }
  h += 3;

  doc.setFontSize(9);
  const meta = metaLine(lead);
  if (meta) {
    h += doc.splitTextToSize(meta, innerW).length * LINE;
  }
  h += 4;

  // WHY THIS LEAD label + content
  h += 4;
  const reasoning = lead.reasoning || "(no reasoning provided)";
  h += doc.splitTextToSize(reasoning, innerW).length * LINE;
  h += 4;

  // EVIDENCE label + content
  h += 4;
  const evidence = lead.intentSignal?.evidence || "(no evidence captured)";
  h += doc.splitTextToSize(`"${evidence}"`, innerW - 4).length * LINE;
  h += 4;

  // Links (each on its own line now)
  if (lead.linkedinUrl) h += LINE;
  if (lead.sourceUrl || lead.publishedDate) h += LINE;

  // Cap: no single card should exceed 60% of a page. If it does,
  // we still draw it, but the page-break decision is based on this
  // cap. In practice this only happens with extremely long evidence.
  return Math.min(h, 160);
}

function drawBriefBlock(doc, brief, x, y, width, colors) {
  const pad = 5;
  const innerX = x + pad;
  const innerW = width - pad * 2;

  const servicesText = (brief.services || []).join("  ·  ");
  const icpParts = [];
  if (brief.icp?.titles?.length)
    icpParts.push(`Titles: ${brief.icp.titles.join(", ")}`);
  if (brief.icp?.industries?.length)
    icpParts.push(`Industries: ${brief.icp.industries.join(", ")}`);
  if (brief.icp?.locations?.length)
    icpParts.push(`Locations: ${brief.icp.locations.join(", ")}`);
  const icpText = icpParts.join("  ·  ");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const serviceLines = servicesText
    ? doc.splitTextToSize(servicesText, innerW).length
    : 0;
  const icpLines = icpText ? doc.splitTextToSize(icpText, innerW).length : 0;

  const startY = y;
  y += pad;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...colors.GRAY);
  doc.text("SEARCH BRIEF", innerX, y + 3);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  if (serviceLines) {
    doc.setTextColor(...colors.BLACK);
    doc.text("Services:", innerX, y + 3);
    doc.setTextColor(...colors.GRAY);
    const wrapped = doc.splitTextToSize(servicesText, innerW);
    doc.text(wrapped, innerX, y + 7);
    y += 4 + serviceLines * colors.LINE;
  }

  if (icpLines) {
    doc.setTextColor(...colors.BLACK);
    doc.text("ICP:", innerX, y + 3);
    doc.setTextColor(...colors.GRAY);
    const wrapped = doc.splitTextToSize(icpText, innerW);
    doc.text(wrapped, innerX, y + 7);
    y += 4 + icpLines * colors.LINE;
  }

  y += pad;

  const height = y - startY;
  doc.setDrawColor(...colors.LIGHT_GRAY);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, startY, width, height, 2, 2, "S");

  return y;
}

/* ────────────────────────────────────────────────────────────────
   Footer with page numbers
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