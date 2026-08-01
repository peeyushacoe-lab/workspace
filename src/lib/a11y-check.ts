/**
 * Document accessibility checker.
 *
 * Mirrors the checks in Word's Accessibility Checker and Google Docs'
 * accessibility tools, scoped to what is actually detectable from document
 * content. Rules map to WCAG 2.1 AA success criteria, which is the bar UK
 * (Public Sector Bodies Accessibility Regulations 2018) and EU (EN 301 549 /
 * European Accessibility Act) procurement asks for.
 *
 * Pure and DOM-optional: takes an HTML string, returns findings. That keeps it
 * unit-testable and usable server-side for bulk auditing later.
 */

export type A11ySeverity = "error" | "warning" | "info";

export type A11yIssue = {
  id: string;
  severity: A11ySeverity;
  /** Short label shown in the panel. */
  title: string;
  /** What's wrong and why it matters, in plain language. */
  detail: string;
  /** WCAG success criterion, e.g. "1.1.1". */
  wcag: string;
  /** How to fix it. */
  fix: string;
  /** Offending element's text/snippet, for locating it. */
  context?: string;
};

export type A11yReport = {
  issues: A11yIssue[];
  errors: number;
  warnings: number;
  /** 0–100. 100 means no errors or warnings found. */
  score: number;
  checked: number;
};

let seq = 0;
const nextId = () => `a11y_${++seq}`;

/** Link text that conveys nothing out of context (screen readers list links alone). */
const VAGUE_LINK_TEXT = new Set([
  "click here", "here", "link", "read more", "more", "this", "this link",
  "learn more", "see more", "details", "download", "go", "continue",
]);

function textOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function snippet(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Runs every rule against a document body.
 * `doc` is any Document — in the browser, from DOMParser.
 */
export function checkAccessibility(html: string, doc: Document): A11yReport {
  seq = 0;
  const root = doc.createElement("div");
  root.innerHTML = html;

  const issues: A11yIssue[] = [];
  let checked = 0;

  // ── 1.1.1 Non-text content: images need alt text ────────────────────────
  const images = Array.from(root.querySelectorAll("img"));
  checked += images.length;
  for (const img of images) {
    const alt = img.getAttribute("alt");
    if (alt === null) {
      issues.push({
        id: nextId(), severity: "error", wcag: "1.1.1",
        title: "Image missing alternative text",
        detail: "Screen readers announce this image as \"image\" with no description, so its meaning is lost.",
        fix: "Select the image and add alt text describing what it conveys. If it is purely decorative, set alt to empty.",
        context: img.getAttribute("src")?.slice(0, 40),
      });
    } else if (alt.trim() && /^(image|picture|photo|img|screenshot)\s*\d*$/i.test(alt.trim())) {
      issues.push({
        id: nextId(), severity: "warning", wcag: "1.1.1",
        title: "Unhelpful alternative text",
        detail: `Alt text "${alt}" repeats that it is an image without describing it.`,
        fix: "Describe what the image shows or what information it carries.",
        context: alt,
      });
    }
  }

  // ── 1.3.1 Info and relationships: heading order ─────────────────────────
  const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  checked += headings.length;
  let previousLevel = 0;
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    if (previousLevel && level > previousLevel + 1) {
      issues.push({
        id: nextId(), severity: "warning", wcag: "1.3.1",
        title: `Heading level skipped (H${previousLevel} → H${level})`,
        detail: "Screen-reader users navigate by heading level. Skipping levels makes the document structure misleading.",
        fix: `Change this to a Heading ${previousLevel + 1}, or add the missing intermediate heading.`,
        context: snippet(textOf(h)),
      });
    }
    if (!textOf(h)) {
      issues.push({
        id: nextId(), severity: "warning", wcag: "1.3.1",
        title: "Empty heading",
        detail: "An empty heading is announced with no content and clutters the navigation list.",
        fix: "Add text to the heading or convert it to normal text.",
      });
    }
    previousLevel = level;
  }

  // Long document with no headings at all — unnavigable.
  const wordCount = textOf(root).split(/\s+/).filter(Boolean).length;
  if (wordCount > 300 && headings.length === 0) {
    issues.push({
      id: nextId(), severity: "warning", wcag: "1.3.1",
      title: "No headings in a long document",
      detail: `This document has about ${wordCount} words and no headings, so there is no way to navigate it by structure.`,
      fix: "Add headings to break the document into sections.",
    });
  }

  // ── 1.3.1 Tables need header cells ──────────────────────────────────────
  const tables = Array.from(root.querySelectorAll("table"));
  checked += tables.length;
  for (const table of tables) {
    if (table.querySelectorAll("th").length === 0) {
      issues.push({
        id: nextId(), severity: "error", wcag: "1.3.1",
        title: "Table has no header row",
        detail: "Without header cells a screen reader cannot say which column a value belongs to, so the table is read as a flat list of numbers.",
        fix: "Mark the first row as a header row.",
        context: snippet(textOf(table), 40),
      });
    }
    // Merged cells make linear reading order ambiguous.
    const merged = table.querySelectorAll("[colspan]:not([colspan='1']), [rowspan]:not([rowspan='1'])");
    if (merged.length) {
      issues.push({
        id: nextId(), severity: "info", wcag: "1.3.1",
        title: "Table contains merged cells",
        detail: "Merged cells can be read in a confusing order by assistive technology.",
        fix: "Prefer a simple grid, or split the table into several simpler ones.",
      });
    }
  }

  // ── 2.4.4 Link purpose ──────────────────────────────────────────────────
  const links = Array.from(root.querySelectorAll("a[href]"));
  checked += links.length;
  for (const a of links) {
    const label = textOf(a);
    if (!label) {
      issues.push({
        id: nextId(), severity: "error", wcag: "2.4.4",
        title: "Link has no text",
        detail: "A link with no text is announced only as its URL, which is often unreadable.",
        fix: "Give the link descriptive text.",
        context: a.getAttribute("href")?.slice(0, 50),
      });
    } else if (VAGUE_LINK_TEXT.has(label.toLowerCase())) {
      issues.push({
        id: nextId(), severity: "warning", wcag: "2.4.4",
        title: `Uninformative link text: "${label}"`,
        detail: "Screen-reader users often browse a list of links out of context, where \"click here\" means nothing.",
        fix: "Rewrite the link text to describe its destination, e.g. \"Read the Q3 security report\".",
        context: a.getAttribute("href")?.slice(0, 50),
      });
    } else if (/^https?:\/\//i.test(label) && label.length > 40) {
      issues.push({
        id: nextId(), severity: "info", wcag: "2.4.4",
        title: "Raw URL used as link text",
        detail: "Long URLs are read out character by character by some screen readers.",
        fix: "Replace the URL with descriptive text.",
        context: snippet(label),
      });
    }
  }

  // ── 1.4.1 Use of colour ─────────────────────────────────────────────────
  // Text that is coloured but carries no other distinguishing mark relies on
  // colour alone to convey meaning.
  const coloured = Array.from(root.querySelectorAll('[style*="color"]'));
  const colourOnly = coloured.filter(el => {
    const style = el.getAttribute("style") ?? "";
    if (!/(^|;)\s*color\s*:/i.test(style)) return false;
    const hasOtherCue =
      el.querySelector("strong,b,em,i,u") !== null ||
      /font-weight\s*:\s*(bold|[6-9]00)/i.test(style) ||
      /text-decoration/i.test(style);
    return !hasOtherCue && textOf(el).length > 0;
  });
  if (colourOnly.length > 2) {
    issues.push({
      id: nextId(), severity: "info", wcag: "1.4.1",
      title: "Meaning may rely on colour alone",
      detail: `${colourOnly.length} passages are distinguished only by text colour. Readers with colour blindness, or anyone printing in greyscale, will not see the distinction.`,
      fix: "Pair colour with bold, italics, or an explicit label.",
    });
  }

  // ── 3.1.1 Language of page ──────────────────────────────────────────────
  // Not detectable from content alone; surfaced as info so authors set it.
  if (wordCount > 100) {
    issues.push({
      id: nextId(), severity: "info", wcag: "3.1.1",
      title: "Set the document language",
      detail: "Declaring the language lets screen readers choose the correct pronunciation rules.",
      fix: "Set the document language in document properties.",
    });
  }

  const errors = issues.filter(i => i.severity === "error").length;
  const warnings = issues.filter(i => i.severity === "warning").length;

  // Errors weigh triple; a document with none scores 100.
  const penalty = errors * 15 + warnings * 5;
  const score = Math.max(0, 100 - penalty);

  return { issues, errors, warnings, score, checked };
}

/** One-line summary for the toolbar badge. */
export function summarise(report: A11yReport): string {
  if (report.errors === 0 && report.warnings === 0) return "No accessibility issues found";
  const parts: string[] = [];
  if (report.errors) parts.push(`${report.errors} error${report.errors === 1 ? "" : "s"}`);
  if (report.warnings) parts.push(`${report.warnings} warning${report.warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}
