/**
 * Advanced chart maths tests.
 *   node node_modules/tsx/dist/cli.mjs scripts/test-advanced-charts.ts
 *
 * The waterfall encoding is the only part of AdvancedCharts that can be wrong
 * silently — a mis-stacked bar still renders, it just lies. These assertions
 * pin the invariant that matters: for every row, base + rise + fall must
 * reconstruct the bar's true span, including when the running total crosses
 * zero (which is where the naive single-bar encoding breaks).
 */
import {
  buildWaterfallSeries,
  buildFunnelSeries,
  resolveGauge,
  waterfallFill,
  type ChartDatum,
  type WaterfallRow,
} from "../src/components/sheets/AdvancedCharts";

let pass = 0, fail = 0;
const t = (label: string, cond: boolean, extra = "") => {
  if (cond) pass++; else { fail++; console.log("  ✗", label, extra); }
};
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

/** The vertical span a stacked bar will actually occupy once drawn. */
const span = (r: WaterfallRow) => {
  const lo = Math.min(r.base + r.fall, r.base);
  const hi = Math.max(r.base + r.rise, r.base);
  return { lo, hi };
};
const spansCorrectly = (r: WaterfallRow) => {
  const { lo, hi } = span(r);
  return near(lo, Math.min(r.start, r.end)) && near(hi, Math.max(r.start, r.end));
};

console.log("Waterfall — running totals");
let rows = buildWaterfallSeries([
  { name: "Open", value: 100 },
  { name: "Sales", value: 50 },
  { name: "Refunds", value: -30 },
]);
t("appends a total row", rows.length === 4 && rows[3].name === "Total", JSON.stringify(rows.map(r => r.name)));
t("running total accumulates", rows.map(r => r.cumulative).join() === "100,150,120,120", JSON.stringify(rows.map(r => r.cumulative)));
t("first bar starts at zero", rows[0].start === 0 && rows[0].end === 100);
t("second bar starts where the first ended", rows[1].start === 100 && rows[1].end === 150);
t("total bar spans zero to the final total", rows[3].start === 0 && rows[3].end === 120);

console.log("Waterfall — kinds drive colour");
t("positive delta is an increase", rows[0].kind === "increase" && rows[1].kind === "increase");
t("negative delta is a decrease", rows[2].kind === "decrease");
t("total is its own kind", rows[3].kind === "total");
t("increase paints ok", waterfallFill("increase") === "var(--ok)");
t("decrease paints crit", waterfallFill("decrease") === "var(--crit)");
t("total paints accent", waterfallFill("total") === "var(--accent)");

console.log("Waterfall — stack encoding reconstructs every bar");
t("all bars span correctly (positive series)", rows.every(spansCorrectly), JSON.stringify(rows));
t("plinth lifts the decrease to its start", near(rows[2].base, 120) && near(rows[2].rise, 30) && rows[2].fall === 0);

console.log("Waterfall — below and across the zero line");
rows = buildWaterfallSeries([
  { name: "Open", value: 40 },
  { name: "Loss", value: -90 },   // crosses zero: 40 → -50
  { name: "Deeper", value: -20 }, // wholly below zero: -50 → -70
  { name: "Recover", value: 30 }, // wholly below zero, rising: -70 → -40
]);
t("all bars span correctly (crosses zero)", rows.every(spansCorrectly), JSON.stringify(rows));
t("straddling bar splits into rise and fall", rows[1].base === 0 && near(rows[1].rise, 40) && near(rows[1].fall, -50), JSON.stringify(rows[1]));
t("bars below the axis use a negative plinth", rows[2].base < 0 && rows[2].rise === 0 && rows[2].fall < 0, JSON.stringify(rows[2]));
t("total below zero spans zero down to it", rows[4].start === 0 && near(rows[4].end, -40) && rows[4].rise === 0);

console.log("Waterfall — degenerate input");
t("empty input yields no rows (not a lone total)", buildWaterfallSeries([]).length === 0);
rows = buildWaterfallSeries([{ name: "Flat", value: 0 }]);
t("zero delta keeps the running total", rows[0].cumulative === 0 && rows[0].rise === 0 && rows[0].fall === 0);
rows = buildWaterfallSeries([
  { name: "Good", value: 10 },
  { name: "Text", value: Number.NaN },
  { name: "More", value: 5 },
] as ChartDatum[]);
t("non-numeric cell is a no-op, not a NaN poison", rows.every(r => Number.isFinite(r.cumulative)) && rows[2].cumulative === 15, JSON.stringify(rows.map(r => r.cumulative)));
rows = buildWaterfallSeries([{ name: "A", value: 5 }], { totalLabel: "Net", includeTotal: true });
t("total label is configurable", rows[1].name === "Net");
t("total can be suppressed", buildWaterfallSeries([{ name: "A", value: 5 }], { includeTotal: false }).length === 1);

console.log("Funnel — conversion against the top of the funnel");
const funnel = buildFunnelSeries([
  { name: "Visits", value: 1000 },
  { name: "Signups", value: 250 },
  { name: "Paid", value: 50 },
]);
t("first stage is 100%", near(funnel[0].conversion, 100));
t("later stages convert against the first", near(funnel[1].conversion, 25) && near(funnel[2].conversion, 5));
t("label carries name, value and percentage", funnel[1].label.includes("Signups") && funnel[1].label.includes("25%"));
t("zero-top funnel does not divide by zero", buildFunnelSeries([{ name: "A", value: 0 }, { name: "B", value: 0 }]).every(r => r.conversion === 0));
t("negative stage counts are clamped to zero", buildFunnelSeries([{ name: "A", value: -5 }])[0].value === 0);

console.log("Gauge — reading a value against a max");
let g = resolveGauge([{ name: "Uptime", value: 75 }], 100);
t("explicit max wins", g.max === 100 && near(g.ratio, 0.75) && !g.overflow);
g = resolveGauge([{ name: "Spend", value: 60 }, { name: "Target", value: 120 }]);
t("a named max row supplies the scale", g.max === 120 && near(g.ratio, 0.5));
g = resolveGauge([{ name: "Score", value: 30 }, { name: "Other", value: 90 }]);
t("otherwise the largest value is the scale", g.max === 90 && near(g.ratio, 1 / 3));
g = resolveGauge([{ name: "Spend", value: 150 }], 100);
t("overflow is flagged and the arc is clamped", g.overflow && g.ratio === 1 && g.value === 150);
g = resolveGauge([{ name: "Nothing", value: 0 }], 0);
t("zero scale never divides by zero", Number.isFinite(g.ratio) && g.max > 0);
g = resolveGauge([]);
t("empty range reads as zero", g.value === 0 && Number.isFinite(g.ratio));
g = resolveGauge([{ name: "Debt", value: -20 }], 100);
t("negative reading clamps to the bottom of the arc", g.ratio === 0 && g.value === -20);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
