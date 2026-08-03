/**
 * Extracts card-thumbnail content from a stored document.
 *
 * Docs, Sheets and Slides all persist into `Note.content` but in different
 * shapes — HTML, a workbook JSON, a deck JSON. These turn each into the small
 * preview `<AppHome>` renders, so the file grid shows what a document actually
 * contains rather than an identical placeholder page on every card.
 *
 * Pure and defensive: content can be empty, legacy, or malformed, and a broken
 * preview must never take the home screen down with it.
 */

/** Lines shown on a text-style thumbnail. More than this can't fit. */
const MAX_LINES = 10;
/** Cells shown on a grid-style thumbnail. */
const MAX_ROWS = 8;
const MAX_COLS = 5;

/** Strips tags and decodes the entities Tiptap emits. */
function plainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Document HTML → the first few non-empty lines. */
export function docPreviewLines(content: string): string[] {
  if (!content) return [];
  return plainText(content)
    .split("\n")
    .map(l => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);
}

type StoredSheet = {
  name?: string;
  cells?: Record<string, { v?: string } | undefined>;
};

/**
 * Workbook JSON → a small top-left cell grid.
 *
 * Formulas are shown as-is rather than evaluated: running the formula engine
 * for every card would be a lot of work for a thumbnail, and a cell reading
 * "=SUM(B2:B9)" still tells you what the sheet is about.
 */
export function sheetPreviewCells(content: string): string[][] {
  if (!content) return [];
  try {
    const wb = JSON.parse(content) as { sheets?: StoredSheet[] };
    const first = wb.sheets?.[0];
    if (!first?.cells) return [];

    const rows: string[][] = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      const row: string[] = [];
      let hasValue = false;
      for (let c = 0; c < MAX_COLS; c++) {
        const v = first.cells[`${r}:${c}`]?.v ?? "";
        if (v) hasValue = true;
        // Long values would blow out a 5px-font cell.
        row.push(v.length > 12 ? `${v.slice(0, 12)}…` : v);
      }
      // Stop at the first fully empty row — trailing blanks are just noise.
      if (!hasValue && rows.length) break;
      rows.push(row);
    }
    return rows.some(r => r.some(Boolean)) ? rows : [];
  } catch {
    return [];
  }
}

type StoredSlide = { elements?: { content?: string }[] };

/** Deck JSON → the first slide's text, as preview lines. */
export function slidePreviewLines(content: string): string[] {
  if (!content) return [];
  try {
    const deck = JSON.parse(content) as { slides?: StoredSlide[] };
    const first = deck.slides?.[0];
    if (!first?.elements?.length) return [];
    return first.elements
      .flatMap(el => (el.content ?? "").split("\n"))
      .map(l => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}
