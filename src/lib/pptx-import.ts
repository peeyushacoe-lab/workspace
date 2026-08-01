"use client";

/**
 * .pptx → Nexus slide model.
 *
 * A .pptx is a zip of OOXML parts. This unpacks it with JSZip (already a
 * dependency) and reads the shape tree of each slide, mapping text boxes,
 * pictures, tables and autoshapes onto the editor's `Slide` / `SlideElement`
 * types.
 *
 * Replaces the previous stub, which acknowledged the file and then just added a
 * blank slide.
 *
 * Scope: text (with per-run bold/italic/underline/size/colour), positions and
 * sizes, solid fills, pictures, tables, speaker notes and slide order. NOT
 * handled — animations, transitions, SmartArt, charts and embedded media are
 * dropped rather than approximated, and theme-inherited placeholder styling
 * falls back to sensible defaults.
 */

/** OOXML measures in English Metric Units: 914400 EMU = 1 inch. */
const EMU_PER_INCH = 914400;

/** Editor canvas is a fixed 960×540 (16:9) — see CANVAS_W/CANVAS_H in SlidesEditor. */
const CANVAS_W = 960;
const CANVAS_H = 540;

/** Default PowerPoint 16:9 deck is 13.333in × 7.5in. */
const DEFAULT_DECK_W_EMU = 12192000;
const DEFAULT_DECK_H_EMU = 6858000;

export type ImportedElementStyle = {
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  bg?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
};

export type ImportedElement = {
  id: string;
  type: "text" | "shape" | "image" | "table";
  x: number; y: number; w: number; h: number;
  content?: string;
  src?: string;
  shapeType?: "rect" | "circle" | "triangle" | "arrow" | "star" | "line";
  tableRows?: string[][];
  style?: ImportedElementStyle;
  zIndex?: number;
};

export type ImportedSlide = {
  background: string;
  elements: ImportedElement[];
  notes: string;
};

let uid = 0;
const nextId = () => `el_${Date.now()}_${uid++}`;

/** Natural sort so slide10 comes after slide9, not after slide1. */
function slideNumber(path: string): number {
  const m = /slide(\d+)\.xml$/.exec(path);
  return m ? parseInt(m[1], 10) : 0;
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

/** Namespace-agnostic tag lookup — .pptx files vary in prefix usage. */
function findAll(root: Element | Document, localName: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter(
    el => el.localName === localName,
  );
}

function findFirst(root: Element | Document, localName: string): Element | null {
  return findAll(root, localName)[0] ?? null;
}

/** Direct children only — needed to avoid descending into nested shape trees. */
function childrenNamed(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter(el => el.localName === localName);
}

function emuToPx(emu: number, deckEmu: number, canvasPx: number): number {
  return Math.round((emu / deckEmu) * canvasPx);
}

type Deck = { wEmu: number; hEmu: number };

/** Position + size from a shape's <a:xfrm>, clamped to the canvas. */
function geometry(sp: Element, deck: Deck): { x: number; y: number; w: number; h: number } | null {
  const xfrm = findFirst(sp, "xfrm");
  if (!xfrm) return null;
  const off = findFirst(xfrm, "off");
  const ext = findFirst(xfrm, "ext");
  if (!off || !ext) return null;

  const x = emuToPx(Number(off.getAttribute("x") ?? 0), deck.wEmu, CANVAS_W);
  const y = emuToPx(Number(off.getAttribute("y") ?? 0), deck.hEmu, CANVAS_H);
  const w = emuToPx(Number(ext.getAttribute("cx") ?? 0), deck.wEmu, CANVAS_W);
  const h = emuToPx(Number(ext.getAttribute("cy") ?? 0), deck.hEmu, CANVAS_H);

  return {
    x: Math.max(0, Math.min(x, CANVAS_W - 20)),
    y: Math.max(0, Math.min(y, CANVAS_H - 20)),
    w: Math.max(20, Math.min(w, CANVAS_W)),
    h: Math.max(16, Math.min(h, CANVAS_H)),
  };
}

/** Solid fill colour of a shape, as "#rrggbb", if it has one. */
function solidFill(sp: Element): string | undefined {
  const spPr = findFirst(sp, "spPr");
  if (!spPr) return undefined;
  const fill = childrenNamed(spPr, "solidFill")[0];
  if (!fill) return undefined;
  const srgb = findFirst(fill, "srgbClr");
  const val = srgb?.getAttribute("val");
  return val ? `#${val.toLowerCase()}` : undefined;
}

/**
 * Text content of a shape, plus the formatting of its first run.
 *
 * Per-run formatting is flattened deliberately: the editor's SlideElement holds
 * one style for the whole box, so mixed formatting inside a paragraph cannot be
 * represented. Taking the first run keeps titles bold and body text plain,
 * which matches the common case.
 */
function textOf(sp: Element): { text: string; style: ImportedElementStyle } | null {
  const txBody = findFirst(sp, "txBody");
  if (!txBody) return null;

  const paragraphs = findAll(txBody, "p");
  const lines: string[] = [];
  let style: ImportedElementStyle | null = null;

  for (const p of paragraphs) {
    const runs = findAll(p, "r");
    const line = runs
      .map(r => findFirst(r, "t")?.textContent ?? "")
      .join("");
    lines.push(line);

    if (!style && runs.length) {
      const rPr = findFirst(runs[0], "rPr");
      const srgb = rPr ? findFirst(rPr, "srgbClr") : null;
      // PowerPoint stores font size in hundredths of a point.
      const sz = rPr?.getAttribute("sz");
      style = {
        bold: rPr?.getAttribute("b") === "1",
        italic: rPr?.getAttribute("i") === "1",
        underline: !!rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none",
        ...(sz ? { fontSize: Math.round(Number(sz) / 100) } : {}),
        ...(srgb?.getAttribute("val") ? { color: `#${srgb.getAttribute("val")!.toLowerCase()}` } : {}),
      };
    }

    const pPr = findFirst(p, "pPr");
    const algn = pPr?.getAttribute("algn");
    if (style && algn) {
      style.align = algn === "ctr" ? "center" : algn === "r" ? "right" : "left";
    }
  }

  const text = lines.join("\n").trim();
  if (!text) return null;
  return { text, style: style ?? {} };
}

/** Maps a PowerPoint preset geometry onto the editor's small shape vocabulary. */
function shapeKind(sp: Element): ImportedElement["shapeType"] {
  const prst = findFirst(sp, "prstGeom")?.getAttribute("prst") ?? "rect";
  if (/ellipse|circle/i.test(prst)) return "circle";
  if (/triangle/i.test(prst)) return "triangle";
  if (/arrow/i.test(prst)) return "arrow";
  if (/star/i.test(prst)) return "star";
  if (/line/i.test(prst)) return "line";
  return "rect";
}

function tableOf(graphicFrame: Element): string[][] | null {
  const tbl = findFirst(graphicFrame, "tbl");
  if (!tbl) return null;
  const rows = findAll(tbl, "tr");
  if (!rows.length) return null;

  return rows.map(tr =>
    findAll(tr, "tc").map(tc => {
      const texts = findAll(tc, "t").map(t => t.textContent ?? "");
      return texts.join("").trim();
    }),
  );
}

/**
 * Parses a .pptx File into slides ready to merge into the editor.
 * Throws if the file isn't a readable presentation.
 */
export async function parsePptx(file: File): Promise<ImportedSlide[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // ── Deck dimensions ──────────────────────────────────────────────────────
  let deck: Deck = { wEmu: DEFAULT_DECK_W_EMU, hEmu: DEFAULT_DECK_H_EMU };
  const presFile = zip.file("ppt/presentation.xml");
  if (presFile) {
    const sldSz = findFirst(parseXml(await presFile.async("string")), "sldSz");
    const cx = Number(sldSz?.getAttribute("cx") ?? 0);
    const cy = Number(sldSz?.getAttribute("cy") ?? 0);
    if (cx > 0 && cy > 0) deck = { wEmu: cx, hEmu: cy };
  }

  // ── Slide parts, in deck order ───────────────────────────────────────────
  const slidePaths = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!slidePaths.length) {
    throw new Error("No slides found — is this a valid .pptx file?");
  }

  const slides: ImportedSlide[] = [];

  for (const path of slidePaths) {
    const num = slideNumber(path);
    const xml = parseXml(await zip.file(path)!.async("string"));

    // Image relationships for this slide.
    const relsPath = `ppt/slides/_rels/slide${num}.xml.rels`;
    const relTargets = new Map<string, string>();
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      for (const rel of findAll(parseXml(await relsFile.async("string")), "Relationship")) {
        const id = rel.getAttribute("Id");
        const target = rel.getAttribute("Target");
        if (id && target) relTargets.set(id, target);
      }
    }

    const elements: ImportedElement[] = [];
    let z = 1;

    const spTree = findFirst(xml, "spTree");
    if (spTree) {
      for (const node of Array.from(spTree.children)) {
        const local = node.localName;

        // ── Picture ────────────────────────────────────────────────────────
        if (local === "pic") {
          const geo = geometry(node, deck);
          const embed = findFirst(node, "blip")?.getAttribute("r:embed")
            ?? findFirst(node, "blip")?.getAttributeNS(
              "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed",
            );
          if (!geo || !embed) continue;

          const target = relTargets.get(embed);
          if (!target) continue;
          // Relationship targets are relative to ppt/slides/.
          const mediaPath = `ppt/${target.replace(/^\.\.\//, "")}`;
          const mediaFile = zip.file(mediaPath);
          if (!mediaFile) continue;

          const ext = (mediaPath.split(".").pop() ?? "png").toLowerCase();
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
            : ext === "gif" ? "image/gif"
            : ext === "svg" ? "image/svg+xml"
            : "image/png";
          const base64 = await mediaFile.async("base64");

          elements.push({
            id: nextId(), type: "image", ...geo,
            src: `data:${mime};base64,${base64}`,
            zIndex: z++,
          });
          continue;
        }

        // ── Table ──────────────────────────────────────────────────────────
        if (local === "graphicFrame") {
          const rows = tableOf(node);
          const geo = geometry(node, deck);
          if (rows && geo) {
            elements.push({ id: nextId(), type: "table", ...geo, tableRows: rows, zIndex: z++ });
          }
          continue;
        }

        // ── Shape (text box or autoshape) ──────────────────────────────────
        if (local === "sp") {
          const geo = geometry(node, deck);
          if (!geo) continue;
          const text = textOf(node);
          const fill = solidFill(node);

          if (text) {
            elements.push({
              id: nextId(), type: "text", ...geo,
              content: text.text,
              style: { ...text.style, ...(fill ? { bg: fill } : {}) },
              zIndex: z++,
            });
          } else if (fill) {
            // No text — treat as a decorative shape rather than dropping it.
            elements.push({
              id: nextId(), type: "shape", ...geo,
              shapeType: shapeKind(node),
              style: { bg: fill },
              zIndex: z++,
            });
          }
          continue;
        }
      }
    }

    // ── Speaker notes ────────────────────────────────────────────────────────
    let notes = "";
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${num}.xml`);
    if (notesFile) {
      const notesXml = parseXml(await notesFile.async("string"));
      notes = findAll(notesXml, "p")
        .map(p => findAll(p, "t").map(t => t.textContent ?? "").join(""))
        .join("\n")
        .trim();
      // PowerPoint puts the slide-number placeholder in the notes part too;
      // a notes body that is just the slide number is noise.
      if (notes === String(num)) notes = "";
    }

    // Background: reuse the largest full-bleed solid shape if there is one,
    // otherwise white. Theme backgrounds aren't resolved (they live in the
    // master/theme parts and would need full inheritance).
    const bgEl = elements.find(
      e => e.type === "shape" && e.x <= 2 && e.y <= 2 && e.w >= CANVAS_W - 4 && e.h >= CANVAS_H - 4,
    );
    const background = bgEl?.style?.bg ?? "#ffffff";
    const slideElements = bgEl ? elements.filter(e => e !== bgEl) : elements;

    slides.push({ background, elements: slideElements, notes });
  }

  return slides;
}

/** Human-readable summary for the post-import toast. */
export function describeImport(slides: ImportedSlide[]): string {
  const elements = slides.reduce((sum, s) => sum + s.elements.length, 0);
  return `${slides.length} slide${slides.length === 1 ? "" : "s"}, ${elements} element${elements === 1 ? "" : "s"}`;
}

export { EMU_PER_INCH };
