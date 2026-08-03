/**
 * Real PDF export for Sage Docs, Sheets and Slides.
 *
 * Distinct from Print / Save as PDF, and both are worth having:
 *
 *   Print  — the browser renders it, so every webfont, colour and CSS nicety
 *            survives, but the user has to drive a print dialog and the result
 *            depends on their browser and paper settings.
 *   Export — this file. Produces a real .pdf byte-for-byte identical for
 *            everyone, downloadable in one click, generated with no dialog.
 *            The trade is fidelity: pdf-lib draws primitives, not HTML.
 *
 * ── The StandardFonts trade-off ────────────────────────────────────────────
 * We use pdf-lib's built-in fonts, which means the 26 document fonts do NOT
 * carry into an exported PDF — a Lora document exports as Times. Embedding the
 * real face needs @pdf-lib/fontkit plus shipping the woff2/ttf bytes to the
 * client for every family, which is megabytes for a feature most people use
 * once. Print keeps full fidelity; this keeps the file small and instant.
 * If that trade stops being right, fontkit is the upgrade path.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/* ── Page geometry (PDF points; 72pt = 1in) ─────────────────────────────── */
const A4_PORTRAIT = { w: 595.28, h: 841.89 };
const A4_LANDSCAPE = { w: 841.89, h: 595.28 };
const MARGIN = 48;

/** Atrium ink, as literal values — pdf-lib cannot read CSS variables. */
const INK = rgb(0.102, 0.102, 0.094);
const MUTED = rgb(0.42, 0.416, 0.396);
const HAIRLINE = rgb(0.788, 0.78, 0.753);
const WELL = rgb(0.937, 0.933, 0.914);

/**
 * pdf-lib's standard fonts are WinAnsi-encoded and *throw* on any character
 * outside that set — a single emoji or CJK glyph in a document would fail the
 * whole export with a stack trace. Substituting is the lesser evil, and the
 * common typographic characters are mapped rather than dropped so quotes and
 * dashes survive.
 */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–]/g, "-")
    .replace(/[—]/g, "--")
    .replace(/[…]/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[•]/g, "·")
    // Anything still outside Latin-1 becomes "?" rather than exploding.
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, "?");
}

/** Greedy word wrap against real glyph widths, not a character count. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        // A single word wider than the column (a long URL) still has to land
        // somewhere; let it overhang rather than loop forever.
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function drawFooter(page: PDFPage, font: PDFFont, label: string, n: number) {
  page.drawText(toWinAnsi(label), { x: MARGIN, y: 24, size: 8, font, color: MUTED });
  const num = String(n);
  page.drawText(num, {
    x: page.getWidth() - MARGIN - font.widthOfTextAtSize(num, 8),
    y: 24, size: 8, font, color: MUTED,
  });
}

/* ── Docs ───────────────────────────────────────────────────────────────── */

export type DocBlock = { text: string; level: 0 | 1 | 2 | 3; bold?: boolean };

/**
 * Turn editor HTML into flat blocks. Deliberately shallow: headings, list
 * items and paragraphs. Tables and images are dropped, which is exactly why
 * Print still exists alongside this.
 */
export function htmlToBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const re = /<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const text = m[2]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .trim();
    if (!text) continue;
    const level = tag === "h1" ? 1 : tag === "h2" ? 2 : tag === "h3" ? 3 : 0;
    blocks.push({ text: tag === "li" ? `· ${text}` : text, level: level as 0 | 1 | 2 | 3 });
  }
  return blocks;
}

export async function docToPdf(title: string, html: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const body = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const { w, h } = A4_PORTRAIT;
  const colWidth = w - MARGIN * 2;
  let page = pdf.addPage([w, h]);
  let y = h - MARGIN;
  let pageNo = 1;

  const newPage = () => {
    drawFooter(page, body, title, pageNo);
    page = pdf.addPage([w, h]);
    pageNo += 1;
    y = h - MARGIN;
  };

  for (const block of htmlToBlocks(html)) {
    const size = block.level === 1 ? 22 : block.level === 2 ? 17 : block.level === 3 ? 14 : 11;
    const font = block.level > 0 || block.bold ? bold : body;
    const leading = size * 1.5;
    if (block.level > 0) y -= size * 0.6;

    for (const line of wrap(toWinAnsi(block.text), font, size, colWidth)) {
      if (y - leading < MARGIN + 24) newPage();
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color: INK });
      y -= leading;
    }
    y -= size * 0.4;
  }
  drawFooter(page, body, title, pageNo);
  return pdf.save();
}

/* ── Sheets ─────────────────────────────────────────────────────────────── */

export async function sheetToPdf(
  title: string, sheetName: string, columns: string[], rows: string[][],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} — ${sheetName}`);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { w, h } = A4_LANDSCAPE;
  const colCount = Math.max(columns.length, 1);
  const colWidth = (w - MARGIN * 2) / colCount;
  const rowHeight = 16;
  const size = 8;

  let page = pdf.addPage([w, h]);
  let pageNo = 1;
  let y = h - MARGIN - 28;

  page.drawText(toWinAnsi(title), { x: MARGIN, y: h - MARGIN, size: 14, font: bold, color: INK });
  page.drawText(toWinAnsi(sheetName), { x: MARGIN, y: h - MARGIN - 14, size: 8, font: body, color: MUTED });

  /** The header band is redrawn on every page — a table whose columns are only
   *  labelled on page one is unreadable by page four. */
  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - rowHeight, width: w - MARGIN * 2, height: rowHeight, color: WELL });
    columns.forEach((c, i) => {
      page.drawText(toWinAnsi(c).slice(0, 24), {
        x: MARGIN + i * colWidth + 4, y: y - rowHeight + 5, size, font: bold, color: INK,
      });
    });
    y -= rowHeight;
  };
  drawHeader();

  for (const row of rows) {
    if (y - rowHeight < MARGIN + 24) {
      drawFooter(page, body, `${title} — ${sheetName}`, pageNo);
      page = pdf.addPage([w, h]);
      pageNo += 1;
      y = h - MARGIN;
      drawHeader();
    }
    for (let i = 0; i < colCount; i++) {
      const cell = toWinAnsi(row[i] ?? "");
      if (!cell) continue;
      // Clip rather than wrap: a spreadsheet row that grows to three lines
      // stops looking like a spreadsheet.
      let text = cell;
      while (text && body.widthOfTextAtSize(text, size) > colWidth - 8) text = text.slice(0, -1);
      page.drawText(text, { x: MARGIN + i * colWidth + 4, y: y - rowHeight + 5, size, font: body, color: INK });
    }
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight },
      end: { x: w - MARGIN, y: y - rowHeight },
      thickness: 0.4, color: HAIRLINE,
    });
    y -= rowHeight;
  }
  drawFooter(page, body, `${title} — ${sheetName}`, pageNo);
  return pdf.save();
}

/* ── Slides ─────────────────────────────────────────────────────────────── */

export type PdfSlide = { title?: string; lines: string[]; notes?: string };

export async function deckToPdf(title: string, slides: PdfSlide[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // 16:9 at 720×405pt — the same shape as the slide, so nothing is letterboxed.
  const w = 720, h = 405;

  slides.forEach((slide, i) => {
    const page = pdf.addPage([w, h]);
    let y = h - 56;

    if (slide.title) {
      for (const line of wrap(toWinAnsi(slide.title), bold, 24, w - 96)) {
        page.drawText(line, { x: 48, y: y - 24, size: 24, font: bold, color: INK });
        y -= 32;
      }
      page.drawLine({ start: { x: 48, y: y - 6 }, end: { x: 108, y: y - 6 }, thickness: 2, color: MUTED });
      y -= 24;
    }
    for (const raw of slide.lines) {
      for (const line of wrap(toWinAnsi(raw), body, 13, w - 96)) {
        if (y < 48) break;
        page.drawText(line, { x: 48, y: y - 13, size: 13, font: body, color: INK });
        y -= 20;
      }
    }
    drawFooter(page, body, title, i + 1);
  });

  return pdf.save();
}

/* ── Download ───────────────────────────────────────────────────────────── */

export function downloadPdf(bytes: Uint8Array, filename: string) {
  // Copy into a fresh ArrayBuffer: pdf-lib may hand back a view over a larger
  // pooled buffer, and Blob would then include the slack bytes.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.click();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in Safari before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
