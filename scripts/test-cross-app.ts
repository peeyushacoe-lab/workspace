/**
 * Cross-app conversion tests.  npm run test:cross-app
 * Covers doc → slides and slides → outline.
 */
import { docToSlides, slidesToOutlineHtml } from "../src/lib/doc-to-slides";

let pass = 0, fail = 0;
const t = (label: string, cond: boolean, extra = "") => {
  if (cond) pass++; else { fail++; console.log("  ✗", label, extra); }
};

console.log("doc → slides");
const report = `
<p>A short lead paragraph.</p>
<h1>Findings</h1>
<p>We found three issues.</p>
<ul><li>Weak passwords</li><li>Unpatched hosts</li><li>Open S3 buckets</li></ul>
<h1>Recommendations</h1>
<ul><li>Enforce MFA</li><li>Patch weekly</li></ul>
<p>${"This is a long paragraph. ".repeat(12)}</p>
`;
const slides = docToSlides(report, "Q3 Security Review");
t("produces a title slide first", slides[0].title === "Q3 Security Review");
t("title slide carries the lead as subtitle",
  slides[0].elements.some(e => e.content.includes("short lead paragraph")));
t("one slide per h1 (plus title)", slides.length >= 3, `got ${slides.length}`);
t("Findings slide exists", slides.some(s => s.title === "Findings"));
t("Recommendations slide exists", slides.some(s => s.title.startsWith("Recommendations")));
const findings = slides.find(s => s.title === "Findings")!;
t("list items become bullets",
  findings.elements.some(e => e.content.includes("Weak passwords") && e.content.includes("Open S3")));
t("bullets are prefixed", findings.elements.some(e => e.content.includes("• ")));
const recs = slides.filter(s => s.title.startsWith("Recommendations"));
t("long prose goes to speaker notes, not the slide",
  recs.some(s => s.notes.includes("This is a long paragraph")));
t("no element overflows the canvas",
  slides.every(s => s.elements.every(e => e.x >= 0 && e.y >= 0 && e.x + e.w <= 960 && e.y + e.h <= 540)));

console.log("overflow handling");
const many = "<h1>Big</h1><ul>" + Array.from({length: 20}, (_, i) => `<li>Item ${i}</li>`).join("") + "</ul>";
const bigDeck = docToSlides(many, "Big");
t("splits long sections across slides", bigDeck.filter(s => s.title.startsWith("Big")).length >= 4,
  `got ${bigDeck.filter(s => s.title.startsWith("Big")).length}`);
t("continuation slides are labelled", bigDeck.some(s => s.title.includes("(cont.)")));

console.log("edge cases");
t("empty doc still yields a title slide", docToSlides("", "Empty").length >= 1);
const noHeadings = docToSlides("<p>One. Two. Three.</p>", "Flat");
t("doc with no headings still gets content", noHeadings.length >= 2, `got ${noHeadings.length}`);
t("escapes nothing weird", !JSON.stringify(slides).includes("<p>"));

console.log("slides → outline");
const outline = slidesToOutlineHtml([
  { elements: [{ content: "Intro" }, { content: "• A\n• B" }], notes: "Say hello" },
  { elements: [{ content: "Next" }], notes: "" },
], "My Deck");
t("has deck title as h1", outline.includes("<h1>My Deck</h1>"));
t("slide titles become h2", outline.includes("<h2>Intro</h2>") && outline.includes("<h2>Next</h2>"));
t("bullets become a list", outline.includes("<li>A</li>") && outline.includes("<li>B</li>"));
t("notes become a blockquote", outline.includes("<blockquote><p>Say hello</p></blockquote>"));
t("escapes HTML in content",
  slidesToOutlineHtml([{ elements: [{ content: "<script>x</script>" }], notes: "" }], "T")
    .includes("&lt;script&gt;"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
