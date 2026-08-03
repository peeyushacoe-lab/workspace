/**
 * Home thumbnail extractor tests.  npm run test:home-preview
 *
 * These run against the REAL stored shapes (Tiptap HTML, workbook JSON, deck
 * JSON) rather than invented ones, and cover the malformed cases — a broken
 * preview must never take the home screen down.
 */
import { docPreviewLines, sheetPreviewCells, slidePreviewLines } from "../src/lib/home-preview";

let pass = 0, fail = 0;
const t = (label: string, cond: boolean, extra = "") => {
  if (cond) pass++; else { fail++; console.log("  ✗", label, extra); }
};

console.log("Docs — Tiptap HTML");
const html = "<h1>Q3 Security Review</h1><p>We found three issues.</p><ul><li>Weak passwords</li></ul>";
let lines = docPreviewLines(html);
t("first line is the heading", lines[0] === "Q3 Security Review", JSON.stringify(lines));
t("body text follows", lines.includes("We found three issues."));
t("list items included", lines.includes("Weak passwords"));
t("no tags leak through", !lines.join("").includes("<"));
t("entities decoded", docPreviewLines("<p>A &amp; B &lt;x&gt;</p>")[0] === "A & B <x>");
t("blank lines dropped", docPreviewLines("<p></p><p>Real</p>")[0] === "Real");
t("caps at 10 lines", docPreviewLines("<p>x</p>".repeat(40)).length === 10);
t("empty content is empty", docPreviewLines("").length === 0);
// A <script> in stored content must not surface as preview text.
t("scripts stripped", !docPreviewLines("<script>alert(1)</script><p>Safe</p>").join(" ").includes("alert"));

console.log("Sheets — workbook JSON");
const wb = JSON.stringify({
  sheets: [{ name: "Sheet 1", cells: {
    "0:0": { v: "Region" }, "0:1": { v: "Revenue" },
    "1:0": { v: "EMEA" },   "1:1": { v: "120" },
    "2:0": { v: "APAC" },   "2:1": { v: "340" },
  }}],
});
let cells = sheetPreviewCells(wb);
t("header row first", cells[0]?.[0] === "Region" && cells[0]?.[1] === "Revenue", JSON.stringify(cells[0]));
t("data rows follow", cells[1]?.[0] === "EMEA" && cells[2]?.[1] === "340");
t("stops at the first empty row", cells.length === 3, `got ${cells.length}`);
t("pads to a rectangle", cells.every(r => r.length === 5));
t("long values truncated",
  sheetPreviewCells(JSON.stringify({ sheets: [{ cells: { "0:0": { v: "x".repeat(40) } } }] }))[0][0].endsWith("…"));
t("formulas shown as text",
  sheetPreviewCells(JSON.stringify({ sheets: [{ cells: { "0:0": { v: "=SUM(A1:A9)" } } }] }))[0][0] === "=SUM(A1:A9)");
t("empty workbook → no preview", sheetPreviewCells(JSON.stringify({ sheets: [{ cells: {} }] })).length === 0);
t("malformed JSON → no crash", sheetPreviewCells("{not json").length === 0);
t("missing sheets key → no crash", sheetPreviewCells("{}").length === 0);
t("empty string → no crash", sheetPreviewCells("").length === 0);

console.log("Slides — deck JSON");
const deck = JSON.stringify({
  slides: [
    { elements: [{ content: "Quarterly Review" }, { content: "• A\n• B" }], notes: "" },
    { elements: [{ content: "Second" }], notes: "" },
  ],
});
lines = slidePreviewLines(deck);
t("first slide title leads", lines[0] === "Quarterly Review", JSON.stringify(lines));
t("multi-line elements split", lines.includes("• A") && lines.includes("• B"));
t("only the first slide is used", !lines.includes("Second"));
t("empty deck → no preview", slidePreviewLines(JSON.stringify({ slides: [] })).length === 0);
t("slide with no elements → no preview", slidePreviewLines(JSON.stringify({ slides: [{ elements: [] }] })).length === 0);
t("malformed JSON → no crash", slidePreviewLines("nope").length === 0);
t("empty string → no crash", slidePreviewLines("").length === 0);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
