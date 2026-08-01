"use client";

/**
 * Nexus Sheets — advanced chart types
 * ===================================
 *
 * Waterfall, funnel, treemap and gauge, built on the same Recharts 2.15 that
 * powers the basic chart set in SheetsEditor.
 *
 * Colour policy here is deliberately narrow. Waterfall bars carry real meaning
 * (a step is a rise or a fall) so they use `--ok` / `--crit` / `--accent`.
 * Funnel stages and treemap tiles are merely *categorical* — painting them with
 * the semantic palette would imply a stage is "bad" when it is only "fourth" —
 * so they use one accent hue at descending opacity instead.
 */

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList,
  Pie, PieChart, Tooltip, Treemap, XAxis, YAxis,
} from "recharts";

// ─── Public types ─────────────────────────────────────────────────────────────

export type AdvancedChartType = "waterfall" | "funnel" | "treemap" | "gauge";

export type ChartDatum = { name: string; value: number };

export type AdvancedChartProps = {
  type: AdvancedChartType;
  data: ChartDatum[];
  width?: number;
  height?: number;
  /** Gauge only — the top of the scale. Defaults to the largest supplied value. */
  max?: number;
  /** Waterfall only — label for the appended running-total bar. */
  totalLabel?: string;
};

export type WaterfallKind = "increase" | "decrease" | "total";

export type WaterfallRow = {
  name: string;
  /** The delta as supplied. On the total row, the final running total. */
  value: number;
  /** Running total before and after this step. */
  start: number;
  end: number;
  /** Running total after this step — alias of `end`, kept for tooltip clarity. */
  cumulative: number;
  kind: WaterfallKind;
  /** Invisible plinth the visible segment stacks on top of. */
  base: number;
  /** Visible segment above zero. Zero when the bar sits entirely below the axis. */
  rise: number;
  /** Visible segment below zero (negative). Zero when the bar sits above the axis. */
  fall: number;
};

// ─── Waterfall maths ──────────────────────────────────────────────────────────

/**
 * Recharts has no waterfall primitive, so a bar is faked as a stack of a
 * transparent plinth plus a visible segment.
 *
 * The complication is that a running total can cross zero — a cash-flow
 * waterfall routinely does. Recharts stacks with `stackOffset="sign"`, which
 * grows positive members upward from the axis and negative members downward, so
 * a bar is encoded as whichever of those two directions it actually occupies:
 *
 *   entirely above zero → positive plinth + positive `rise`
 *   entirely below zero → negative plinth + negative `fall`
 *   straddling zero     → no plinth, `rise` up to the top, `fall` down to the bottom
 *
 * Splitting a straddling bar in two is what keeps it drawn as one continuous
 * block rather than a segment hanging off the wrong side of the axis.
 */
function encodeBar(name: string, value: number, start: number, end: number, kind: WaterfallKind): WaterfallRow {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);

  let base: number, rise: number, fall: number;
  if (lo >= 0) {
    base = lo; rise = hi - lo; fall = 0;
  } else if (hi <= 0) {
    base = hi; rise = 0; fall = lo - hi;
  } else {
    base = 0; rise = hi; fall = lo;
  }

  return { name, value, start, end, cumulative: end, kind, base, rise, fall };
}

/**
 * Turns a list of deltas into plottable waterfall rows, appending a bar for the
 * final running total. Pure — the chart is a thin shell over this, so the maths
 * is testable without a DOM (see scripts/test-advanced-charts.ts).
 */
export function buildWaterfallSeries(
  data: ChartDatum[],
  options: { totalLabel?: string; includeTotal?: boolean } = {},
): WaterfallRow[] {
  const { totalLabel = "Total", includeTotal = true } = options;

  const rows: WaterfallRow[] = [];
  let running = 0;

  for (const datum of data ?? []) {
    // Blank and text cells reach us as NaN; treating them as no-ops keeps the
    // running total honest rather than poisoning every subsequent bar.
    const value = Number.isFinite(datum?.value) ? Number(datum.value) : 0;
    const start = running;
    running = start + value;
    rows.push(encodeBar(String(datum?.name ?? ""), value, start, running, value < 0 ? "decrease" : "increase"));
  }

  if (includeTotal && rows.length > 0) {
    rows.push(encodeBar(totalLabel, running, 0, running, "total"));
  }

  return rows;
}

/** Fill for a waterfall bar. Semantic: rises are `ok`, falls are `crit`. */
export function waterfallFill(kind: WaterfallKind): string {
  if (kind === "increase") return "var(--ok)";
  if (kind === "decrease") return "var(--crit)";
  return "var(--accent)";
}

// ─── Gauge maths ──────────────────────────────────────────────────────────────

export type GaugeReading = { value: number; max: number; ratio: number; overflow: boolean; label: string };

/**
 * Reads a gauge out of a plain `{ name, value }[]`, because that is all a
 * spreadsheet range gives us. The first row is the reading; an explicitly
 * passed `max` wins, otherwise a row named max/target/total/goal supplies it,
 * otherwise the largest value in the range does.
 */
export function resolveGauge(data: ChartDatum[], explicitMax?: number): GaugeReading {
  const rows = (data ?? []).filter((d) => Number.isFinite(d?.value));
  const value = rows.length ? Number(rows[0].value) : 0;
  const label = rows.length ? String(rows[0].name ?? "") : "";

  const named = rows.slice(1).find((d) => /^(max|maximum|target|total|goal)$/i.test(String(d.name ?? "").trim()));
  const candidate = Number.isFinite(explicitMax) ? Number(explicitMax)
    : named ? Number(named.value)
    : Math.max(...rows.map((d) => Number(d.value)), 0);

  // A zero-width scale would divide by zero and render an empty ring.
  const max = candidate > 0 ? candidate : Math.max(Math.abs(value), 1);
  const clamped = Math.min(Math.max(value, 0), max);

  return { value, max, ratio: max === 0 ? 0 : clamped / max, overflow: value > max, label };
}

// ─── Shared presentation helpers ──────────────────────────────────────────────

/**
 * Categorical ramp: one hue, fading with rank. Reads as a sequence rather than
 * as five unrelated statuses.
 */
function rampOpacity(index: number, count: number): number {
  if (count <= 1) return 1;
  return 1 - (index / (count - 1)) * 0.6;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const fmt = (n: number) => (Number.isFinite(n) ? numberFormat.format(n) : "—");

const AXIS_TICK = { fontSize: 11, fill: "var(--muted)" } as const;

const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

function ChartShell({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  return (
    <div className="relative" style={{ width, height }}>
      {children}
    </div>
  );
}

function EmptyState({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-sunken text-subtle"
      style={{ width, height }}
    >
      <BarChart3 className="w-6 h-6" />
      <span className="text-xs">No data in the selected range</span>
    </div>
  );
}

// ─── Waterfall ────────────────────────────────────────────────────────────────

type TooltipShell = { active?: boolean; payload?: { payload?: WaterfallRow }[] };

function WaterfallTooltip({ active, payload }: TooltipShell) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const signed = row.kind === "total" ? fmt(row.value) : `${row.value >= 0 ? "+" : ""}${fmt(row.value)}`;
  const tone = row.kind === "increase" ? "text-ok" : row.kind === "decrease" ? "text-crit" : "text-accent";

  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-2 shadow-pop">
      <div className="text-xs font-semibold text-foreground">{row.name}</div>
      <div className={`text-xs font-medium ${tone}`}>{signed}</div>
      {row.kind !== "total" && (
        <div className="text-[11px] text-muted">Running total {fmt(row.cumulative)}</div>
      )}
    </div>
  );
}

function WaterfallChart({ rows, width, height }: { rows: WaterfallRow[]; width: number; height: number }) {
  return (
    <BarChart data={rows} width={width} height={height} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" tick={AXIS_TICK} stroke="var(--border)" />
      <YAxis tick={AXIS_TICK} stroke="var(--border)" />
      <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "var(--hover)" }} />
      {/* The plinth carries no ink — it only lifts the visible segment to the
          running total it starts from. */}
      <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
      <Bar dataKey="rise" stackId="waterfall" isAnimationActive={false}>
        {rows.map((row) => <Cell key={`rise-${row.name}`} fill={waterfallFill(row.kind)} />)}
      </Bar>
      <Bar dataKey="fall" stackId="waterfall" isAnimationActive={false}>
        {rows.map((row) => <Cell key={`fall-${row.name}`} fill={waterfallFill(row.kind)} />)}
      </Bar>
    </BarChart>
  );
}

// ─── Funnel ───────────────────────────────────────────────────────────────────

type FunnelRow = ChartDatum & { label: string; conversion: number };

export function buildFunnelSeries(data: ChartDatum[]): FunnelRow[] {
  const rows = (data ?? []).map((d) => ({
    name: String(d?.name ?? ""),
    value: Number.isFinite(d?.value) ? Math.max(Number(d.value), 0) : 0,
  }));
  // Conversion is measured against the top of the funnel, which is the number
  // people actually quote ("12% of visitors bought"), not step-to-step drop-off.
  const top = rows[0]?.value ?? 0;
  return rows.map((row) => {
    const conversion = top > 0 ? (row.value / top) * 100 : 0;
    return { ...row, conversion, label: `${row.name} · ${fmt(row.value)} (${conversion.toFixed(0)}%)` };
  });
}

function FunnelStages({ rows, width, height }: { rows: FunnelRow[]; width: number; height: number }) {
  return (
    <FunnelChart width={width} height={height} margin={{ top: 8, right: 132, bottom: 8, left: 8 }}>
      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "var(--foreground)" }} />
      <Funnel dataKey="value" nameKey="name" data={rows} stroke="var(--surface)" isAnimationActive={false}>
        {rows.map((row, i) => (
          <Cell key={row.name} fill="var(--accent)" fillOpacity={rampOpacity(i, rows.length)} />
        ))}
        <LabelList
          position="right"
          dataKey="label"
          fill="var(--foreground)"
          stroke="none"
          fontSize={11}
        />
      </Funnel>
    </FunnelChart>
  );
}

// ─── Treemap ──────────────────────────────────────────────────────────────────

type TileProps = {
  x?: number; y?: number; width?: number; height?: number;
  index?: number; name?: string; value?: number; root?: { children?: unknown[] };
};

/**
 * Recharts' default tile paints a fixed colour and always draws its label, which
 * turns small tiles into a smear of clipped text. This one takes its fill from
 * the categorical ramp and only labels a tile big enough to hold the words.
 */
function TreemapTile({ x = 0, y = 0, width = 0, height = 0, index = 0, name, value, root }: TileProps) {
  const count = root?.children?.length ?? 1;
  const showLabel = width > 56 && height > 30;
  const showValue = showLabel && height > 46;

  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill="var(--accent)"
        fillOpacity={rampOpacity(index, count)}
        stroke="var(--surface)"
        rx={3}
      />
      {showLabel && (
        <text x={x + 8} y={y + 18} fill="var(--surface)" fontSize={11} fontWeight={600}>
          {name}
        </text>
      )}
      {showValue && (
        <text x={x + 8} y={y + 34} fill="var(--surface)" fontSize={10} fillOpacity={0.85}>
          {fmt(Number(value))}
        </text>
      )}
    </g>
  );
}

// ─── Gauge ────────────────────────────────────────────────────────────────────

function Gauge({ reading, width, height }: { reading: GaugeReading; width: number; height: number }) {
  const { value, max, ratio, overflow, label } = reading;
  // Overshooting the scale is a real condition (budget blown, quota exceeded),
  // so it earns `crit`. Everything else is neutral: only the caller knows
  // whether a high reading is good news.
  const fill = overflow ? "var(--crit)" : "var(--accent)";
  const arc = [
    { name: "filled", value: ratio },
    { name: "remaining", value: 1 - ratio },
  ];

  return (
    <>
      <PieChart width={width} height={height}>
        <Pie
          data={arc}
          dataKey="value"
          startAngle={180}
          endAngle={0}
          cx="50%"
          cy="72%"
          innerRadius="58%"
          outerRadius="92%"
          stroke="none"
          isAnimationActive={false}
        >
          <Cell fill={fill} />
          <Cell fill="var(--border)" />
        </Pie>
      </PieChart>

      {/* Readout sits inside the arc; the SVG below it is decoration, so it must
          not swallow pointer events aimed at the chart. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center" style={{ paddingBottom: height * 0.14 }}>
        <span className={`text-2xl font-semibold tracking-tight ${overflow ? "text-crit" : "text-foreground"}`}>
          {fmt(value)}
        </span>
        <span className="text-[11px] text-muted">
          of {fmt(max)} · {(ratio * 100).toFixed(0)}%
        </span>
        {label && <span className="mt-0.5 text-[11px] text-subtle">{label}</span>}
      </div>
    </>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function AdvancedChart({ type, data, width = 480, height = 300, max, totalLabel }: AdvancedChartProps) {
  const waterfall = useMemo(
    () => (type === "waterfall" ? buildWaterfallSeries(data, { totalLabel }) : []),
    [type, data, totalLabel],
  );
  const funnel = useMemo(() => (type === "funnel" ? buildFunnelSeries(data) : []), [type, data]);
  const tree = useMemo(
    () =>
      type === "treemap"
        ? (data ?? [])
            .map((d) => ({ name: String(d?.name ?? ""), value: Number.isFinite(d?.value) ? Math.abs(Number(d.value)) : 0 }))
            .filter((d) => d.value > 0)
        : [],
    [type, data],
  );
  const gauge = useMemo(() => resolveGauge(data, max), [data, max]);

  if (!data || data.length === 0) return <EmptyState width={width} height={height} />;

  if (type === "gauge") {
    return (
      <ChartShell width={width} height={height}>
        <Gauge reading={gauge} width={width} height={height} />
      </ChartShell>
    );
  }

  if (type === "treemap") {
    if (tree.length === 0) return <EmptyState width={width} height={height} />;
    return (
      <ChartShell width={width} height={height}>
        {/* Treemap takes its Tooltip as a child rather than a sibling. */}
        <Treemap
          data={tree}
          width={width}
          height={height}
          dataKey="value"
          nameKey="name"
          aspectRatio={4 / 3}
          content={<TreemapTile />}
          isAnimationActive={false}
        >
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "var(--foreground)" }} />
        </Treemap>
      </ChartShell>
    );
  }

  return (
    <ChartShell width={width} height={height}>
      {type === "funnel"
        ? <FunnelStages rows={funnel} width={width} height={height} />
        : <WaterfallChart rows={waterfall} width={width} height={height} />}
    </ChartShell>
  );
}

export default AdvancedChart;
