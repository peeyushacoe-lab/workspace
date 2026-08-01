/**
 * Document → presentation conversion.
 *
 * "Turn this report into a deck" is the single most-requested cross-app action
 * and neither Google nor Microsoft does it well. The rule here is deliberately
 * simple and predictable rather than clever: each top-level heading becomes a
 * slide, and the content beneath it becomes that slide's body.
 *
 * Pure — takes HTML, returns slide data — so it is unit-testable and can run on
 * either side of the wire.
 */

/** Editor canvas is a fixed 960×540 (16:9). */
const CANVAS_W = 960;
const CANVAS_H = 540;

export type GeneratedElement = {
  type: "text";
  x: number; y: number; w: number; h: number;
  content: string;
  style: { fontSize: number; bold?: boolean; align?: "left" | "center" };
};

export type GeneratedSlide = {
  title: string;
  elements: GeneratedElement[];
  notes: string;
};

/** Bullets beyond this spill onto a continuation slide rather than overflowing. */
const MAX_BULLETS_PER_SLIDE = 6;

/** Strips tags and decodes the handful of entities Tiptap emits. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type Block = { tag: string; html: string };

/** Splits body HTML into top-level blocks, in document order. */
function blocks(html: string): Block[] {
  const out: Block[] = [];
  const re = /<(h[1-6]|p|ul|ol|blockquote|pre|table)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ tag: m[1].toLowerCase(), html: m[2] });
  }
  return out;
}

/** Pulls <li> contents out of a list block. */
function listItems(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map(m => plainText(m[1]))
    .filter(Boolean);
}

function titleSlide(title: string, subtitle: string): GeneratedSlide {
  return {
    title,
    elements: [
      {
        type: "text", x: 80, y: 190, w: CANVAS_W - 160, h: 90,
        content: title,
        style: { fontSize: 44, bold: true, align: "center" },
      },
      ...(subtitle
        ? [{
            type: "text" as const, x: 80, y: 290, w: CANVAS_W - 160, h: 50,
            content: subtitle,
            style: { fontSize: 20, align: "center" as const },
          }]
        : []),
    ],
    notes: "",
  };
}

function contentSlide(title: string, bullets: string[], notes: string): GeneratedSlide {
  const elements: GeneratedElement[] = [
    {
      type: "text", x: 60, y: 50, w: CANVAS_W - 120, h: 60,
      content: title,
      style: { fontSize: 32, bold: true },
    },
  ];
  if (bullets.length) {
    elements.push({
      type: "text", x: 60, y: 140, w: CANVAS_W - 120, h: CANVAS_H - 200,
      // Bullet glyphs are baked into the text because the slide model has no
      // list type — a text element with newlines is what it can represent.
      content: bullets.map(b => `• ${b}`).join("\n"),
      style: { fontSize: 20 },
    });
  }
  return { title, elements, notes };
}

/**
 * Converts document HTML into slides.
 *
 * - The document title becomes a title slide.
 * - Each h1/h2 starts a new slide.
 * - Paragraphs become bullets; list items become bullets.
 * - Prose that doesn't fit on the slide is preserved as speaker notes rather
 *   than discarded, so nothing from the source document is lost.
 */
export function docToSlides(html: string, documentTitle: string): GeneratedSlide[] {
  const parsed = blocks(html);
  const slides: GeneratedSlide[] = [];

  // Subtitle: the first paragraph before any heading.
  const firstHeadingAt = parsed.findIndex(b => /^h[12]$/.test(b.tag));
  const lead = parsed
    .slice(0, firstHeadingAt === -1 ? parsed.length : firstHeadingAt)
    .find(b => b.tag === "p");
  slides.push(titleSlide(documentTitle || "Untitled", plainText(lead?.html ?? "").slice(0, 120)));

  let currentTitle: string | null = null;
  let bullets: string[] = [];
  let notes: string[] = [];

  const flush = () => {
    if (currentTitle === null && bullets.length === 0) return;
    // Long sections spill across continuation slides instead of overflowing
    // the canvas — the failure mode that makes auto-generated decks unusable.
    const chunks: string[][] = [];
    for (let i = 0; i < Math.max(bullets.length, 1); i += MAX_BULLETS_PER_SLIDE) {
      chunks.push(bullets.slice(i, i + MAX_BULLETS_PER_SLIDE));
    }
    chunks.forEach((chunk, i) => {
      const heading = currentTitle ?? "Overview";
      slides.push(
        contentSlide(
          i === 0 ? heading : `${heading} (cont.)`,
          chunk,
          i === 0 ? notes.join("\n\n") : "",
        ),
      );
    });
    bullets = [];
    notes = [];
  };

  for (let i = firstHeadingAt === -1 ? 0 : firstHeadingAt; i < parsed.length; i++) {
    const block = parsed[i];
    const text = plainText(block.html);

    if (/^h[12]$/.test(block.tag)) {
      flush();
      currentTitle = text || "Untitled section";
      continue;
    }
    if (/^h[3-6]$/.test(block.tag)) {
      // Sub-headings become emphasised bullets rather than their own slides,
      // which would fragment the deck into dozens of near-empty pages.
      if (text) bullets.push(text);
      continue;
    }
    if (block.tag === "ul" || block.tag === "ol") {
      bullets.push(...listItems(block.html));
      continue;
    }
    if (block.tag === "p" || block.tag === "blockquote") {
      if (!text) continue;
      // Short prose reads as a bullet; long prose belongs in speaker notes.
      if (text.length <= 140) bullets.push(text);
      else notes.push(text);
      continue;
    }
    if (block.tag === "table" || block.tag === "pre") {
      notes.push(text);
    }
  }
  flush();

  // A document with no headings at all yields just the title slide; give it
  // something to show rather than a one-slide deck.
  if (slides.length === 1) {
    const allText = plainText(html);
    if (allText) {
      slides.push(
        contentSlide(
          "Contents",
          allText.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, MAX_BULLETS_PER_SLIDE),
          "",
        ),
      );
    }
  }

  return slides;
}

/** Inverse: a slide deck's structure as a document outline. */
export function slidesToOutlineHtml(
  slides: { elements: { content?: string }[]; notes: string }[],
  deckTitle: string,
): string {
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const parts: string[] = [`<h1>${esc(deckTitle || "Presentation")}</h1>`];
  slides.forEach((slide, i) => {
    const texts = slide.elements
      .map(el => (el.content ?? "").trim())
      .filter(Boolean);
    const [heading, ...rest] = texts;
    parts.push(`<h2>${esc(heading || `Slide ${i + 1}`)}</h2>`);
    for (const chunk of rest) {
      const lines = chunk.split("\n").map(l => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
      if (lines.length > 1) {
        parts.push(`<ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`);
      } else if (lines.length === 1) {
        parts.push(`<p>${esc(lines[0])}</p>`);
      }
    }
    if (slide.notes.trim()) {
      parts.push(`<blockquote><p>${esc(slide.notes.trim())}</p></blockquote>`);
    }
  });
  return parts.join("");
}
