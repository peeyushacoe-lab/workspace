"use client";

/**
 * HTML → .docx (WordprocessingML) writer.
 *
 * Nexus Docs stores content as Tiptap HTML. Word cannot open HTML-renamed-to-docx
 * (it warns, and Google Docs / Pages reject it outright), so this builds a real
 * OOXML package with JSZip — already a dependency, so no new install.
 *
 * Deliberately hand-rolled rather than pulling in the `docx` npm package: we
 * need a narrow, well-understood subset (headings, runs, lists, tables, links,
 * images) and the package would add ~700 KB to the bundle for the same output.
 *
 * Supported: h1–h6, p, b/strong, i/em, u, s/strike, code, a, ul/ol (incl.
 * nesting), blockquote, hr, tables, images (data-URL and remote), text
 * alignment, highlight and font colour.
 */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Default Extension="gif" ContentType="image/gif"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

/** Heading styles + a monospace code style. Word needs these declared to apply them. */
function stylesXml(): string {
  const heading = (level: number, halfPoints: number) => `
<w:style w:type="paragraph" w:styleId="Heading${level}">
  <w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:keepNext/><w:spacing w:before="${level === 1 ? 360 : 280}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>
  <w:rPr><w:b/><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr>
</w:style>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
  <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
${heading(1, 48)}${heading(2, 36)}${heading(3, 28)}${heading(4, 24)}${heading(5, 22)}${heading(6, 20)}
<w:style w:type="paragraph" w:styleId="Quote">
  <w:name w:val="Quote"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:ind w:left="720"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="4F46E5"/></w:pBdr></w:pPr>
  <w:rPr><w:i/><w:color w:val="6B6A65"/></w:rPr>
</w:style>
<w:style w:type="character" w:styleId="CodeChar">
  <w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F4F4F4"/></w:rPr>
</w:style>
<w:style w:type="character" w:styleId="Hyperlink">
  <w:name w:val="Hyperlink"/><w:rPr><w:color w:val="4F46E5"/><w:u w:val="single"/></w:rPr>
</w:style>
</w:styles>`;
}

/** Two numbering definitions: bullets (numId 1) and decimals (numId 2), 5 levels each. */
function numberingXml(): string {
  const levels = (fmt: "bullet" | "decimal") =>
    Array.from({ length: 5 }, (_, i) => {
      const indent = 720 * (i + 1);
      return fmt === "bullet"
        ? `<w:lvl w:ilvl="${i}"><w:numFmt w:val="bullet"/><w:lvlText w:val="${["","o","▪","•","o"][i] || "•"}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl>`
        : `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr></w:lvl>`;
    }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels("bullet")}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels("decimal")}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline formatting carried down the DOM walk. */
type RunFmt = {
  b?: boolean; i?: boolean; u?: boolean; strike?: boolean;
  code?: boolean; color?: string; highlight?: string;
  link?: string; sup?: boolean; sub?: boolean;
};

/** Normalises "#ff0000" / "rgb(255,0,0)" to the bare "FF0000" OOXML wants. */
function toHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(v);
  if (hex) return hex[1].toUpperCase();
  const short = /^#([0-9a-f]{3})$/i.exec(v);
  if (short) return short[1].split("").map(c => c + c).join("").toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map(n => Number(n).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  return undefined;
}

function runXml(text: string, fmt: RunFmt): string {
  if (!text) return "";
  const props: string[] = [];
  if (fmt.b) props.push("<w:b/>");
  if (fmt.i) props.push("<w:i/>");
  if (fmt.u) props.push('<w:u w:val="single"/>');
  if (fmt.strike) props.push("<w:strike/>");
  if (fmt.code) props.push('<w:rStyle w:val="CodeChar"/>');
  if (fmt.link) props.push('<w:rStyle w:val="Hyperlink"/>');
  if (fmt.sup) props.push('<w:vertAlign w:val="superscript"/>');
  if (fmt.sub) props.push('<w:vertAlign w:val="subscript"/>');
  const color = toHex(fmt.color);
  if (color) props.push(`<w:color w:val="${color}"/>`);
  const hl = toHex(fmt.highlight);
  if (hl) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hl}"/>`);

  const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
  // xml:space="preserve" keeps leading/trailing spaces, which Word otherwise eats.
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

type BuildState = {
  /** Hyperlink relationships accumulated while walking. */
  rels: { id: string; target: string }[];
  /** Images to embed: relationship id → binary. */
  media: { id: string; name: string; data: ArrayBuffer; width: number; height: number }[];
  nextRelId: number;
};

function addRel(state: BuildState, target: string): string {
  const id = `rId${state.nextRelId++}`;
  state.rels.push({ id, target });
  return id;
}

/** Collects the runs inside a block-level element. */
function inlineRuns(node: Node, fmt: RunFmt, state: BuildState): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return runXml(node.textContent ?? "", fmt);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const next: RunFmt = { ...fmt };

  switch (tag) {
    case "b": case "strong": next.b = true; break;
    case "i": case "em": next.i = true; break;
    case "u": next.u = true; break;
    case "s": case "strike": case "del": next.strike = true; break;
    case "code": next.code = true; break;
    case "sup": next.sup = true; break;
    case "sub": next.sub = true; break;
    case "br": return '<w:r><w:br/></w:r>';
    case "img": return imageRun(el as HTMLImageElement, state);
    case "a": {
      const href = el.getAttribute("href");
      if (href) {
        const relId = addRel(state, href);
        const inner = Array.from(el.childNodes)
          .map(c => inlineRuns(c, { ...next, link: href }, state))
          .join("");
        return `<w:hyperlink r:id="${relId}">${inner}</w:hyperlink>`;
      }
      break;
    }
    case "mark": next.highlight = el.getAttribute("data-color") || "FFF3A3"; break;
  }

  // Inline styles from Tiptap's TextStyle / Color / Highlight extensions.
  const style = el.getAttribute("style") ?? "";
  const colorMatch = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
  if (colorMatch) next.color = colorMatch[1];
  const bgMatch = /background-color\s*:\s*([^;]+)/i.exec(style);
  if (bgMatch) next.highlight = bgMatch[1];
  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) next.b = true;
  if (/font-style\s*:\s*italic/i.test(style)) next.i = true;

  return Array.from(el.childNodes).map(c => inlineRuns(c, next, state)).join("");
}

/** EMU per pixel at 96 DPI — OOXML measures images in English Metric Units. */
const EMU_PER_PX = 9525;

function imageRun(img: HTMLImageElement, state: BuildState): string {
  const src = img.getAttribute("src") ?? "";
  const match = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(src);
  // Remote images can't be fetched synchronously here; they're skipped rather
  // than producing a corrupt package. Data-URL images (the paste/upload path
  // used by DocsView) are the common case and do embed.
  if (!match) return "";

  const ext = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const binary = atob(match[2]);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);

  const id = `rId${state.nextRelId++}`;
  const index = state.media.length + 1;
  const name = `image${index}.${ext}`;
  const width = Math.min(img.naturalWidth || img.width || 480, 620);
  const height = Math.round(
    ((img.naturalHeight || img.height || 320) / (img.naturalWidth || img.width || 480)) * width,
  );

  state.media.push({ id, name, data: buf, width, height });
  state.rels.push({ id, target: `media/${name}` });

  const cx = width * EMU_PER_PX;
  const cy = height * EMU_PER_PX;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${index}" name="Picture ${index}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${index}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function alignmentXml(el: HTMLElement): string {
  const align =
    el.style?.textAlign ||
    (el.getAttribute("style")?.match(/text-align\s*:\s*(\w+)/i)?.[1] ?? "");
  const map: Record<string, string> = {
    center: "center", right: "right", justify: "both", left: "left",
  };
  const val = map[align.toLowerCase()];
  return val ? `<w:jc w:val="${val}"/>` : "";
}

function paragraph(runs: string, opts: { style?: string; numId?: number; level?: number; align?: string } = {}): string {
  const props: string[] = [];
  if (opts.style) props.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.numId) {
    props.push(`<w:numPr><w:ilvl w:val="${opts.level ?? 0}"/><w:numId w:val="${opts.numId}"/></w:numPr>`);
  }
  if (opts.align) props.push(opts.align);
  const pPr = props.length ? `<w:pPr>${props.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}${runs}</w:p>`;
}

/** Walks block-level elements and emits paragraphs / tables. */
function blocks(node: Node, state: BuildState, listCtx?: { numId: number; level: number }): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    return text ? paragraph(runXml(node.textContent ?? "", {}), {}) : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const align = alignmentXml(el);

  switch (tag) {
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return paragraph(inlineRuns(el, {}, state), { style: `Heading${tag[1]}`, align });

    case "p":
      return paragraph(inlineRuns(el, {}, state), { align, ...(listCtx ? { numId: listCtx.numId, level: listCtx.level } : {}) });

    case "blockquote": {
      // Build the quoted paragraphs directly rather than post-processing the
      // generic output. The previous string-replace approach injected a second
      // <w:pPr> into paragraphs that already had one — two pPr elements in a
      // single <w:p> is invalid OOXML, and Word refuses the file or "repairs"
      // it by dropping content.
      const children = Array.from(el.children).filter(c =>
        ["p", "h1", "h2", "h3", "h4", "h5", "h6", "div"].includes(c.tagName.toLowerCase()),
      );
      if (!children.length) {
        return paragraph(inlineRuns(el, {}, state), { style: "Quote", align });
      }
      return children
        .map(child =>
          paragraph(inlineRuns(child, {}, state), {
            style: "Quote",
            align: alignmentXml(child as HTMLElement),
          }),
        )
        .join("");
    }

    case "pre":
      return paragraph(inlineRuns(el, { code: true }, state), {});

    case "hr":
      return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D8D7D2"/></w:pBdr></w:pPr></w:p>`;

    case "ul": case "ol": {
      const numId = tag === "ol" ? 2 : 1;
      const level = listCtx ? Math.min(listCtx.level + 1, 4) : 0;
      return Array.from(el.children)
        .map(li => listItem(li as HTMLElement, state, { numId, level }))
        .join("");
    }

    case "table":
      return tableXml(el, state);

    case "img":
      return paragraph(imageRun(el as HTMLImageElement, state), { align });

    case "div": case "section": case "article": case "main": case "body":
      return Array.from(el.childNodes).map(c => blocks(c, state, listCtx)).join("");

    default:
      // Unknown inline-ish wrapper — emit as a paragraph if it has text.
      return el.textContent?.trim()
        ? paragraph(inlineRuns(el, {}, state), { align })
        : "";
  }
}

function listItem(li: HTMLElement, state: BuildState, ctx: { numId: number; level: number }): string {
  const out: string[] = [];
  const inlineParts: Node[] = [];
  const nestedLists: HTMLElement[] = [];

  for (const child of Array.from(li.childNodes)) {
    const isList =
      child.nodeType === Node.ELEMENT_NODE &&
      ["ul", "ol"].includes((child as HTMLElement).tagName.toLowerCase());
    if (isList) nestedLists.push(child as HTMLElement);
    else inlineParts.push(child);
  }

  const runs = inlineParts.map(n => inlineRuns(n, {}, state)).join("");
  if (runs.trim()) out.push(paragraph(runs, { numId: ctx.numId, level: ctx.level }));

  for (const nested of nestedLists) {
    out.push(blocks(nested, state, ctx));
  }
  return out.join("");
}

function tableXml(table: HTMLElement, state: BuildState): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return "";

  const colCount = Math.max(
    ...rows.map(r => r.querySelectorAll("td,th").length),
  );
  // Word needs an explicit grid; 9360 twips ≈ the usable width of A4 portrait.
  const colWidth = Math.floor(9360 / Math.max(colCount, 1));
  const grid = Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join("");

  const body = rows
    .map(row => {
      const cells = Array.from(row.querySelectorAll("td,th"));
      const tcs = cells
        .map(cell => {
          const isHeader = cell.tagName.toLowerCase() === "th";
          const runs = inlineRuns(cell, isHeader ? { b: true } : {}, state);
          const shading = isHeader
            ? '<w:shd w:val="clear" w:color="auto" w:fill="F5F4F1"/>'
            : "";
          return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shading}</w:tcPr>${paragraph(runs, {})}</w:tc>`;
        })
        .join("");
      return `<w:tr>${tcs}</w:tr>`;
    })
    .join("");

  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>
<w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="D8D7D2"/><w:left w:val="single" w:sz="4" w:color="D8D7D2"/>
<w:bottom w:val="single" w:sz="4" w:color="D8D7D2"/><w:right w:val="single" w:sz="4" w:color="D8D7D2"/>
<w:insideH w:val="single" w:sz="4" w:color="D8D7D2"/><w:insideV w:val="single" w:sz="4" w:color="D8D7D2"/>
</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

/**
 * Converts Tiptap HTML into a .docx Blob.
 * `title` becomes the document's first heading and its core-properties title.
 */
export async function htmlToDocxBlob(html: string, title: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;

  const state: BuildState = { rels: [], media: [], nextRelId: 10 };
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild ?? doc.body;

  const titlePara = title
    ? paragraph(runXml(title, {}), { style: "Heading1" })
    : "";
  const content = Array.from(root.childNodes).map(n => blocks(n, state)).join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<w:body>${titlePara}${content}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body></w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${state.rels
  .map(rel =>
    rel.target.startsWith("media/")
      ? `<Relationship Id="${rel.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${rel.target}"/>`
      : `<Relationship Id="${rel.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(rel.target)}" TargetMode="External"/>`,
  )
  .join("\n")}
</Relationships>`;

  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title>
<dc:creator>Nexus</dc:creator>
<cp:lastModifiedBy>Nexus</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", ROOT_RELS);
  zip.folder("docProps")!.file("core.xml", coreXml);
  const word = zip.folder("word")!;
  word.file("document.xml", documentXml);
  word.file("styles.xml", stylesXml());
  word.file("numbering.xml", numberingXml());
  word.folder("_rels")!.file("document.xml.rels", relsXml);
  if (state.media.length) {
    const media = word.folder("media")!;
    for (const m of state.media) media.file(m.name, m.data);
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

/** Builds the .docx and triggers a browser download. */
export async function downloadDocx(html: string, title: string): Promise<void> {
  const blob = await htmlToDocxBlob(html, title);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "Document"}.docx`;
  a.click();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in Safari before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * .docx → HTML, for import. mammoth handles the OOXML parsing; we only map its
 * style hints onto the tags Tiptap understands.
 */
export async function docxFileToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}
