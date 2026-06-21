// Client-side HTML sanitizer shared by the inbox (email bodies) and the
// signature editors/previews. Allowlist-based: unknown tags/attributes are
// stripped, dangerous URL protocols and CSS constructs are removed. Returns ""
// during SSR (relies on DOMParser).

const ALLOWED_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "blockquote", "br",
  "caption", "cite", "code", "col", "colgroup", "data", "dd", "del", "details", "dfn",
  "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5",
  "h6", "header", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "rp",
  "rt", "ruby", "s", "samp", "section", "small", "span", "strong", "sub", "summary", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
]);

const ALLOWED_ATTRS: Record<string, string[]> = {
  "*": ["class", "dir", "id", "lang", "title", "style"],
  a: ["href", "name", "target", "rel"],
  blockquote: ["cite"], col: ["span", "width"], colgroup: ["span", "width"],
  del: ["datetime"], img: ["alt", "height", "src", "width"], ins: ["datetime"],
  li: ["value"], ol: ["reversed", "start", "type"], q: ["cite"],
  table: ["border", "cellpadding", "cellspacing", "width"],
  td: ["align", "colspan", "rowspan", "valign", "width"],
  th: ["align", "colspan", "rowspan", "scope", "valign", "width"],
  time: ["datetime"], ul: ["type"],
};

const DANGEROUS_PROTO = /^(javascript|vbscript|data):/i;
// Strip CSS constructs that can execute code: expression(), javascript:, -moz-binding, behavior
const DANGEROUS_CSS = /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding\s*:|behavior\s*:/gi;

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  function clean(node: Node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) { el.remove(); continue; }
      const allowed = new Set([...(ALLOWED_ATTRS["*"] ?? []), ...(ALLOWED_ATTRS[tag] ?? [])]);
      for (const attr of [...el.attributes]) {
        if (!allowed.has(attr.name.toLowerCase())) { el.removeAttribute(attr.name); continue; }
        if ((attr.name === "href" || attr.name === "src") && DANGEROUS_PROTO.test(attr.value.trim())) {
          el.removeAttribute(attr.name); continue;
        }
        if (attr.name === "style") {
          // Also drop inline text/background colors (authored for light backgrounds)
          // so signature content stays readable on the dark theme.
          const safe = attr.value
            .replace(DANGEROUS_CSS, "")
            .replace(/(?:^|;)\s*(?:color|background-color|background)\s*:[^;]*/gi, "")
            .replace(/^;+/, "");
          if (safe.trim()) el.setAttribute("style", safe);
          else el.removeAttribute("style");
          continue;
        }
        if (tag === "a" && attr.name === "href") {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      clean(el);
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
}
