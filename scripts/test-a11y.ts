/**
 * Accessibility-checker tests.  npm run test:a11y
 *
 * Each case asserts a specific WCAG rule fires (or doesn't). Written against
 * the criteria, not against the implementation.
 */
import { JSDOM } from "jsdom";
import { checkAccessibility, summarise } from "../src/lib/a11y-check";
import { applySpokenPunctuation } from "../src/lib/use-voice-typing";

function main() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;

  let pass = 0, fail = 0;
  const has = (html: string, wcag: string) =>
    checkAccessibility(html, doc).issues.some(i => i.wcag === wcag);
  const t = (label: string, cond: boolean) => {
    if (cond) pass++; else { fail++; console.log("  ✗", label); }
  };

  console.log("1.1.1 Images");
  t("flags img with no alt", has('<img src="a.png">', "1.1.1"));
  t("accepts img with real alt", !has('<img src="a.png" alt="Q3 revenue by region">', "1.1.1"));
  t("accepts empty alt (decorative)", !has('<img src="a.png" alt="">', "1.1.1"));
  t("flags useless alt 'image1'", has('<img src="a.png" alt="image1">', "1.1.1"));

  console.log("1.3.1 Structure");
  t("flags skipped heading level", has("<h1>A</h1><h3>B</h3>", "1.3.1"));
  t("accepts correct heading order", !has("<h1>A</h1><h2>B</h2><h3>C</h3>", "1.3.1"));
  t("accepts going back up levels", !has("<h1>A</h1><h2>B</h2><h2>C</h2>", "1.3.1"));
  t("flags empty heading", has("<h1></h1><p>x</p>", "1.3.1"));
  t("flags table with no th", has("<table><tr><td>a</td></tr></table>", "1.3.1"));
  t("accepts table with th", !has("<table><tr><th>H</th></tr><tr><td>a</td></tr></table>", "1.3.1"));
  const longNoHeadings = "<p>" + "word ".repeat(400) + "</p>";
  t("flags long doc with no headings", has(longNoHeadings, "1.3.1"));
  t("short doc without headings is fine", !has("<p>Just a note.</p>", "1.3.1"));

  console.log("2.4.4 Links");
  t("flags 'click here'", has('<a href="/x">click here</a>', "2.4.4"));
  t("flags 'read more'", has('<a href="/x">Read more</a>', "2.4.4"));
  t("accepts descriptive link", !has('<a href="/x">Download the Q3 security report</a>', "2.4.4"));
  t("flags empty link", has('<a href="/x"></a>', "2.4.4"));
  t("flags long raw URL as link text",
    has('<a href="https://e.com/a/very/long/path/that/goes/on">https://e.com/a/very/long/path/that/goes/on</a>', "2.4.4"));

  console.log("Scoring");
  const clean = checkAccessibility("<h1>Title</h1><p>Short and clean.</p>", doc);
  t("clean short doc scores 100", clean.score === 100);
  t("clean doc reports no errors", clean.errors === 0);
  const bad = checkAccessibility('<img src="a.png"><table><tr><td>x</td></tr></table><a href="/y">click here</a>', doc);
  t("bad doc has errors", bad.errors >= 2);
  t("bad doc scores below 100", bad.score < 100);
  t("score never negative", checkAccessibility('<img src="a.png">'.repeat(50), doc).score >= 0);
  t("summarise reads well", summarise(clean) === "No accessibility issues found");
  t("summarise counts", /error/.test(summarise(bad)));

  console.log("Voice typing punctuation");
  t("full stop", applySpokenPunctuation("hello full stop") === "hello.");
  t("comma spacing", applySpokenPunctuation("a comma b") === "a, b");
  t("question mark", applySpokenPunctuation("really question mark") === "really?");
  t("new paragraph", applySpokenPunctuation("one new paragraph two") === "one\n\ntwo");
  t("parentheses tidy", applySpokenPunctuation("open paren x close paren") === "(x)");
  t("leaves plain text alone", applySpokenPunctuation("just normal words") === "just normal words");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
