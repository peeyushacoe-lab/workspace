"use client";

/**
 * Nexus Sheets — Professional spreadsheet editor
 * Features: 50+ formulas, charts, sort/filter, conditional formatting,
 * number formats, column/row resize, freeze panes, merge cells, AI assistant
 */

import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ArrowLeft,
  Plus, Download, Upload, Share2, Loader2,
  BarChart3, SortAsc, SortDesc, Filter, Sparkles,
  ChevronDown, Paintbrush, Type, Merge, X, Check,
  Undo2, Redo2, WrapText, EyeOff, Tag, ListChecks, Table, Grid2x2,
  Columns, LayoutGrid, Search, Replace, Brush,
  MessageSquare, CopyMinus, SplitSquareHorizontal,
  Lock, ListFilter,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell as PieCell,
  AreaChart, Area, ScatterChart, Scatter, ComposedChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { DocShareModal } from "./DocShareModal";
import { evaluateFormula, formatValue, indexToCol, parseRange, parseRef, getRangeVals, isSpill } from "@/lib/sheets/formula";
import type { CellValue, NumberFormat, SpillResult } from "@/lib/sheets/formula";

// ─── Types ────────────────────────────────────────────────────────────────────

type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: "left" | "center" | "right" | "justify";
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  background?: string;
  format?: NumberFormat;
  decimals?: number;
  currency?: string;   // currency code for "currency" format (default USD)
  accounting?: boolean; // accounting presentation (currency + right align)
  wrap?: boolean;
  indent?: number;
  border?: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean };
};

type Cell = {
  v: string;           // raw value / formula
  s?: CellStyle;
  merged?: boolean;    // true if consumed by a merge
  mergeSpan?: { rows: number; cols: number };
  note?: string;       // cell comment / note (travels with the cell)
  spark?: Sparkline;   // inline sparkline chart definition
};

type ConditionalRule = {
  id: string;
  range: { r1: number; c1: number; r2: number; c2: number };
  type: "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "between" | "not_empty" | "contains" | "formula" | "top_n" | "bottom_n" | "aboveAvg" | "belowAvg" | "color_scale" | "data_bar";
  value?: string;
  value2?: string;
  style: Pick<CellStyle, "color" | "background" | "bold">;
};

type ChartDef = {
  id: string;
  type: "bar" | "line" | "pie" | "area" | "scatter" | "donut" | "combo" | "radar";
  title: string;
  range: string;
  hasHeader: boolean;
  colors: string[];
};

type SortRule = { col: number; dir: "asc" | "desc" };
type FilterState = Record<number, string[]>; // col → allowed values

type NumberOp = "between" | "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
type DataValidation = {
  id: string;
  range: { r1: number; c1: number; r2: number; c2: number };
  type: "list" | "number";
  values: string[];   // allowed dropdown values (list type)
  strict: boolean;    // reject values not in the list / out of range
  op?: NumberOp;      // number type: comparison operator
  min?: number;       // number type: lower bound
  max?: number;       // number type: upper bound (for "between")
};

// Sparkline definition stored per cell (renders a tiny inline chart).
type Sparkline = { range: string; mode: "bar" | "line"; color: string };

type PivotAgg = "sum" | "count" | "average" | "min" | "max";
type PivotDef = {
  id: string;
  sourceRange: string;   // e.g. "A1:D100" (first row = headers)
  rowField: number;      // column index within the range (0-based)
  colField: number | null; // optional column index for cross-tab
  valueField: number;    // column index to aggregate
  agg: PivotAgg;
};

type SheetTab = {
  id: string;
  name: string;
  cells: Record<string, Cell>;      // "r:c" → Cell
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  frozenRows: number;
  frozenCols: number;
  hiddenRows: Set<number>;
  hiddenCols: Set<number>;
  conditionalRules: ConditionalRule[];
  charts: ChartDef[];
  sortRules: SortRule[];
  filters: FilterState;
  protectedRanges: string[];
  dataValidations: DataValidation[];
  pivots: PivotDef[];
  slicers: number[];     // columns shown as interactive slicer panels
  protected?: boolean;   // whole-sheet protection (blocks all edits)
};

// WorkbookDoc type removed (unused)

const ROWS = 200;
const COLS = 26;
const DEFAULT_COL_W = 100;
const DEFAULT_ROW_H = 24;
const ROW_HEADER_W = 48;
const COL_HEADER_H = 24;

const FONTS = ["Arial", "Roboto", "Georgia", "Courier New", "Times New Roman", "Verdana"];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const CHART_COLORS = ["#1a56db", "#0f9d58", "#f4b400", "#ea4335", "#9334e6", "#00897b", "#f57c00", "#3949ab"];

// Currency options for the currency-format dropdown. "USD" is the default and
// matches formatValue()'s built-in behaviour, so it needs no override.
const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "USD", symbol: "$", label: "USD $" },
  { code: "EUR", symbol: "€", label: "EUR €" },
  { code: "GBP", symbol: "£", label: "GBP £" },
  { code: "INR", symbol: "₹", label: "INR ₹" },
  { code: "JPY", symbol: "¥", label: "JPY ¥" },
];

// ─── Helper: make a blank sheet ───────────────────────────────────────────────

function blankSheet(id: string, name: string): SheetTab {
  return {
    id, name, cells: {},
    colWidths: {}, rowHeights: {},
    frozenRows: 0, frozenCols: 0,
    hiddenRows: new Set(), hiddenCols: new Set(),
    conditionalRules: [], charts: [],
    sortRules: [], filters: {},
    protectedRanges: [],
    dataValidations: [],
    pivots: [],
    slicers: [],
    protected: false,
  };
}

// ─── Pivot aggregation (pure) ─────────────────────────────────────────────────

const PIVOT_SEP = String.fromCharCode(1); // row/col key separator (won't appear in data)

function aggregate(raw: string[], agg: PivotAgg): number {
  if (agg === "count") return raw.filter(v => v !== "" && v != null).length;
  const nums = raw.map(Number).filter(n => !isNaN(n));
  if (!nums.length) return 0;
  switch (agg) {
    case "sum": return nums.reduce((s, n) => s + n, 0);
    case "average": return nums.reduce((s, n) => s + n, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
  }
}

type PivotResult = { rowKeys: string[]; colKeys: string[]; cells: Record<string, number>; rowTotals: Record<string, number>; colTotals: Record<string, number>; grand: number };

// rows: 2D array of display strings (includes header row at index 0)
function computePivot(rows: string[][], def: PivotDef): PivotResult {
  const body = rows.slice(1); // skip header
  const rowKeysSet = new Set<string>();
  const colKeysSet = new Set<string>();
  const buckets: Record<string, string[]> = {}; // `${rowKey}${colKey}` → values

  const SEP = PIVOT_SEP;
  for (const r of body) {
    const rk = (r[def.rowField] ?? "").toString();
    const raw = (r[def.valueField] ?? "").toString();
    if (rk === "" && raw === "") continue;
    const ck2 = def.colField !== null ? (r[def.colField] ?? "").toString() : "__ALL__";
    rowKeysSet.add(rk);
    colKeysSet.add(ck2);
    (buckets[rk + SEP + ck2] ??= []).push(raw);
  }

  const rowKeys = [...rowKeysSet].sort();
  const colKeys = [...colKeysSet].sort();
  const cells: Record<string, number> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  const allByCol: Record<string, string[]> = {};
  let grandRaw: string[] = [];

  for (const rk of rowKeys) {
    let rowAll: string[] = [];
    for (const ck2 of colKeys) {
      const vals = buckets[rk + SEP + ck2] ?? [];
      cells[rk + SEP + ck2] = aggregate(vals, def.agg);
      rowAll = rowAll.concat(vals);
      (allByCol[ck2] ??= []).push(...vals);
    }
    rowTotals[rk] = aggregate(rowAll, def.agg);
    grandRaw = grandRaw.concat(rowAll);
  }
  for (const ck2 of colKeys) colTotals[ck2] = aggregate(allByCol[ck2] ?? [], def.agg);
  return { rowKeys, colKeys, cells, rowTotals, colTotals, grand: aggregate(grandRaw, def.agg) };
}

// ─── Cell key ────────────────────────────────────────────────────────────────

function ck(r: number, c: number) { return `${r}:${c}`; }

// ─── Number validation (pure) ──────────────────────────────────────────────────

function validateNumber(n: number, dv: DataValidation): boolean {
  const min = dv.min ?? -Infinity;
  const max = dv.max ?? Infinity;
  switch (dv.op ?? "between") {
    case "between": return n >= min && n <= max;
    case "gt": return n > min;
    case "lt": return n < min;
    case "gte": return n >= min;
    case "lte": return n <= min;
    case "eq": return n === min;
    case "neq": return n !== min;
    default: return true;
  }
}

// ─── A1 notation ─────────────────────────────────────────────────────────────

function toA1(row: number, col: number) { return `${indexToCol(col)}${row + 1}`; }

// ─── Fill handle series (pure) ────────────────────────────────────────────────

const MONTHS_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_ABBR = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAYS_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e9) / 1e9);
}

function detectNameSeq(last: string): { list: string[]; idx: number } | null {
  const l = last.trim().toLowerCase();
  for (const list of [MONTHS_ABBR, MONTHS_FULL, DAYS_ABBR, DAYS_FULL]) {
    const idx = list.findIndex(x => x.toLowerCase() === l);
    if (idx >= 0) return { list, idx };
  }
  return null;
}

// Continue a series from `source` for `count` more cells (Excel-style autofill).
function fillSeries(source: string[], count: number): string[] {
  const out: string[] = [];
  const n = source.length;
  if (n === 0 || count <= 0) return out;
  const nums = source.map(s => (s.trim() !== "" && !isNaN(Number(s)) ? Number(s) : NaN));
  if (nums.every(x => !isNaN(x))) {
    const step = n >= 2 ? nums[n - 1] - nums[n - 2] : 1; // single number increments by 1 (Excel default)
    let last = nums[n - 1];
    for (let k = 1; k <= count; k++) { last += step; out.push(fmtNum(last)); }
    return out;
  }
  const parsed = source.map(s => { const m = s.match(/^(.*?)(-?\d+)\s*$/); return m ? { prefix: m[1], num: parseInt(m[2], 10) } : null; });
  if (parsed.every(p => p) && new Set(parsed.map(p => p!.prefix)).size === 1) {
    const prefix = parsed[0]!.prefix;
    const pn = parsed.map(p => p!.num);
    const step = n >= 2 ? pn[n - 1] - pn[n - 2] : 1; // "Item 1" -> Item 2, Item 3...
    let last = pn[n - 1];
    for (let k = 1; k <= count; k++) { last += step; out.push(prefix + last); }
    return out;
  }
  const seq = detectNameSeq(source[n - 1]);
  if (seq) { let cur = seq.idx; for (let k = 1; k <= count; k++) { cur = (cur + 1) % seq.list.length; out.push(seq.list[cur]); } return out; }
  for (let k = 0; k < count; k++) out.push(source[k % n]);
  return out;
}

// ─── Serialize Set for JSON ───────────────────────────────────────────────────

function serializeSheet(s: SheetTab): object {
  return {
    ...s,
    hiddenRows: [...s.hiddenRows],
    hiddenCols: [...s.hiddenCols],
  };
}

function deserializeSheet(raw: Record<string, unknown>): SheetTab {
  return {
    ...blankSheet(raw.id as string, raw.name as string),
    ...(raw as Partial<SheetTab>),
    hiddenRows: new Set((raw.hiddenRows as number[]) ?? []),
    hiddenCols: new Set((raw.hiddenCols as number[]) ?? []),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SheetsEditor({ sheetId }: { sheetId: string }) {
  const _uid = useId();
  const router = useRouter();

  // ── Document state ───────────────────────────────────────────────────────
  const [title, setTitle] = useState("Untitled Spreadsheet");
  const [sheets, setSheets] = useState<SheetTab[]>([blankSheet("s1", "Sheet 1")]);
  const [activeSheetId, setActiveSheetId] = useState("s1");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Named ranges (workbook-level) ────────────────────────────────────────
  const [namedRanges, setNamedRanges] = useState<Record<string, string>>({});
  const namedRangesRef = useRef<Record<string, string>>({});
  namedRangesRef.current = namedRanges;

  // ── Selection / editing ──────────────────────────────────────────────────
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [selEnd, setSelEnd] = useState<{ r: number; c: number } | null>(null);
  const [fillDrag, setFillDrag] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const [fillTo, setFillTo] = useState<{ r: number; c: number } | null>(null);
  const selecting = useRef(false);
  const didDrag = useRef(false); // true when mouse moved to a different cell during a drag
  const selRef = useRef<{ r: number; c: number }>({ r: 0, c: 0 }); // always mirrors sel for closures
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const [formulaBarVal, setFormulaBarVal] = useState("");

  // ── History (undo/redo) ──────────────────────────────────────────────────
  const history = useRef<SheetTab[][]>([]);
  const historyIdx = useRef(-1);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [showShare, setShowShare] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showCF, setShowCF] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showPivot, setShowPivot] = useState(false);
  const [cellCtx, setCellCtx] = useState<{ x: number; y: number; r: number; c: number } | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showRemoveDupes, setShowRemoveDupes] = useState(false);
  const [showSplitText, setShowSplitText] = useState(false);
  // Format painter: stores the copied style and arms the next-click apply.
  const [painterStyle, setPainterStyle] = useState<CellStyle | null>(null);
  const [dvDropdown, setDvDropdown] = useState<{ r: number; c: number; values: string[] } | null>(null);
  const [filterCol, setFilterCol] = useState<number | null>(null);
  const [editingSheetName, setEditingSheetName] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [colorPickerTarget, setColorPickerTarget] = useState<"text" | "bg" | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [freezeMenuOpen, setFreezeMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [borderMenuOpen, setBorderMenuOpen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  // sheetActive: true after user first clicks a cell — enables global arrow key handler
  const sheetActive = useRef(false);
  // editingRef: mirrors editing state for use in empty-dep closures
  const editingRef = useRef(false);
  // fillDragRef: mirrors fillDrag state for use in empty-dep closures
  const fillDragRef = useRef<{ r1: number; c1: number; r2: number; c2: number } | null>(null);

  const activeSheet = sheets.find(s => s.id === activeSheetId) ?? sheets[0];

  // ── Spill map — computed once per activeSheet change ────────────────────
  // Maps "r:c" → spilled CellValue for non-anchor cells; anchors tracked separately.
  const spillMapRef = useRef<Map<string, CellValue>>(new Map());
  const spillAnchorsRef = useRef<Set<string>>(new Set());
  useMemo(() => {
    const map = new Map<string, CellValue>();
    const anchors = new Set<string>();
    const names = namedRangesRef.current;
    const cells = activeSheet.cells;
    const simpleGet = (r: number, c: number): CellValue => {
      const cell = cells[ck(r, c)];
      if (!cell?.v || cell.v.startsWith("=")) return null;
      return isNaN(Number(cell.v)) ? cell.v : Number(cell.v);
    };
    for (const key of Object.keys(cells)) {
      const cell = cells[key];
      if (!cell?.v?.startsWith("=")) continue;
      const [rs, cs] = key.split(":").map(Number);
      const result = evaluateFormula(cell.v, simpleGet, names);
      if (!isSpill(result)) continue;
      anchors.add(key);
      (result as SpillResult).values.forEach((row, dr) => {
        row.forEach((val, dc) => {
          if (dr === 0 && dc === 0) return; // anchor cell handled by getCellDisplayValue
          map.set(ck(rs + dr, cs + dc), val);
        });
      });
    }
    spillMapRef.current = map;
    spillAnchorsRef.current = anchors;
  }, [activeSheet.cells, activeSheet.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compute cell value ───────────────────────────────────────────────────
  const computeCell = useCallback((raw: string, sheet: SheetTab): CellValue => {
    if (!raw.startsWith("=")) return raw === "" ? null : isNaN(Number(raw)) ? raw : Number(raw);
    const names = namedRangesRef.current;
    const result = evaluateFormula(raw, (r, c) => {
      const cell = sheet.cells[ck(r, c)];
      if (!cell?.v) return null;
      if (cell.v.startsWith("=")) {
        const inner = evaluateFormula(cell.v, (r2, c2) => {
          const c2ell = sheet.cells[ck(r2, c2)];
          return c2ell?.v ? (c2ell.v.startsWith("=") ? null : (isNaN(Number(c2ell.v)) ? c2ell.v : Number(c2ell.v))) : null;
        }, names);
        return isSpill(inner) ? (inner.values[0]?.[0] ?? null) : inner;
      }
      return isNaN(Number(cell.v)) ? cell.v : Number(cell.v);
    }, names);
    if (isSpill(result)) return result.values[0]?.[0] ?? null;
    return result;
  }, []);

  const getCellDisplayValue = useCallback((r: number, c: number, sheet: SheetTab): string => {
    // Non-anchor spill cells: return value from spillMap
    const spillVal = spillMapRef.current.get(ck(r, c));
    if (spillVal !== undefined) return formatValue(spillVal, "general", 2);

    const cell = sheet.cells[ck(r, c)];
    if (!cell?.v) return "";

    // Anchor spill cell: evaluate formula directly and return [0][0]
    if (cell.v.startsWith("=") && spillAnchorsRef.current.has(ck(r, c))) {
      const names = namedRangesRef.current;
      const result = evaluateFormula(cell.v, (rr, cc) => {
        const sc = sheet.cells[ck(rr, cc)];
        if (!sc?.v || sc.v.startsWith("=")) return null;
        return isNaN(Number(sc.v)) ? sc.v : Number(sc.v);
      }, names);
      if (isSpill(result)) return formatValue(result.values[0]?.[0] ?? null, cell.s?.format ?? "general", cell.s?.decimals ?? 2);
    }

    const val = computeCell(cell.v, sheet);
    if (val === null) return "";
    const fmt = cell.s?.format ?? "general";
    const dec = cell.s?.decimals ?? 2;
    // Currency with a non-USD code: format directly with Intl so the right
    // symbol/grouping is used. formatValue() hardcodes USD, so we only override
    // when a different currency is chosen — default USD behaviour is unchanged.
    if (fmt === "currency") {
      const code = cell.s?.currency ?? "USD";
      if (code !== "USD" && typeof val === "number") {
        try {
          return val.toLocaleString(undefined, { style: "currency", currency: code, minimumFractionDigits: dec, maximumFractionDigits: dec });
        } catch {
          // Fall through to default formatting on any invalid code.
        }
      }
    }
    return formatValue(val, fmt, dec);
  }, [computeCell]);

  // ── Load document ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/sheets/${sheetId}`)
      .then(r => r.json())
      .then((data: { title?: string; content?: string }) => {
        if (data.title) setTitle(data.title);
        if (data.content) {
          try {
            const wb = JSON.parse(data.content) as { sheets?: unknown[]; namedRanges?: Record<string, string> };
            if (wb.sheets?.length) setSheets((wb.sheets as Record<string, unknown>[]).map(deserializeSheet));
            if (wb.namedRanges) setNamedRanges(wb.namedRanges);
          } catch { /* fresh sheet */ }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [sheetId]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((sheetsToSave: SheetTab[], titleToSave: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/sheets/${sheetId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleToSave,
            content: JSON.stringify({ sheets: sheetsToSave.map(serializeSheet), namedRanges: namedRangesRef.current }),
          }),
        });
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, [sheetId]);

  // ── History helpers ───────────────────────────────────────────────────────
  const pushHistory = useCallback((s: SheetTab[]) => {
    const snapshot = s.map(sh => ({ ...sh, cells: { ...sh.cells } }));
    history.current = history.current.slice(0, historyIdx.current + 1);
    history.current.push(snapshot);
    historyIdx.current = history.current.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIdx.current <= 0) return;
    historyIdx.current--;
    setSheets(history.current[historyIdx.current]);
  }, []);

  const redo = useCallback(() => {
    if (historyIdx.current >= history.current.length - 1) return;
    historyIdx.current++;
    setSheets(history.current[historyIdx.current]);
  }, []);

  // ── Update a cell ─────────────────────────────────────────────────────────
  const updateCell = useCallback((r: number, c: number, value: string, sid = activeSheetId) => {
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== sid) return sh;
        const newCells = { ...sh.cells };
        if (value === "") {
          delete newCells[ck(r, c)];
        } else {
          newCells[ck(r, c)] = { ...newCells[ck(r, c)], v: value };
        }
        return { ...sh, cells: newCells };
      });
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
  }, [activeSheetId, pushHistory, scheduleSave, title]);

  // ── Fill handle (drag to autofill) ────────────────────────────────────────
  const startFill = useCallback(() => {
    const r1 = selEnd ? Math.min(sel.r, selEnd.r) : sel.r;
    const r2 = selEnd ? Math.max(sel.r, selEnd.r) : sel.r;
    const c1 = selEnd ? Math.min(sel.c, selEnd.c) : sel.c;
    const c2 = selEnd ? Math.max(sel.c, selEnd.c) : sel.c;
    setFillDrag({ r1, c1, r2, c2 });
    setFillTo({ r: r2, c: c2 });
  }, [sel, selEnd]);

  const applyFill = useCallback((src: { r1: number; c1: number; r2: number; c2: number }, to: { r: number; c: number }) => {
    const downExtent = Math.max(0, to.r - src.r2);
    const rightExtent = Math.max(0, to.c - src.c2);
    if (downExtent === 0 && rightExtent === 0) return;
    const vertical = downExtent >= rightExtent;
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        const raw = (r: number, c: number) => cells[ck(r, c)]?.v ?? "";
        const srcStyle = (r: number, c: number) => cells[ck(r, c)]?.s;
        if (vertical) {
          for (let c = src.c1; c <= src.c2; c++) {
            const source: string[] = [];
            for (let r = src.r1; r <= src.r2; r++) source.push(raw(r, c));
            // Single-cell source: extend upward over the contiguous filled run so a
            // series like 1,2,3 is detected (Google-Sheets-style autofill).
            if (src.r1 === src.r2) {
              const run: string[] = [];
              let rr = src.r1 - 1;
              while (rr >= 0 && raw(rr, c) !== "" && run.length < 200) { run.unshift(raw(rr, c)); rr--; }
              for (let i = run.length - 1; i >= 0; i--) source.unshift(run[i]);
            }
            const filled = fillSeries(source, downExtent);
            const baseStyle = srcStyle(src.r2, c);
            filled.forEach((v, i) => {
              const rr = src.r2 + 1 + i;
              if (v === "") delete cells[ck(rr, c)];
              else cells[ck(rr, c)] = { ...(baseStyle ? { s: baseStyle } : {}), v };
            });
          }
        } else {
          for (let r = src.r1; r <= src.r2; r++) {
            const source: string[] = [];
            for (let c = src.c1; c <= src.c2; c++) source.push(raw(r, c));
            if (src.c1 === src.c2) {
              const run: string[] = [];
              let cc = src.c1 - 1;
              while (cc >= 0 && raw(r, cc) !== "" && run.length < 200) { run.unshift(raw(r, cc)); cc--; }
              for (let i = run.length - 1; i >= 0; i--) source.unshift(run[i]);
            }
            const filled = fillSeries(source, rightExtent);
            const baseStyle = srcStyle(r, src.c2);
            filled.forEach((v, i) => {
              const cc = src.c2 + 1 + i;
              if (v === "") delete cells[ck(r, cc)];
              else cells[ck(r, cc)] = { ...(baseStyle ? { s: baseStyle } : {}), v };
            });
          }
        }
        return { ...sh, cells };
      });
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
    // extend the selection over the filled region
    if (vertical) { setSel({ r: src.r1, c: src.c1 }); setSelEnd({ r: to.r, c: src.c2 }); }
    else { setSel({ r: src.r1, c: src.c1 }); setSelEnd({ r: src.r2, c: to.c }); }
  }, [activeSheetId, pushHistory, scheduleSave, title]);

  // Global mouseup ends a fill drag and applies it.
  useEffect(() => {
    if (!fillDrag) return;
    const onUp = () => {
      if (fillDrag && fillTo) applyFill(fillDrag, fillTo);
      setFillDrag(null);
      setFillTo(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [fillDrag, fillTo, applyFill]);

  // End a drag-selection on mouseup anywhere.
  useEffect(() => {
    const onUp = () => { selecting.current = false; };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Global mousemove: reliable drag-select via elementFromPoint.
  // More robust than the grid container's onMouseMove because it works even during
  // fast drags (where onMouseEnter per-cell misses cells) and outside the grid boundary.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!selecting.current && !fillDragRef.current) return;
      let node = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      while (node) {
        const cr = node.dataset?.cellrow;
        const cc = node.dataset?.cellcol;
        if (cr !== undefined && cc !== undefined) {
          const rr = Number(cr); const ccn = Number(cc);
          if (fillDragRef.current) {
            setFillTo(prev => (!prev || prev.r !== rr || prev.c !== ccn) ? { r: rr, c: ccn } : prev);
          } else if (selecting.current) {
            setSelEnd(prev => (!prev || prev.r !== rr || prev.c !== ccn) ? { r: rr, c: ccn } : prev);
            didDrag.current = true;
          }
          return;
        }
        node = node.parentElement;
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // ── Clipboard: copy / paste / cut a range (TSV, Excel-compatible) ──────────
  const selRect = useCallback(() => ({
    r1: selEnd ? Math.min(sel.r, selEnd.r) : sel.r,
    r2: selEnd ? Math.max(sel.r, selEnd.r) : sel.r,
    c1: selEnd ? Math.min(sel.c, selEnd.c) : sel.c,
    c2: selEnd ? Math.max(sel.c, selEnd.c) : sel.c,
  }), [sel, selEnd]);

  const copySelection = useCallback(async () => {
    const { r1, r2, c1, c2 } = selRect();
    const lines: string[] = [];
    for (let r = r1; r <= r2; r++) {
      const cols: string[] = [];
      for (let c = c1; c <= c2; c++) cols.push(activeSheet.cells[ck(r, c)]?.v ?? "");
      lines.push(cols.join("\t"));
    }
    try { await navigator.clipboard.writeText(lines.join("\n")); } catch { /* clipboard blocked */ }
  }, [selRect, activeSheet]);

  const pasteFromClipboard = useCallback(async () => {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { toast.error("Clipboard access blocked"); return; }
    if (!text) return;
    const grid = text.replace(/\r/g, "").split("\n").map(l => l.split("\t"));
    if (grid.length > 1 && grid[grid.length - 1].length === 1 && grid[grid.length - 1][0] === "") grid.pop();
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        grid.forEach((cols, dr) => cols.forEach((v, dc) => {
          const rr = sel.r + dr, cc = sel.c + dc;
          if (rr >= ROWS || cc >= COLS) return;
          if (v === "") delete cells[ck(rr, cc)];
          else cells[ck(rr, cc)] = { ...cells[ck(rr, cc)], v };
        }));
        return { ...sh, cells };
      });
      pushHistory(next); scheduleSave(next, title); return next;
    });
    const h = grid.length, w = Math.max(...grid.map(g => g.length));
    setSelEnd({ r: Math.min(ROWS - 1, sel.r + h - 1), c: Math.min(COLS - 1, sel.c + w - 1) });
  }, [sel, activeSheetId, pushHistory, scheduleSave, title]);

  const cutSelection = useCallback(async () => {
    await copySelection();
    const { r1, r2, c1, c2 } = selRect();
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) delete cells[ck(r, c)];
        return { ...sh, cells };
      });
      pushHistory(next); scheduleSave(next, title); return next;
    });
  }, [copySelection, selRect, activeSheetId, pushHistory, scheduleSave, title]);

  // ── Cell borders ───────────────────────────────────────────────────────────
  const applyBorders = useCallback((kind: "all" | "outer" | "top" | "bottom" | "left" | "right" | "none") => {
    const { r1, r2, c1, c2 } = selRect();
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
          const k = ck(r, c);
          const ps = cells[k]?.s ?? {};
          let b = { ...(ps.border ?? {}) };
          if (kind === "none") b = {};
          else if (kind === "all") b = { top: true, bottom: true, left: true, right: true };
          else if (kind === "outer") b = { top: r === r1 ? true : b.top, bottom: r === r2 ? true : b.bottom, left: c === c1 ? true : b.left, right: c === c2 ? true : b.right };
          else if (kind === "top" && r === r1) b.top = true;
          else if (kind === "bottom" && r === r2) b.bottom = true;
          else if (kind === "left" && c === c1) b.left = true;
          else if (kind === "right" && c === c2) b.right = true;
          const hasB = b.top || b.bottom || b.left || b.right;
          cells[k] = { ...cells[k], v: cells[k]?.v ?? "", s: { ...ps, border: hasB ? b : undefined } };
        }
        return { ...sh, cells };
      });
      pushHistory(next); scheduleSave(next, title); return next;
    });
    setBorderMenuOpen(false);
  }, [selRect, activeSheetId, pushHistory, scheduleSave, title]);

  // ── Apply style to selection ──────────────────────────────────────────────
  const applyStyle = useCallback((stylePatch: Partial<CellStyle>) => {
    const r1 = selEnd ? Math.min(sel.r, selEnd.r) : sel.r;
    const r2 = selEnd ? Math.max(sel.r, selEnd.r) : sel.r;
    const c1 = selEnd ? Math.min(sel.c, selEnd.c) : sel.c;
    const c2 = selEnd ? Math.max(sel.c, selEnd.c) : sel.c;

    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const newCells = { ...sh.cells };
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            const k = ck(r, c);
            newCells[k] = { ...newCells[k], s: { ...newCells[k]?.s, ...stylePatch } };
          }
        }
        return { ...sh, cells: newCells };
      });
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
  }, [sel, selEnd, activeSheetId, pushHistory, scheduleSave, title]);

  // ── Find & Replace ─────────────────────────────────────────────────────────
  // Match a raw cell value against the find term, respecting case / whole-cell options.
  const matchCell = useCallback((raw: string, find: string, matchCase: boolean, wholeCell: boolean): boolean => {
    if (find === "") return false;
    const hay = matchCase ? raw : raw.toLowerCase();
    const needle = matchCase ? find : find.toLowerCase();
    return wholeCell ? hay === needle : hay.includes(needle);
  }, []);

  // Count cells that match (for the dialog's live count).
  const countMatches = useCallback((find: string, matchCase: boolean, wholeCell: boolean): number => {
    if (find === "") return 0;
    let n = 0;
    for (const cell of Object.values(activeSheet.cells)) {
      if (cell?.v && matchCell(cell.v, find, matchCase, wholeCell)) n++;
    }
    return n;
  }, [activeSheet, matchCell]);

  // Select the next matching cell after the current selection (scanning row-major, wrapping).
  const findNext = useCallback((find: string, matchCase: boolean, wholeCell: boolean): boolean => {
    if (find === "") return false;
    const start = sel.r * COLS + sel.c;
    for (let i = 1; i <= ROWS * COLS; i++) {
      const idx = (start + i) % (ROWS * COLS);
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      const cell = activeSheet.cells[ck(r, c)];
      if (cell?.v && matchCell(cell.v, find, matchCase, wholeCell)) {
        setSel({ r, c });
        setSelEnd(null);
        gridRef.current?.scrollTo({ top: Math.max(0, r * DEFAULT_ROW_H - 100), behavior: "smooth" });
        return true;
      }
    }
    return false;
  }, [sel, activeSheet, matchCell]);

  // Replace the value of the currently-selected cell if it matches.
  const replaceCurrent = useCallback((find: string, replace: string, matchCase: boolean, wholeCell: boolean): boolean => {
    const cell = activeSheet.cells[ck(sel.r, sel.c)];
    if (!cell?.v || !matchCell(cell.v, find, matchCase, wholeCell)) return false;
    let next: string;
    if (wholeCell) {
      next = replace;
    } else if (matchCase) {
      next = cell.v.split(find).join(replace);
    } else {
      const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      next = cell.v.replace(re, replace);
    }
    updateCell(sel.r, sel.c, next);
    return true;
  }, [sel, activeSheet, matchCell, updateCell]);

  // Replace every matching cell across the active sheet in one batch.
  const replaceAll = useCallback((find: string, replace: string, matchCase: boolean, wholeCell: boolean): number => {
    if (find === "") return 0;
    let count = 0;
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const newCells = { ...sh.cells };
        const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
        for (const [k, cell] of Object.entries(sh.cells)) {
          if (!cell?.v || !matchCell(cell.v, find, matchCase, wholeCell)) continue;
          const newVal = wholeCell ? replace : cell.v.replace(re, replace);
          count++;
          if (newVal === "") delete newCells[k];
          else newCells[k] = { ...cell, v: newVal };
        }
        return { ...sh, cells: newCells };
      });
      if (count > 0) { pushHistory(next); scheduleSave(next, title); }
      return next;
    });
    return count;
  }, [activeSheetId, matchCell, pushHistory, scheduleSave, title]);

  // ── Format painter ─────────────────────────────────────────────────────────
  // Arm: copy current cell's style. Apply on the next selection, then disarm.
  const armPainter = useCallback(() => {
    if (painterStyle) { setPainterStyle(null); return; }
    const s = activeSheet.cells[ck(sel.r, sel.c)]?.s;
    if (!s || Object.keys(s).length === 0) { toast.error("Selected cell has no formatting to copy"); return; }
    setPainterStyle({ ...s });
    toast.success("Format painter armed — click a cell or range to apply");
  }, [painterStyle, activeSheet, sel]);

  const applyPainterTo = useCallback((r1: number, c1: number, r2: number, c2: number, style: CellStyle) => {
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const newCells = { ...sh.cells };
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
          for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
            const k = ck(r, c);
            newCells[k] = { ...newCells[k], v: newCells[k]?.v ?? "", s: { ...style } };
          }
        }
        return { ...sh, cells: newCells };
      });
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
  }, [activeSheetId, pushHistory, scheduleSave, title]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const focusGrid = useCallback(() => { gridRef.current?.focus(); }, []);

  // Global arrow-key handler. Uses sheetActive ref so it works regardless of DOM focus state.
  // Guards: not editing, sheet was interacted with, no text input focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) return;
      if (!sheetActive.current) return;
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) return;
      // Skip if a real text input (formula bar, find box, modal input) currently has focus
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (e.shiftKey) {
        setSelEnd(prev => {
          const base = prev ?? selRef.current;
          return { r: Math.max(0, Math.min(ROWS - 1, base.r + dr)), c: Math.max(0, Math.min(COLS - 1, base.c + dc)) };
        });
      } else {
        setSel(s => ({ r: Math.max(0, Math.min(ROWS - 1, s.r + dr)), c: Math.max(0, Math.min(COLS - 1, s.c + dc)) }));
        setSelEnd(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleGridKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "h" || e.key === "H") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); setShowFindReplace(true); return;
    }
    if (editing) return; // the cell input handles its own keys (and stops propagation)
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      setSel(s => ({ r: Math.max(0, Math.min(ROWS - 1, s.r + dr)), c: Math.max(0, Math.min(COLS - 1, s.c + dc)) }));
      setSelEnd(null);
    };
    const arrowKeys = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"];
    if (arrowKeys.includes(e.key)) {
      const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (e.shiftKey) {
        e.preventDefault();
        setSelEnd(prev => {
          const base = prev ?? selRef.current;
          return { r: Math.max(0, Math.min(ROWS - 1, base.r + dr)), c: Math.max(0, Math.min(COLS - 1, base.c + dc)) };
        });
      } else { move(dr, dc); }
    }
    else if (e.key === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Enter") move(1, 0);
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault(); updateCell(sel.r, sel.c, "");
    } else if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); if (e.shiftKey) redo(); else undo();
    } else if (e.key === "c" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); void copySelection();
    } else if (e.key === "v" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); void pasteFromClipboard();
    } else if (e.key === "x" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); void cutSelection();
    } else if ((e.key === "b" || e.key === "i" || e.key === "u") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const cur = activeSheet.cells[ck(sel.r, sel.c)]?.s ?? {};
      if (e.key === "b") applyStyle({ bold: !cur.bold });
      else if (e.key === "i") applyStyle({ italic: !cur.italic });
      else applyStyle({ underline: !cur.underline });
    } else if (e.key === "F2") {
      const cell = activeSheet.cells[ck(sel.r, sel.c)];
      setEditVal(cell?.v ?? "");
      setEditing(true);
      setTimeout(() => cellInputRef.current?.focus(), 0);
    } else if (!e.metaKey && !e.ctrlKey && e.key.length === 1) {
      setEditVal(e.key);
      setEditing(true);
      setTimeout(() => cellInputRef.current?.focus(), 0);
    }
  }, [editing, sel, activeSheet, updateCell, undo, redo, copySelection, pasteFromClipboard, cutSelection, applyStyle]);

  // Keep selRef in sync (used by global keydown listener closure)
  useEffect(() => { selRef.current = sel; }, [sel]);
  // Keep editingRef and fillDragRef in sync for empty-dep closure use
  useEffect(() => { editingRef.current = editing; }, [editing]);
  useEffect(() => { fillDragRef.current = fillDrag; }, [fillDrag]);

  // Update formula bar on selection change
  useEffect(() => {
    const cell = activeSheet.cells[ck(sel.r, sel.c)];
    setFormulaBarVal(cell?.v ?? "");
  }, [sel, activeSheet]);

  // ── Commit edit ──────────────────────────────────────────────────────────
  const isProtected = useCallback((r: number, c: number): boolean => {
    for (const rangeStr of activeSheet.protectedRanges ?? []) {
      const pr = parseRange(rangeStr);
      if (pr && r >= pr.startRow && r <= pr.endRow && c >= pr.startCol && c <= pr.endCol) return true;
    }
    return false;
  }, [activeSheet]);

  const commitEdit = useCallback((moveDir: "down" | "right" | "none" = "down") => {
    if (activeSheet.protected) {
      toast.error("This sheet is protected");
      setEditing(false); focusGrid(); return;
    }
    if (isProtected(sel.r, sel.c)) {
      toast.error("This cell is in a protected range");
      setEditing(false); focusGrid(); return;
    }
    // Enforce strict validation on the cell, if any.
    const dv = (activeSheet.dataValidations ?? []).find(d =>
      sel.r >= d.range.r1 && sel.r <= d.range.r2 && sel.c >= d.range.c1 && sel.c <= d.range.c2);
    if (dv && dv.strict && editVal !== "" && !editVal.startsWith("=")) {
      if (dv.type === "list" && !dv.values.includes(editVal)) {
        toast.error(`"` + editVal + `" is not an allowed value`);
        return; // keep editing
      }
      if (dv.type === "number") {
        const n = Number(editVal);
        const okNum = !isNaN(n) && validateNumber(n, dv);
        if (!okNum) {
          toast.error(`"` + editVal + `" is out of the allowed range`);
          return; // keep editing
        }
      }
    }
    updateCell(sel.r, sel.c, editVal);
    setEditing(false);
    if (moveDir === "down") setSel(s => ({ r: Math.min(ROWS - 1, s.r + 1), c: s.c }));
    else if (moveDir === "right") setSel(s => ({ r: s.r, c: Math.min(COLS - 1, s.c + 1) }));
    focusGrid();
  }, [sel, editVal, updateCell, activeSheet, focusGrid, isProtected]);

  // ── Add / remove sheet ────────────────────────────────────────────────────
  const addSheet = () => {
    const id = `s${Date.now()}`;
    const name = `Sheet ${sheets.length + 1}`;
    const next = [...sheets, blankSheet(id, name)];
    setSheets(next);
    setActiveSheetId(id);
    scheduleSave(next, title);
  };

  const deleteSheet = (id: string) => {
    if (sheets.length === 1) return toast.error("Can't delete the last sheet");
    const next = sheets.filter(s => s.id !== id);
    setSheets(next);
    if (activeSheetId === id) setActiveSheetId(next[0].id);
    scheduleSave(next, title);
  };

  // ── Insert / delete rows & columns (remap cell keys) ───────────────────────
  const remapCells = useCallback((mapFn: (r: number, c: number) => { r: number; c: number } | null) => {
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells: Record<string, Cell> = {};
        for (const [k, v] of Object.entries(sh.cells)) {
          const [r, c] = k.split(":").map(Number);
          const m = mapFn(r, c);
          if (m && m.r >= 0 && m.r < ROWS && m.c >= 0 && m.c < COLS) cells[ck(m.r, m.c)] = v;
        }
        return { ...sh, cells };
      });
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
  }, [activeSheetId, pushHistory, scheduleSave, title]);

  const insertRow = useCallback((at: number) => remapCells((r, c) => ({ r: r >= at ? r + 1 : r, c })), [remapCells]);
  const deleteRowAt = useCallback((at: number) => remapCells((r, c) => r === at ? null : ({ r: r > at ? r - 1 : r, c })), [remapCells]);
  const insertCol = useCallback((at: number) => remapCells((r, c) => ({ r, c: c >= at ? c + 1 : c })), [remapCells]);
  const deleteColAt = useCallback((at: number) => remapCells((r, c) => c === at ? null : ({ r, c: c > at ? c - 1 : c })), [remapCells]);

  // ── Protected ranges ───────────────────────────────────────────────────────
  const protectSelection = useCallback(() => {
    const r1 = selEnd ? Math.min(sel.r, selEnd.r) : sel.r;
    const r2 = selEnd ? Math.max(sel.r, selEnd.r) : sel.r;
    const c1 = selEnd ? Math.min(sel.c, selEnd.c) : sel.c;
    const c2 = selEnd ? Math.max(sel.c, selEnd.c) : sel.c;
    const a1 = toA1(r1, c1) + ":" + toA1(r2, c2);
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId ? { ...sh, protectedRanges: [...(sh.protectedRanges ?? []), a1] } : sh);
      scheduleSave(next, title); return next;
    });
    toast.success("Range protected");
  }, [sel, selEnd, activeSheetId, scheduleSave, title]);

  const unprotectAt = useCallback((r: number, c: number) => {
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const kept = (sh.protectedRanges ?? []).filter(rs => {
          const pr = parseRange(rs);
          return !(pr && r >= pr.startRow && r <= pr.endRow && c >= pr.startCol && c <= pr.endCol);
        });
        return { ...sh, protectedRanges: kept };
      });
      scheduleSave(next, title); return next;
    });
    toast.success("Range unprotected");
  }, [activeSheetId, scheduleSave, title]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortByCol = (col: number, dir: "asc" | "desc") => {
    setSheets(prev => prev.map(sh => {
      if (sh.id !== activeSheetId) return sh;
      // Determine data rows (skip header row 0)
      const rowData: Array<Record<number, Cell>> = [];
      for (let r = 1; r < ROWS; r++) {
        const row: Record<number, Cell> = {};
        let hasData = false;
        for (let c = 0; c < COLS; c++) {
          const cell = sh.cells[ck(r, c)];
          if (cell) { row[c] = cell; hasData = true; }
        }
        if (hasData) rowData.push(row);
      }
      rowData.sort((a, b) => {
        const va = computeCell(a[col]?.v ?? "", sh);
        const vb = computeCell(b[col]?.v ?? "", sh);
        const sa = String(va ?? ""), sb = String(vb ?? "");
        const na = Number(va), nb = Number(vb);
        const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : sa.localeCompare(sb);
        return dir === "desc" ? -cmp : cmp;
      });
      const newCells = { ...sh.cells };
      // Clear and rewrite
      for (let r = 1; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) delete newCells[ck(r, c)];
      rowData.forEach((row, r) => {
        Object.entries(row).forEach(([c, cell]) => { newCells[ck(r + 1, Number(c))] = cell; });
      });
      return { ...sh, cells: newCells };
    }));
    setSortMenuOpen(false);
    toast.success(`Sorted by ${indexToCol(col)} ${dir === "asc" ? "A→Z" : "Z→A"}`);
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const getUniqueColValues = (col: number) => {
    const vals = new Set<string>();
    for (let r = 1; r < ROWS; r++) {
      const v = getCellDisplayValue(r, col, activeSheet);
      if (v) vals.add(v);
    }
    return [...vals].sort();
  };

  const isRowHiddenByFilter = (row: number): boolean => {
    for (const [colStr, allowed] of Object.entries(activeSheet.filters)) {
      if (!allowed.length) continue;
      const val = getCellDisplayValue(row, Number(colStr), activeSheet);
      if (!allowed.includes(val)) return true;
    }
    return false;
  };

  // ── Conditional formatting ────────────────────────────────────────────────
  const getCFStyle = useCallback((r: number, c: number, sheet: SheetTab): Partial<CellStyle> => {
    const val = computeCell(sheet.cells[ck(r, c)]?.v ?? "", sheet);
    const num = Number(val);
    for (const rule of sheet.conditionalRules) {
      if (r < rule.range.r1 || r > rule.range.r2 || c < rule.range.c1 || c > rule.range.c2) continue;
      const v = Number(rule.value);
      let match = false;
      switch (rule.type) {
        case "gt": match = !isNaN(num) && num > v; break;
        case "lt": match = !isNaN(num) && num < v; break;
        case "gte": match = !isNaN(num) && num >= v; break;
        case "lte": match = !isNaN(num) && num <= v; break;
        case "eq": match = String(val).toLowerCase() === (rule.value ?? "").toLowerCase(); break;
        case "neq": match = String(val).toLowerCase() !== (rule.value ?? "").toLowerCase(); break;
        case "not_empty": match = val !== null && val !== ""; break;
        case "contains": match = String(val).toLowerCase().includes((rule.value ?? "").toLowerCase()); break;
        case "formula": break; // not evaluated client-side
        case "between": match = !isNaN(num) && num >= v && num <= Number(rule.value2); break;
        case "aboveAvg": {
          const avNums = Object.keys(sheet.cells)
            .filter(k => { const [rr, cc] = k.split(":").map(Number); return rr >= rule.range.r1 && rr <= rule.range.r2 && cc >= rule.range.c1 && cc <= rule.range.c2; })
            .map(k => Number(computeCell(sheet.cells[k]?.v ?? "", sheet))).filter(n => !isNaN(n));
          const avg2 = avNums.length ? avNums.reduce((s, n) => s + n, 0) / avNums.length : 0;
          match = !isNaN(num) && num > avg2;
          break;
        }
        case "belowAvg": {
          const avNums2 = Object.keys(sheet.cells)
            .filter(k => { const [rr, cc] = k.split(":").map(Number); return rr >= rule.range.r1 && rr <= rule.range.r2 && cc >= rule.range.c1 && cc <= rule.range.c2; })
            .map(k => Number(computeCell(sheet.cells[k]?.v ?? "", sheet))).filter(n => !isNaN(n));
          const avg3 = avNums2.length ? avNums2.reduce((s, n) => s + n, 0) / avNums2.length : 0;
          match = !isNaN(num) && num < avg3;
          break;
        }
        case "top_n": {
          const rangeVals = getRangeVals(`${indexToCol(rule.range.c1)}${rule.range.r1 + 1}:${indexToCol(rule.range.c2)}${rule.range.r2 + 1}`, (rr, cc) => {
            const cell = sheet.cells[ck(rr, cc)];
            return cell?.v ? computeCell(cell.v, sheet) : null;
          }).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
          match = !isNaN(num) && rangeVals.slice(0, v).includes(num);
          break;
        }
        case "color_scale": {
          const rangeNums = Object.keys(sheet.cells)
            .filter(k => {
              const [rr, cc] = k.split(":").map(Number);
              return rr >= rule.range.r1 && rr <= rule.range.r2 && cc >= rule.range.c1 && cc <= rule.range.c2;
            })
            .map(k => Number(computeCell(sheet.cells[k]?.v ?? "", sheet))).filter(n => !isNaN(n));
          if (rangeNums.length === 0 || isNaN(num)) break;
          const mn = Math.min(...rangeNums), mx = Math.max(...rangeNums);
          const pct = mx === mn ? 0.5 : (num - mn) / (mx - mn);
          const r2 = Math.round(255 * pct), g = Math.round(255 * (1 - pct));
          return { background: `rgb(${r2},${g},0)`, color: "#fff" };
        }
        case "data_bar": {
          const rangeNums = Object.keys(sheet.cells)
            .filter(k => {
              const [rr, cc] = k.split(":").map(Number);
              return rr >= rule.range.r1 && rr <= rule.range.r2 && cc >= rule.range.c1 && cc <= rule.range.c2;
            })
            .map(k => Number(computeCell(sheet.cells[k]?.v ?? "", sheet))).filter(n => !isNaN(n));
          if (rangeNums.length === 0 || isNaN(num)) break;
          const mn = Math.min(0, ...rangeNums), mx = Math.max(...rangeNums);
          const pct = mx === mn ? 0 : Math.max(0, Math.min(1, (num - mn) / (mx - mn)));
          const w = Math.round(pct * 100);
          return { background: "linear-gradient(to right, #9ec5fe " + w + "%, transparent " + w + "%)" };
        }
      }
      if (match) return rule.style;
    }
    return {};
  }, [computeCell]);

  // ── Data validation lookup ────────────────────────────────────────────────
  const getCellValidation = useCallback((r: number, c: number): DataValidation | null => {
    for (const dv of activeSheet.dataValidations ?? []) {
      if (r >= dv.range.r1 && r <= dv.range.r2 && c >= dv.range.c1 && c <= dv.range.c2) return dv;
    }
    return null;
  }, [activeSheet]);

  const addValidation = (dv: Omit<DataValidation, "id">) => {
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId
        ? { ...sh, dataValidations: [...(sh.dataValidations ?? []), { ...dv, id: `dv_${Date.now()}` }] }
        : sh);
      scheduleSave(next, title);
      return next;
    });
  };

  const removeValidation = (id: string) => {
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId
        ? { ...sh, dataValidations: (sh.dataValidations ?? []).filter(d => d.id !== id) }
        : sh);
      scheduleSave(next, title);
      return next;
    });
  };

  // ── Pivot tables ──────────────────────────────────────────────────────────
  const addPivot = (p: Omit<PivotDef, "id">) => {
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId
        ? { ...sh, pivots: [...(sh.pivots ?? []), { ...p, id: `pv_${Date.now()}` }] }
        : sh);
      scheduleSave(next, title);
      return next;
    });
  };

  const removePivot = (id: string) => {
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId
        ? { ...sh, pivots: (sh.pivots ?? []).filter(p => p.id !== id) }
        : sh);
      scheduleSave(next, title);
      return next;
    });
  };

  // Read a range into a 2D array of display strings (row 0 = headers).
  const rangeTo2D = useCallback((rangeStr: string, sheet: SheetTab): string[][] => {
    const r = parseRange(rangeStr.toUpperCase());
    if (!r) return [];
    const out: string[][] = [];
    for (let row = r.startRow; row <= r.endRow; row++) {
      const line: string[] = [];
      for (let col = r.startCol; col <= r.endCol; col++) line.push(getCellDisplayValue(row, col, sheet));
      out.push(line);
    }
    return out;
  }, [getCellDisplayValue]);

  // ── Named ranges apply ────────────────────────────────────────────────────
  const applyNamedRanges = (nr: Record<string, string>) => {
    setNamedRanges(nr);
    namedRangesRef.current = nr;
    scheduleSave(sheets, title);
  };

  // ── XLSX export ───────────────────────────────────────────────────────────
  const exportXLSX = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const aoa: (string | number | boolean)[][] = [];
      for (let r = 0; r < ROWS; r++) {
        const row: (string | number | boolean)[] = [];
        let hasData = false;
        for (let c = 0; c < COLS; c++) {
          const cell = sheet.cells[ck(r, c)];
          const val = cell?.v ? computeCell(cell.v, sheet) : null;
          const display = val === null ? "" : String(val);
          if (display) hasData = true;
          row.push(display);
        }
        if (hasData || r < 10) aoa.push(row);
        else break;
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet.name);
    }
    XLSX.writeFile(wb, `${title}.xlsx`);
  };

  // ── XLSX import ───────────────────────────────────────────────────────────
  const importXLSX = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import("xlsx");
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const newSheets: SheetTab[] = wb.SheetNames.map((name, idx) => {
          const ws = wb.Sheets[name];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
          const sh = blankSheet(`imported_${idx}`, name);
          aoa.forEach((row, r) => {
            row.forEach((val, c) => {
              if (val !== "" && val !== undefined && val !== null) {
                sh.cells[ck(r, c)] = { v: String(val) };
              }
            });
          });
          return sh;
        });
        setSheets(newSheets);
        setActiveSheetId(newSheets[0].id);
        scheduleSave(newSheets, title);
        toast.success(`Imported ${newSheets.length} sheet${newSheets.length > 1 ? "s" : ""}`);
      } catch { toast.error("Import failed"); }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Merge cells ───────────────────────────────────────────────────────────
  const mergeCells = () => {
    if (!selEnd) return toast.error("Select a range to merge");
    const r1 = Math.min(sel.r, selEnd.r), r2 = Math.max(sel.r, selEnd.r);
    const c1 = Math.min(sel.c, selEnd.c), c2 = Math.max(sel.c, selEnd.c);
    setSheets(prev => prev.map(sh => {
      if (sh.id !== activeSheetId) return sh;
      const cells = { ...sh.cells };
      // Mark all but top-left as merged
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) {
          cells[ck(r, c)] = { ...cells[ck(r, c)], v: cells[ck(r, c)]?.v ?? "", mergeSpan: { rows: r2 - r1 + 1, cols: c2 - c1 + 1 } };
        } else {
          cells[ck(r, c)] = { ...cells[ck(r, c)], v: "", merged: true };
        }
      }
      return { ...sh, cells };
    }));
    toast.success("Cells merged");
  };

  // Unmerge the merged block anchored at (or containing) the given cell.
  const unmergeAt = (r: number, c: number) => {
    setSheets(prev => {
      let found = false;
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        // Find the anchor: scan up/left for a mergeSpan that covers (r,c).
        for (let ar = 0; ar <= r; ar++) for (let ac = 0; ac <= c; ac++) {
          const span = cells[ck(ar, ac)]?.mergeSpan;
          if (!span) continue;
          if (r >= ar && r < ar + span.rows && c >= ac && c < ac + span.cols) {
            for (let rr = ar; rr < ar + span.rows; rr++) for (let cc = ac; cc < ac + span.cols; cc++) {
              const cur = cells[ck(rr, cc)];
              if (!cur) continue;
              const { merged: _m, mergeSpan: _s, ...rest } = cur;
              void _m; void _s;
              cells[ck(rr, cc)] = rest as Cell;
            }
            found = true;
          }
        }
        return { ...sh, cells };
      });
      if (found) { scheduleSave(next, title); }
      return next;
    });
  };

  // ── Sparklines ──────────────────────────────────────────────────────────────
  // Store a sparkline def on the selected cell, referencing the rest of the
  // selected range (or, for a single cell, the contiguous run to its right).
  const insertSparkline = () => {
    let range: string;
    if (selEnd && (selEnd.r !== sel.r || selEnd.c !== sel.c)) {
      const r1 = Math.min(sel.r, selEnd.r), r2 = Math.max(sel.r, selEnd.r);
      const c1 = Math.min(sel.c, selEnd.c), c2 = Math.max(sel.c, selEnd.c);
      range = toA1(r1, c1) + ":" + toA1(r2, c2);
    } else {
      let cc = sel.c + 1;
      while (cc < COLS && (activeSheet.cells[ck(sel.r, cc)]?.v ?? "") !== "") cc++;
      if (cc - 1 <= sel.c) { toast.error("Select a data range, or put values to the right of this cell"); return; }
      range = toA1(sel.r, sel.c + 1) + ":" + toA1(sel.r, cc - 1);
    }
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        const k = ck(sel.r, sel.c);
        cells[k] = { ...cells[k], v: cells[k]?.v ?? "", spark: { range, mode: "bar", color: "#1a56db" } };
        return { ...sh, cells };
      });
      pushHistory(next); scheduleSave(next, title); return next;
    });
    toast.success("Sparkline inserted (" + range + ")");
  };

  // ── Freeze panes ───────────────────────────────────────────────────────────
  const setFreeze = useCallback((patch: { frozenRows?: number; frozenCols?: number }) => {
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId ? { ...sh, ...patch } : sh);
      scheduleSave(next, title);
      return next;
    });
    setFreezeMenuOpen(false);
  }, [activeSheetId, scheduleSave, title]);

  // ── Whole-sheet protection toggle ───────────────────────────────────────────
  const toggleSheetProtect = useCallback(() => {
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId ? { ...sh, protected: !sh.protected } : sh);
      const now = next.find(s => s.id === activeSheetId)?.protected;
      toast.success(now ? "Sheet protected — edits blocked" : "Sheet protection removed");
      scheduleSave(next, title);
      return next;
    });
  }, [activeSheetId, scheduleSave, title]);

  // ── Templates ──────────────────────────────────────────────────────────────
  const applyTemplate = useCallback((cells: Record<string, Cell>) => {
    setSheets(prev => {
      const next = prev.map(sh => sh.id === activeSheetId ? { ...sh, cells } : sh);
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
    setShowTemplates(false);
    toast.success("Template applied");
  }, [activeSheetId, pushHistory, scheduleSave, title]);

  // ── Cell notes / comments ──────────────────────────────────────────────────
  // Set (or clear, when note === "") the note on the selected cell.
  const setCellNote = useCallback((r: number, c: number, note: string) => {
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const newCells = { ...sh.cells };
        const key = ck(r, c);
        const existing = newCells[key];
        const trimmed = note.trim();
        if (trimmed === "") {
          if (existing) {
            // Drop the note; remove the cell entirely if nothing else remains.
            const { note: _drop, ...rest } = existing;
            void _drop;
            if (rest.v === "" && !rest.s && !rest.merged && !rest.mergeSpan) delete newCells[key];
            else newCells[key] = rest as Cell;
          }
        } else {
          newCells[key] = { ...existing, v: existing?.v ?? "", note: trimmed };
        }
        return { ...sh, cells: newCells };
      });
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
  }, [activeSheetId, pushHistory, scheduleSave, title]);

  // ── Remove duplicate rows in the selected range ────────────────────────────
  // Scans rows top-to-bottom across the selected columns; the first occurrence
  // of a value-tuple is kept, later duplicates are removed and survivors
  // compacted upward within the range.
  const removeDuplicates = useCallback((hasHeader: boolean) => {
    const r1 = selEnd ? Math.min(sel.r, selEnd.r) : sel.r;
    const r2 = selEnd ? Math.max(sel.r, selEnd.r) : sel.r;
    const c1 = selEnd ? Math.min(sel.c, selEnd.c) : sel.c;
    const c2 = selEnd ? Math.max(sel.c, selEnd.c) : sel.c;
    const startRow = r1 + (hasHeader ? 1 : 0);
    if (startRow > r2) { toast.error("No data rows in the selection"); setShowRemoveDupes(false); return; }

    let removed = 0;
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        const seen = new Set<string>();
        const keptRows: Array<Record<number, Cell>> = [];
        for (let r = startRow; r <= r2; r++) {
          // Build a stable signature from the selected columns' display values.
          const sig: string[] = [];
          const rowCells: Record<number, Cell> = {};
          for (let c = c1; c <= c2; c++) {
            sig.push(getCellDisplayValue(r, c, sh));
            const cell = cells[ck(r, c)];
            if (cell) rowCells[c] = cell;
          }
          const key = sig.join(String.fromCharCode(1));
          if (seen.has(key)) { removed++; continue; }
          seen.add(key);
          keptRows.push(rowCells);
        }
        // Clear the data region (selected columns only) then rewrite survivors.
        for (let r = startRow; r <= r2; r++)
          for (let c = c1; c <= c2; c++) delete cells[ck(r, c)];
        keptRows.forEach((rowCells, i) => {
          const rr = startRow + i;
          for (let c = c1; c <= c2; c++) {
            const cell = rowCells[c];
            if (cell) cells[ck(rr, c)] = cell;
          }
        });
        return { ...sh, cells };
      });
      if (removed > 0) { pushHistory(next); scheduleSave(next, title); }
      return next;
    });
    setShowRemoveDupes(false);
    toast.success(removed === 0 ? "No duplicates found" : "Removed " + removed + " duplicate row" + (removed === 1 ? "" : "s"));
  }, [sel, selEnd, activeSheetId, getCellDisplayValue, pushHistory, scheduleSave, title]);

  // ── Split text to columns ──────────────────────────────────────────────────
  // For the selected single column, split each cell by the chosen delimiter and
  // write parts into the columns immediately to the right (overwriting).
  const splitTextToColumns = useCallback((delimiter: string) => {
    if (delimiter === "") { toast.error("Choose a delimiter"); return; }
    const r1 = selEnd ? Math.min(sel.r, selEnd.r) : sel.r;
    const r2 = selEnd ? Math.max(sel.r, selEnd.r) : sel.r;
    const col = sel.c;

    let maxParts = 0;
    let affected = 0;
    setSheets(prev => {
      const next = prev.map(sh => {
        if (sh.id !== activeSheetId) return sh;
        const cells = { ...sh.cells };
        for (let r = r1; r <= r2; r++) {
          const cell = cells[ck(r, col)];
          const raw = cell?.v ?? "";
          if (raw === "" || raw.startsWith("=")) continue; // skip empties & formulas
          const parts = raw.split(delimiter);
          if (parts.length <= 1) continue;
          affected++;
          if (parts.length > maxParts) maxParts = parts.length;
          parts.forEach((part, i) => {
            const cc = col + i;
            if (cc >= COLS) return; // don't overflow the grid
            const trimmed = part.trim();
            if (i === 0) {
              // First part stays in the source cell (preserve its style).
              cells[ck(r, col)] = { ...cell, v: trimmed };
            } else if (trimmed === "") {
              delete cells[ck(r, cc)];
            } else {
              cells[ck(r, cc)] = { ...cells[ck(r, cc)], v: trimmed };
            }
          });
        }
        return { ...sh, cells };
      });
      if (affected > 0) { pushHistory(next); scheduleSave(next, title); }
      return next;
    });
    setShowSplitText(false);
    if (affected === 0) toast.error("No cells contained the delimiter");
    else toast.success("Split " + affected + " cell" + (affected === 1 ? "" : "s") + " into columns");
  }, [sel, selEnd, activeSheetId, pushHistory, scheduleSave, title]);

  // ── Current cell style (for toolbar display) ───────────────────────────────
  const cellStyle = activeSheet.cells[ck(sel.r, sel.c)]?.s ?? {};
  const selNote = activeSheet.cells[ck(sel.r, sel.c)]?.note ?? "";

  // ── Selection stats (status bar: Count / Sum / Average / Min / Max) ─────────
  const selStats = (() => {
    const r1 = selEnd ? Math.min(sel.r, selEnd.r) : sel.r;
    const r2 = selEnd ? Math.max(sel.r, selEnd.r) : sel.r;
    const c1 = selEnd ? Math.min(sel.c, selEnd.c) : sel.c;
    const c2 = selEnd ? Math.max(sel.c, selEnd.c) : sel.c;
    if (r1 === r2 && c1 === c2) return null; // single cell: no status
    let count = 0, numCount = 0, sum = 0, min = Infinity, max = -Infinity;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const disp = getCellDisplayValue(r, c, activeSheet);
        if (disp === "") continue;
        count++;
        const n = Number(disp.replace(/[$,%]/g, ""));
        if (!isNaN(n) && disp.trim() !== "") { numCount++; sum += n; if (n < min) min = n; if (n > max) max = n; }
      }
    }
    return { count, numCount, sum, avg: numCount ? sum / numCount : 0, min, max };
  })();
  const fmtStat = (n: number) => Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  // ── Freeze offsets (sticky positioning) ────────────────────────────────────
  const frozenRows = activeSheet.frozenRows ?? 0;
  const frozenCols = activeSheet.frozenCols ?? 0;
  // Left offset (px) for a frozen column index c: ROW_HEADER_W + sum of widths of frozen cols before c.
  const frozenColLefts: Record<number, number> = {};
  {
    let acc = ROW_HEADER_W;
    for (let c = 0; c < frozenCols; c++) {
      frozenColLefts[c] = acc;
      acc += activeSheet.colWidths[c] ?? DEFAULT_COL_W;
    }
  }
  // Top offset (px) for a frozen row index r: COL_HEADER_H + sum of heights of frozen rows before r.
  const frozenRowTops: Record<number, number> = {};
  {
    let acc = COL_HEADER_H;
    for (let r = 0; r < frozenRows; r++) {
      frozenRowTops[r] = acc;
      acc += activeSheet.rowHeights[r] ?? DEFAULT_ROW_H;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!loaded) return (
    <div className="flex items-center justify-center h-screen bg-white">
      <Loader2 className="h-6 w-6 animate-spin text-[#1a56db]" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden" onClick={() => { setColorPickerTarget(null); setSortMenuOpen(false); setFreezeMenuOpen(false); setDvDropdown(null); setCurrencyMenuOpen(false); setBorderMenuOpen(false); setCellCtx(null); }}>

      {/* ── Title bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8eaed] bg-white z-20">
        <button
          onClick={() => router.push("/apps/sheets")}
          title="Back to spreadsheets"
          className="flex items-center justify-center h-8 w-8 rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          className="text-sm font-semibold text-[#202124] bg-transparent border-none outline-none focus:bg-[#f1f3f4] rounded px-1 min-w-0 w-48"
          value={title}
          onChange={e => { setTitle(e.target.value); scheduleSave(sheets, e.target.value); }}
        />
        <div className="flex items-center gap-1 ml-auto text-xs text-[#80868b]">
          {saving && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
        </div>
        <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors">
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-[#e8eaed] bg-white z-10 overflow-x-auto">
        {/* Undo/Redo */}
        <ToolBtn icon={<Undo2 className="h-3.5 w-3.5" />} title="Undo (⌘Z)" onClick={undo} />
        <ToolBtn icon={<Redo2 className="h-3.5 w-3.5" />} title="Redo (⌘⇧Z)" onClick={redo} />
        <Sep />

        {/* Font family */}
        <select
          className="text-xs border border-[#e8eaed] rounded px-1.5 py-1 bg-white text-[#202124] h-7 cursor-pointer"
          value={cellStyle.fontFamily ?? "Arial"}
          onChange={e => applyStyle({ fontFamily: e.target.value })}
        >
          {FONTS.map(f => <option key={f}>{f}</option>)}
        </select>

        {/* Font size */}
        <select
          className="text-xs border border-[#e8eaed] rounded px-1 py-1 bg-white text-[#202124] h-7 w-14 cursor-pointer"
          value={cellStyle.fontSize ?? 12}
          onChange={e => applyStyle({ fontSize: Number(e.target.value) })}
        >
          {FONT_SIZES.map(s => <option key={s}>{s}</option>)}
        </select>
        <Sep />

        {/* Bold/Italic/Underline/Strikethrough */}
        <ToolBtn icon={<Bold className="h-3.5 w-3.5" />} title="Bold" active={cellStyle.bold} onClick={() => applyStyle({ bold: !cellStyle.bold })} />
        <ToolBtn icon={<Italic className="h-3.5 w-3.5" />} title="Italic" active={cellStyle.italic} onClick={() => applyStyle({ italic: !cellStyle.italic })} />
        <ToolBtn icon={<Underline className="h-3.5 w-3.5" />} title="Underline" active={cellStyle.underline} onClick={() => applyStyle({ underline: !cellStyle.underline })} />
        <ToolBtn icon={<Strikethrough className="h-3.5 w-3.5" />} title="Strikethrough" active={cellStyle.strikethrough} onClick={() => applyStyle({ strikethrough: !cellStyle.strikethrough })} />
        <Sep />

        {/* Text / BG color */}
        <div className="relative">
          <ToolBtn
            icon={<div className="flex flex-col items-center gap-0.5"><Type className="h-3.5 w-3.5" /><div className="h-0.5 w-3.5 rounded" style={{ background: cellStyle.color ?? "#202124" }} /></div>}
            title="Text color"
            onClick={e => { e.stopPropagation(); setColorPickerTarget(colorPickerTarget === "text" ? null : "text"); }}
          />
          {colorPickerTarget === "text" && <ColorPicker onSelect={c => { applyStyle({ color: c }); setColorPickerTarget(null); }} />}
        </div>
        <div className="relative">
          <ToolBtn
            icon={<div className="flex flex-col items-center gap-0.5"><Paintbrush className="h-3.5 w-3.5" /><div className="h-0.5 w-3.5 rounded" style={{ background: cellStyle.background ?? "transparent", border: "1px solid #e8eaed" }} /></div>}
            title="Fill color"
            onClick={e => { e.stopPropagation(); setColorPickerTarget(colorPickerTarget === "bg" ? null : "bg"); }}
          />
          {colorPickerTarget === "bg" && <ColorPicker onSelect={c => { applyStyle({ background: c }); setColorPickerTarget(null); }} />}
        </div>
        <Sep />

        {/* Alignment */}
        <ToolBtn icon={<AlignLeft className="h-3.5 w-3.5" />} title="Left" active={cellStyle.align === "left"} onClick={() => applyStyle({ align: "left" })} />
        <ToolBtn icon={<AlignCenter className="h-3.5 w-3.5" />} title="Center" active={cellStyle.align === "center"} onClick={() => applyStyle({ align: "center" })} />
        <ToolBtn icon={<AlignRight className="h-3.5 w-3.5" />} title="Right" active={cellStyle.align === "right"} onClick={() => applyStyle({ align: "right" })} />
        <ToolBtn icon={<AlignJustify className="h-3.5 w-3.5" />} title="Justify" active={cellStyle.align === "justify"} onClick={() => applyStyle({ align: "justify" })} />
        <ToolBtn icon={<WrapText className="h-3.5 w-3.5" />} title="Wrap text" active={cellStyle.wrap} onClick={() => applyStyle({ wrap: !cellStyle.wrap })} />
        <Sep />

        {/* Number format */}
        <select
          className="text-xs border border-[#e8eaed] rounded px-1.5 py-1 bg-white text-[#202124] h-7 cursor-pointer"
          value={cellStyle.accounting ? "accounting" : (cellStyle.format ?? "general")}
          onChange={e => {
            const v = e.target.value;
            if (v === "accounting") applyStyle({ format: "currency", accounting: true, align: "right" });
            else applyStyle({ format: v as NumberFormat, accounting: false });
          }}
        >
          <option value="general">General</option>
          <option value="number">Number</option>
          <option value="currency">Currency</option>
          <option value="accounting">Accounting</option>
          <option value="percent">Percent</option>
          <option value="date">Date</option>
          <option value="scientific">Scientific</option>
          <option value="text">Text</option>
        </select>

        {/* Quick number-format buttons */}
        <ToolBtn
          icon={<span className="text-[13px] font-semibold leading-none">$</span>}
          title="Currency"
          active={cellStyle.format === "currency" && !cellStyle.accounting}
          onClick={() => applyStyle({ format: "currency", accounting: false })}
        />
        <ToolBtn
          icon={<span className="text-[13px] font-semibold leading-none">%</span>}
          title="Percent"
          active={cellStyle.format === "percent"}
          onClick={() => applyStyle({ format: "percent", accounting: false })}
        />
        <ToolBtn
          icon={<span className="text-[11px] font-semibold leading-none">1,000</span>}
          title="Number (thousands separator)"
          active={cellStyle.format === "number"}
          onClick={() => applyStyle({ format: "number", accounting: false })}
        />

        {/* Currency picker */}
        <div className="relative">
          <ToolBtn
            icon={
              <span className="flex items-center leading-none text-[12px] font-semibold">
                {(CURRENCIES.find(x => x.code === (cellStyle.currency ?? "USD"))?.symbol ?? "$") + ""}
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </span>
            }
            title="Currency symbol"
            onClick={e => { e.stopPropagation(); setCurrencyMenuOpen(v => !v); }}
          />
          {currencyMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-28 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1" onClick={e => e.stopPropagation()}>
              {CURRENCIES.map(cur => (
                <button
                  key={cur.code}
                  onClick={() => { applyStyle({ format: "currency", currency: cur.code }); setCurrencyMenuOpen(false); }}
                  className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] text-left transition-colors ${(cellStyle.currency ?? "USD") === cur.code ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}
                >
                  <span className="w-4 text-center font-semibold">{cur.symbol}</span>
                  {cur.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Decimal places */}
        <ToolBtn
          icon={<span className="text-[10px] font-semibold leading-none whitespace-nowrap">.0{"+"}</span>}
          title="Increase decimal places"
          onClick={() => { const cur = cellStyle.decimals ?? 2; applyStyle({ decimals: Math.min(10, cur + 1) }); }}
        />
        <ToolBtn
          icon={<span className="text-[10px] font-semibold leading-none whitespace-nowrap">.0{"−"}</span>}
          title="Decrease decimal places"
          onClick={() => { const cur = cellStyle.decimals ?? 2; applyStyle({ decimals: Math.max(0, cur - 1) }); }}
        />
        <Sep />

        {/* Merge */}
        <ToolBtn icon={<Merge className="h-3.5 w-3.5" />} title="Merge cells" onClick={mergeCells} />

        {/* Borders */}
        <div className="relative">
          <ToolBtn
            icon={<div className="flex items-center gap-0.5"><Grid2x2 className="h-3.5 w-3.5" /><ChevronDown className="h-2.5 w-2.5" /></div>}
            title="Borders"
            onClick={e => { e.stopPropagation(); setBorderMenuOpen(v => !v); }}
          />
          {borderMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1" onClick={e => e.stopPropagation()}>
              <MenuItem onClick={() => applyBorders("all")}><Grid2x2 className="h-3 w-3" /> All borders</MenuItem>
              <MenuItem onClick={() => applyBorders("outer")}><Table className="h-3 w-3" /> Outer border</MenuItem>
              <MenuItem onClick={() => applyBorders("top")}>Top border</MenuItem>
              <MenuItem onClick={() => applyBorders("bottom")}>Bottom border</MenuItem>
              <MenuItem onClick={() => applyBorders("left")}>Left border</MenuItem>
              <MenuItem onClick={() => applyBorders("right")}>Right border</MenuItem>
              <div className="border-t border-[#e8eaed] my-1" />
              <MenuItem onClick={() => applyBorders("none")}><X className="h-3 w-3" /> No borders</MenuItem>
            </div>
          )}
        </div>
        <Sep />

        {/* Freeze panes */}
        <div className="relative">
          <ToolBtn
            icon={<div className="flex items-center gap-0.5"><Columns className="h-3.5 w-3.5" /><ChevronDown className="h-2.5 w-2.5" /></div>}
            title="Freeze rows / columns"
            active={activeSheet.frozenRows > 0 || activeSheet.frozenCols > 0}
            onClick={e => { e.stopPropagation(); setFreezeMenuOpen(v => !v); }}
          />
          {freezeMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1 text-[#202124]" onClick={e => e.stopPropagation()}>
              <div className="px-3 py-1 text-[10px] font-medium text-[#80868b]">Rows</div>
              <FreezeMenuItem label="No frozen rows" active={activeSheet.frozenRows === 0} onClick={() => setFreeze({ frozenRows: 0 })} />
              <FreezeMenuItem label="Freeze 1 row" active={activeSheet.frozenRows === 1} onClick={() => setFreeze({ frozenRows: 1 })} />
              <FreezeMenuItem label={"Freeze up to row " + (sel.r + 1)} active={activeSheet.frozenRows === sel.r + 1} onClick={() => setFreeze({ frozenRows: sel.r + 1 })} />
              <div className="border-t border-[#e8eaed] my-1" />
              <div className="px-3 py-1 text-[10px] font-medium text-[#80868b]">Columns</div>
              <FreezeMenuItem label="No frozen columns" active={activeSheet.frozenCols === 0} onClick={() => setFreeze({ frozenCols: 0 })} />
              <FreezeMenuItem label="Freeze 1 column" active={activeSheet.frozenCols === 1} onClick={() => setFreeze({ frozenCols: 1 })} />
              <FreezeMenuItem label={"Freeze up to column " + indexToCol(sel.c)} active={activeSheet.frozenCols === sel.c + 1} onClick={() => setFreeze({ frozenCols: sel.c + 1 })} />
            </div>
          )}
        </div>

        {/* Templates */}
        <ToolBtn icon={<LayoutGrid className="h-3.5 w-3.5" />} title="Insert template" onClick={() => setShowTemplates(true)} />
        <Sep />

        {/* Sort */}
        <div className="relative">
          <ToolBtn
            icon={<div className="flex items-center gap-0.5"><SortAsc className="h-3.5 w-3.5" /><ChevronDown className="h-2.5 w-2.5" /></div>}
            title="Sort"
            onClick={e => { e.stopPropagation(); setSortMenuOpen(v => !v); }}
          />
          {sortMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1" onClick={e => e.stopPropagation()}>
              {Array.from({ length: Math.min(COLS, 10) }, (_, i) => (
                <div key={i} className="px-3 py-1.5 text-xs text-[#202124] hover:bg-[#f1f3f4] cursor-pointer flex justify-between items-center"
                  onClick={() => sortByCol(i, "asc")}>
                  {indexToCol(i)} <SortAsc className="h-3 w-3 text-[#5f6368]" />
                </div>
              ))}
              <div className="border-t border-[#e8eaed] my-1" />
              {Array.from({ length: Math.min(COLS, 10) }, (_, i) => (
                <div key={i} className="px-3 py-1.5 text-xs text-[#202124] hover:bg-[#f1f3f4] cursor-pointer flex justify-between items-center"
                  onClick={() => sortByCol(i, "desc")}>
                  {indexToCol(i)} <SortDesc className="h-3 w-3 text-[#5f6368]" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filter */}
        <ToolBtn icon={<Filter className="h-3.5 w-3.5" />} title="Filter" active={Object.values(activeSheet.filters).some(v => v.length > 0)} onClick={() => setShowFilter(v => !v)} />

        {/* Conditional format */}
        <ToolBtn icon={<ListFilter className="h-3.5 w-3.5" />} title="Conditional formatting" active={(activeSheet.conditionalRules?.length ?? 0) > 0} onClick={() => setShowCF(true)} />

        {/* Data validation */}
        <ToolBtn icon={<ListChecks className="h-3.5 w-3.5" />} title="Data validation (dropdowns)" active={(activeSheet.dataValidations?.length ?? 0) > 0} onClick={() => setShowValidation(true)} />

        {/* Sheet protection */}
        <ToolBtn icon={<Lock className="h-3.5 w-3.5" />} title={activeSheet.protected ? "Sheet protected — click to unlock" : "Protect entire sheet"} active={!!activeSheet.protected} onClick={toggleSheetProtect} />

        {/* Named ranges */}
        <ToolBtn icon={<Tag className="h-3.5 w-3.5" />} title="Named ranges" active={Object.keys(namedRanges).length > 0} onClick={() => setShowNames(true)} />

        {/* Pivot table */}
        <ToolBtn icon={<Table className="h-3.5 w-3.5" />} title="Pivot table" active={(activeSheet.pivots?.length ?? 0) > 0} onClick={() => setShowPivot(true)} />

        {/* Chart */}
        <ToolBtn icon={<BarChart3 className="h-3.5 w-3.5" />} title="Insert chart" onClick={() => setShowChart(true)} />
        <Sep />

        {/* Format painter */}
        <ToolBtn icon={<Brush className="h-3.5 w-3.5" />} title="Format painter — copy this cell's formatting to the next cell you click" active={!!painterStyle} onClick={armPainter} />

        {/* Find & Replace */}
        <ToolBtn icon={<Search className="h-3.5 w-3.5" />} title="Find & replace (⌘H)" onClick={() => setShowFindReplace(true)} />

        {/* Insert / edit cell note */}
        <ToolBtn icon={<MessageSquare className="h-3.5 w-3.5" />} title="Insert note" active={!!selNote} onClick={() => setShowNote(true)} />

        {/* Remove duplicates */}
        <ToolBtn icon={<CopyMinus className="h-3.5 w-3.5" />} title="Remove duplicates" onClick={() => setShowRemoveDupes(true)} />

        {/* Split text to columns */}
        <ToolBtn icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />} title="Split text to columns" onClick={() => setShowSplitText(true)} />
        <Sep />

        {/* AI */}
        <button onClick={() => setShowAI(v => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${showAI ? "bg-purple-100 text-purple-700" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
          <Sparkles className="h-3.5 w-3.5" /> AI
        </button>
        <Sep />

        {/* Export / Import */}
        <ToolBtn icon={<Download className="h-3.5 w-3.5" />} title="Export XLSX" onClick={() => void exportXLSX()} />
        <label title="Import XLSX" className="flex items-center justify-center h-7 w-7 rounded text-[#5f6368] hover:bg-[#f1f3f4] cursor-pointer">
          <Upload className="h-3.5 w-3.5" />
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importXLSX} />
        </label>
      </div>

      {/* ── Formula bar ── */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[#e8eaed] bg-white z-10">
        <div className="w-16 text-center text-xs font-mono font-semibold text-[#5f6368] border border-[#e8eaed] rounded px-1 py-0.5">
          {toA1(sel.r, sel.c)}
        </div>
        <div className="text-[#bdc1c6] select-none">ƒx</div>
        <input
          className="flex-1 text-xs font-mono px-2 py-1 border border-[#e8eaed] rounded outline-none focus:border-[#1a56db]/60 focus:ring-1 focus:ring-[#1a56db]/20 bg-white"
          value={editing ? editVal : formulaBarVal}
          onChange={e => { if (editing) { setEditVal(e.target.value); } else { setFormulaBarVal(e.target.value); setEditVal(e.target.value); setEditing(true); } }}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); updateCell(sel.r, sel.c, editing ? editVal : formulaBarVal); setEditing(false); }
            else if (e.key === "Escape") { setEditing(false); setFormulaBarVal(activeSheet.cells[ck(sel.r, sel.c)]?.v ?? ""); }
          }}
        />
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0">
        {/* Grid */}
        <div className="flex-1 overflow-auto outline-none" ref={gridRef} tabIndex={0} onKeyDown={handleGridKey}>
          <div style={{ display: "grid", gridTemplateColumns: `${ROW_HEADER_W}px ${Array.from({ length: COLS }, (_, c) => `${activeSheet.hiddenCols.has(c) ? 6 : (activeSheet.colWidths[c] ?? DEFAULT_COL_W)}px`).join(" ")}` }}>
            {/* Column headers */}
            <div className="sticky top-0 left-0 z-20 bg-[#f8f9fa] border-r border-b border-[#e8eaed]" style={{ height: COL_HEADER_H }} />
            {Array.from({ length: COLS }, (_, c) => (
              <ColHeader
                key={c}
                col={c}
                label={indexToCol(c)}
                width={activeSheet.colWidths[c] ?? DEFAULT_COL_W}
                hidden={activeSheet.hiddenCols.has(c)}
                selected={selEnd ? (c >= Math.min(sel.c, selEnd.c) && c <= Math.max(sel.c, selEnd.c)) : c === sel.c}
                onResize={(w) => setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, colWidths: { ...sh.colWidths, [c]: w } } : sh))}
                onAutofit={() => {
                  let maxLen = indexToCol(c).length;
                  for (let r = 0; r < ROWS; r++) { const v = getCellDisplayValue(r, c, activeSheet); if (v.length > maxLen) maxLen = v.length; }
                  const w = Math.max(48, Math.min(400, maxLen * 8 + 18));
                  setSheets(prev => { const next = prev.map(sh => sh.id === activeSheetId ? { ...sh, colWidths: { ...sh.colWidths, [c]: w } } : sh); scheduleSave(next, title); return next; });
                }}
                onHide={() => setSheets(prev => prev.map(sh => {
                  if (sh.id !== activeSheetId) return sh;
                  const hs = new Set(sh.hiddenCols);
                  if (hs.has(c)) { hs.delete(c); } else { hs.add(c); };
                  return { ...sh, hiddenCols: hs };
                }))}
                onSort={(dir) => sortByCol(c, dir)}
                onFilter={() => { setFilterCol(c); setShowFilter(true); }}
                filterActive={!!activeSheet.filters[c]?.length}
              />
            ))}

            {/* Rows */}
            {Array.from({ length: ROWS }, (_, r) => {
              if (activeSheet.hiddenRows.has(r)) return null;
              if (r > 0 && isRowHiddenByFilter(r)) return null;
              return (
                <Row
                  key={r}
                  row={r}
                  cols={COLS}
                  sheet={activeSheet}
                  sel={sel}
                  selEnd={selEnd}
                  editing={editing}
                  editVal={editVal}
                  cellInputRef={cellInputRef}
                  colWidths={activeSheet.colWidths}
                  rowHeight={activeSheet.rowHeights[r] ?? DEFAULT_ROW_H}
                  frozenRows={frozenRows}
                  frozenCols={frozenCols}
                  frozenColLefts={frozenColLefts}
                  frozenRowTops={frozenRowTops}
                  getCellDisplayValue={getCellDisplayValue}
                  getCFStyle={getCFStyle}
                  getCellValidation={getCellValidation}
                  dvDropdown={dvDropdown}
                  onOpenDropdown={(rr, cc, values) => setDvDropdown({ r: rr, c: cc, values })}
                  onPickValidation={(rr, cc, val) => { updateCell(rr, cc, val); setDvDropdown(null); }}
                  onCloseDropdown={() => setDvDropdown(null)}
                  fillDrag={fillDrag}
                  fillTo={fillTo}
                  onStartFill={startFill}
                  onCellEnter={(rr, cc) => { if (fillDrag) setFillTo({ r: rr, c: cc }); else if (selecting.current) { setSelEnd({ r: rr, c: cc }); didDrag.current = true; } }}
                  onCellMouseDown={(rr, cc, shiftKey) => {
                    if (painterStyle) return; // let click handle the painter
                    sheetActive.current = true; // arm global arrow-key handler
                    if (shiftKey) { setSelEnd({ r: rr, c: cc }); }
                    else { setSel({ r: rr, c: cc }); setSelEnd(null); setEditing(false); selecting.current = true; didDrag.current = false; }
                    focusGrid();
                  }}
                  onCellContextMenu={(rr, cc, x, y) => {
                    const inSel = selEnd
                      ? rr >= Math.min(sel.r, selEnd.r) && rr <= Math.max(sel.r, selEnd.r) && cc >= Math.min(sel.c, selEnd.c) && cc <= Math.max(sel.c, selEnd.c)
                      : rr === sel.r && cc === sel.c;
                    if (!inSel) { setSel({ r: rr, c: cc }); setSelEnd(null); }
                    setCellCtx({ x, y, r: rr, c: cc });
                  }}
                  onCellClick={(rr, cc, shiftKey) => {
                    if (painterStyle) {
                      // Format painter armed: apply copied style to the clicked cell
                      // (or, with shift, the range from the current anchor), then disarm.
                      if (shiftKey) applyPainterTo(sel.r, sel.c, rr, cc, painterStyle);
                      else applyPainterTo(rr, cc, rr, cc, painterStyle);
                      setSel({ r: rr, c: cc });
                      setSelEnd(shiftKey ? { r: rr, c: cc } : null);
                      setPainterStyle(null);
                      toast.success("Format applied");
                      return;
                    }
                    if (shiftKey) {
                      setSelEnd({ r: rr, c: cc });
                    } else if (!didDrag.current) {
                      // Only update for a plain click — drag-select already set sel/selEnd via onCellEnter/onMouseMove
                      setSel({ r: rr, c: cc });
                      setSelEnd(null);
                      setEditing(false);
                    }
                    // reset for next interaction
                    didDrag.current = false;
                    focusGrid();
                  }}
                  onCellDoubleClick={(rr, cc) => {
                    setSel({ r: rr, c: cc });
                    const cell = activeSheet.cells[ck(rr, cc)];
                    setEditVal(cell?.v ?? "");
                    setEditing(true);
                    setTimeout(() => cellInputRef.current?.focus(), 0);
                  }}
                  onEditChange={setEditVal}
                  onEditCommit={commitEdit}
                  onEditCancel={() => setEditing(false)}
                  onRowResize={(h) => setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, rowHeights: { ...sh.rowHeights, [r]: h } } : sh))}
                  onHideRow={() => setSheets(prev => prev.map(sh => {
                    if (sh.id !== activeSheetId) return sh;
                    const hs = new Set(sh.hiddenRows);
                    if (hs.has(r)) { hs.delete(r); } else { hs.add(r); };
                    return { ...sh, hiddenRows: hs };
                  }))}
                />
              );
            })}
          </div>

          {/* Charts */}
          {activeSheet.charts.map(chart => (
            <ChartWidget
              key={chart.id}
              chart={chart}
              sheet={activeSheet}
              computeCell={computeCell}
              onRemove={() => setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, charts: sh.charts.filter(c => c.id !== chart.id) } : sh))}
            />
          ))}

          {/* Pivot tables */}
          {(activeSheet.pivots ?? []).map(pivot => (
            <PivotWidget
              key={pivot.id}
              def={pivot}
              rows={rangeTo2D(pivot.sourceRange, activeSheet)}
              onRemove={() => removePivot(pivot.id)}
            />
          ))}

          {/* Slicers */}
          {(activeSheet.slicers ?? []).map(col => {
            const values = getUniqueColValues(col);
            const allowed = activeSheet.filters[col] ?? [];
            const isOn = (v: string) => allowed.length === 0 || allowed.includes(v);
            const setAllowed = (next: string[]) => setSheets(prev => { const n = prev.map(sh => sh.id === activeSheetId ? { ...sh, filters: { ...sh.filters, [col]: next } } : sh); scheduleSave(n, title); return n; });
            const toggle = (v: string) => {
              if (allowed.length === 0) setAllowed(values.filter(x => x !== v));
              else if (allowed.includes(v)) setAllowed(allowed.filter(x => x !== v));
              else setAllowed([...allowed, v]);
            };
            return (
              <div key={"slicer_" + col} className="mx-4 my-4 inline-block align-top bg-white border border-[#e8eaed] rounded-xl p-3 shadow-sm" style={{ minWidth: 180, maxWidth: 240 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#202124]">Slicer · {indexToCol(col)}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setAllowed([])} title="Show all" className="text-[10px] text-[#5f6368] hover:text-[#1a56db] px-1">All</button>
                    <button onClick={() => setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, slicers: (sh.slicers ?? []).filter(x => x !== col) } : sh))} className="text-[#80868b] hover:text-[#ea4335]"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 max-h-44 overflow-y-auto">
                  {values.length === 0 && <span className="text-[11px] text-[#80868b]">No values</span>}
                  {values.map(v => (
                    <button key={v} onClick={() => toggle(v)}
                      className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${isOn(v) ? "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/30" : "bg-white text-[#80868b] border-[#e8eaed] line-through"}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Panel */}
        {showAI && (
          <AISheetPanel
            sheet={activeSheet}
            sel={sel}
            getCellDisplayValue={getCellDisplayValue}
            computeCell={computeCell}
            onClose={() => setShowAI(false)}
            onInsertFormula={(formula) => {
              updateCell(sel.r, sel.c, formula);
              setShowAI(false);
              toast.success("Formula inserted");
            }}
          />
        )}
      </div>

      {/* ── Sheet tabs ── */}
      <div className="flex items-center gap-0 border-t border-[#e8eaed] bg-[#f8f9fa] px-2 overflow-x-auto">
        {sheets.map(sh => (
          <div key={sh.id} className={`group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-r border-[#e8eaed] transition-colors ${sh.id === activeSheetId ? "bg-white text-[#1a56db] font-semibold border-t-2 border-t-[#1a56db]" : "text-[#5f6368] hover:bg-[#e8eaed]"}`}
            onClick={() => { if (editingSheetName !== sh.id) setActiveSheetId(sh.id); }}
            onDoubleClick={() => { setEditingSheetName(sh.id); setRenameVal(sh.name); }}
          >
            {editingSheetName === sh.id ? (
              <input
                autoFocus
                className="w-20 text-xs border border-[#1a56db] rounded px-1 outline-none"
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={() => {
                  setSheets(prev => prev.map(s => s.id === sh.id ? { ...s, name: renameVal || s.name } : s));
                  setEditingSheetName(null);
                }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { e.currentTarget.blur(); } }}
              />
            ) : sh.name}
            {sheets.length > 1 && (
              <button className="hidden group-hover:flex items-center ml-1 text-[#80868b] hover:text-[#ea4335]"
                onClick={e => { e.stopPropagation(); deleteSheet(sh.id); }}>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addSheet} className="flex items-center gap-1 px-2 py-1.5 text-xs text-[#5f6368] hover:bg-[#e8eaed] rounded">
          <Plus className="h-3.5 w-3.5" />
        </button>

        {/* Selection status bar (Excel-style) */}
        {selStats && (
          <div className="ml-auto flex items-center gap-4 pr-3 text-[11px] text-[#5f6368] whitespace-nowrap">
            {selStats.numCount > 0 && <span>Sum: <span className="font-semibold text-[#202124]">{fmtStat(selStats.sum)}</span></span>}
            {selStats.numCount > 0 && <span>Avg: <span className="font-semibold text-[#202124]">{fmtStat(selStats.avg)}</span></span>}
            {selStats.numCount > 0 && <span>Min: <span className="font-semibold text-[#202124]">{fmtStat(selStats.min)}</span></span>}
            {selStats.numCount > 0 && <span>Max: <span className="font-semibold text-[#202124]">{fmtStat(selStats.max)}</span></span>}
            <span>Count: <span className="font-semibold text-[#202124]">{selStats.count}</span></span>
          </div>
        )}
      </div>

      {/* ── Right-click context menu ── */}
      {cellCtx && (
        <div
          className="fixed z-[60] w-52 bg-white border border-[#e8eaed] rounded-lg shadow-lg py-1 text-[#202124]"
          style={{ left: Math.min(cellCtx.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 220), top: Math.min(cellCtx.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 380) }}
          onClick={e => e.stopPropagation()}
        >
          <MenuItem onClick={() => { void cutSelection(); setCellCtx(null); }}>Cut</MenuItem>
          <MenuItem onClick={() => { void copySelection(); setCellCtx(null); }}>Copy</MenuItem>
          <MenuItem onClick={() => { void pasteFromClipboard(); setCellCtx(null); }}>Paste</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          <MenuItem onClick={() => { insertRow(cellCtx.r); setCellCtx(null); }}>Insert row above</MenuItem>
          <MenuItem onClick={() => { insertRow(cellCtx.r + 1); setCellCtx(null); }}>Insert row below</MenuItem>
          <MenuItem onClick={() => { deleteRowAt(cellCtx.r); setCellCtx(null); }}>Delete row</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          <MenuItem onClick={() => { insertCol(cellCtx.c); setCellCtx(null); }}>Insert column left</MenuItem>
          <MenuItem onClick={() => { insertCol(cellCtx.c + 1); setCellCtx(null); }}>Insert column right</MenuItem>
          <MenuItem onClick={() => { deleteColAt(cellCtx.c); setCellCtx(null); }}>Delete column</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          <MenuItem onClick={() => { sortByCol(cellCtx.c, "asc"); setCellCtx(null); }}>Sort sheet A → Z (this column)</MenuItem>
          <MenuItem onClick={() => { sortByCol(cellCtx.c, "desc"); setCellCtx(null); }}>Sort sheet Z → A (this column)</MenuItem>
          <MenuItem onClick={() => { setSheets(prev => { const next = prev.map(sh => sh.id === activeSheetId ? { ...sh, slicers: [...new Set([...(sh.slicers ?? []), cellCtx.c])] } : sh); scheduleSave(next, title); return next; }); setCellCtx(null); }}>Insert slicer (this column)</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          <MenuItem onClick={() => { setFreeze({ frozenRows: cellCtx.r + 1 }); setCellCtx(null); }}>Freeze up to this row</MenuItem>
          <MenuItem onClick={() => { setFreeze({ frozenCols: cellCtx.c + 1 }); setCellCtx(null); }}>Freeze up to this column</MenuItem>
          <MenuItem onClick={() => { setFreeze({ frozenRows: 0, frozenCols: 0 }); setCellCtx(null); }}>Unfreeze</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          <MenuItem onClick={() => { mergeCells(); setCellCtx(null); }}>Merge cells</MenuItem>
          <MenuItem onClick={() => { unmergeAt(cellCtx.r, cellCtx.c); setCellCtx(null); }}>Unmerge</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          <MenuItem onClick={() => { insertSparkline(); setCellCtx(null); }}>Insert sparkline</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          <MenuItem onClick={() => { updateCell(cellCtx.r, cellCtx.c, ""); setCellCtx(null); }}>Clear contents</MenuItem>
          <MenuItem onClick={() => { setSheets(prev => { const next = prev.map(sh => sh.id === activeSheetId ? { ...sh, hiddenRows: new Set<number>(), hiddenCols: new Set<number>() } : sh); scheduleSave(next, title); return next; }); setCellCtx(null); }}>Show all hidden rows/columns</MenuItem>
          <div className="border-t border-[#e8eaed] my-1" />
          {isProtected(cellCtx.r, cellCtx.c)
            ? <MenuItem onClick={() => { unprotectAt(cellCtx.r, cellCtx.c); setCellCtx(null); }}>Unprotect range</MenuItem>
            : <MenuItem onClick={() => { protectSelection(); setCellCtx(null); }}>Protect selection</MenuItem>}
        </div>
      )}

      {/* ── Modals ── */}
      {showShare && <DocShareModal docId={sheetId} docType="sheet" onClose={() => setShowShare(false)} />}
      {showChart && (
        <ChartDialog
          defaultRange={selEnd ? `${toA1(Math.min(sel.r, selEnd.r), Math.min(sel.c, selEnd.c))}:${toA1(Math.max(sel.r, selEnd.r), Math.max(sel.c, selEnd.c))}` : "A1:B10"}
          onClose={() => setShowChart(false)}
          onInsert={(chart) => {
            setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, charts: [...sh.charts, { ...chart, id: `ch_${Date.now()}` }] } : sh));
            setShowChart(false);
            toast.success("Chart inserted");
          }}
        />
      )}
      {showCF && (
        <CFDialog
          defaultRange={selEnd ? `${toA1(Math.min(sel.r, selEnd.r), Math.min(sel.c, selEnd.c))}:${toA1(Math.max(sel.r, selEnd.r), Math.max(sel.c, selEnd.c))}` : toA1(sel.r, sel.c)}
          rules={activeSheet.conditionalRules ?? []}
          onClose={() => setShowCF(false)}
          onAdd={(rule) => {
            setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, conditionalRules: [...(sh.conditionalRules ?? []), { ...rule, id: `cf_${Date.now()}` }] } : sh));
            setShowCF(false);
            toast.success("Rule added");
          }}
          onRemove={(id) => {
            setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, conditionalRules: (sh.conditionalRules ?? []).filter(r => r.id !== id) } : sh));
          }}
        />
      )}
      {showFilter && filterCol !== null && (
        <FilterDialog
          col={filterCol}
          values={getUniqueColValues(filterCol)}
          current={activeSheet.filters[filterCol] ?? []}
          colLabel={indexToCol(filterCol)}
          onClose={() => setShowFilter(false)}
          onApply={(allowed) => {
            setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, filters: { ...sh.filters, [filterCol]: allowed } } : sh));
            setShowFilter(false);
          }}
        />
      )}
      {showNames && (
        <NamesDialog
          names={namedRanges}
          defaultRange={selEnd ? `${toA1(Math.min(sel.r, selEnd.r), Math.min(sel.c, selEnd.c))}:${toA1(Math.max(sel.r, selEnd.r), Math.max(sel.c, selEnd.c))}` : toA1(sel.r, sel.c)}
          onClose={() => setShowNames(false)}
          onSave={applyNamedRanges}
        />
      )}
      {showValidation && (
        <ValidationDialog
          defaultRange={selEnd ? `${toA1(Math.min(sel.r, selEnd.r), Math.min(sel.c, selEnd.c))}:${toA1(Math.max(sel.r, selEnd.r), Math.max(sel.c, selEnd.c))}` : toA1(sel.r, sel.c)}
          rules={activeSheet.dataValidations ?? []}
          onClose={() => setShowValidation(false)}
          onAdd={(rule) => { addValidation(rule); }}
          onRemove={(id) => removeValidation(id)}
        />
      )}
      {showFindReplace && (
        <FindReplaceDialog
          onClose={() => setShowFindReplace(false)}
          countMatches={countMatches}
          onFindNext={findNext}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
        />
      )}
      {showTemplates && (
        <TemplatesDialog
          hasData={Object.keys(activeSheet.cells).length > 0}
          onClose={() => setShowTemplates(false)}
          onApply={applyTemplate}
        />
      )}
      {showPivot && (
        <PivotDialog
          defaultRange={selEnd ? `${toA1(Math.min(sel.r, selEnd.r), Math.min(sel.c, selEnd.c))}:${toA1(Math.max(sel.r, selEnd.r), Math.max(sel.c, selEnd.c))}` : "A1:D100"}
          existing={activeSheet.pivots ?? []}
          readHeaders={(rangeStr) => (rangeTo2D(rangeStr, activeSheet)[0] ?? [])}
          onClose={() => setShowPivot(false)}
          onAdd={(p) => { addPivot(p); toast.success("Pivot table inserted"); }}
          onRemove={(id) => removePivot(id)}
        />
      )}
      {showNote && (
        <NoteDialog
          cellLabel={toA1(sel.r, sel.c)}
          initial={selNote}
          onClose={() => setShowNote(false)}
          onSave={(note) => { setCellNote(sel.r, sel.c, note); setShowNote(false); toast.success(note.trim() ? "Note saved" : "Note removed"); }}
          onDelete={() => { setCellNote(sel.r, sel.c, ""); setShowNote(false); toast.success("Note removed"); }}
        />
      )}
      {showRemoveDupes && (
        <RemoveDuplicatesDialog
          rangeLabel={selEnd
            ? toA1(Math.min(sel.r, selEnd.r), Math.min(sel.c, selEnd.c)) + ":" + toA1(Math.max(sel.r, selEnd.r), Math.max(sel.c, selEnd.c))
            : toA1(sel.r, sel.c)}
          onClose={() => setShowRemoveDupes(false)}
          onApply={(hasHeader) => removeDuplicates(hasHeader)}
        />
      )}
      {showSplitText && (
        <SplitTextDialog
          colLabel={indexToCol(sel.c)}
          onClose={() => setShowSplitText(false)}
          onApply={(delimiter) => splitTextToColumns(delimiter)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Sep() { return <div className="w-px h-5 bg-[#e8eaed] mx-0.5" />; }

function ToolBtn({ icon, title, active, onClick }: { icon: React.ReactNode; title: string; active?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button title={title} onClick={onClick}
      className={`flex items-center justify-center h-7 w-7 rounded text-sm transition-colors ${active ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
      {icon}
    </button>
  );
}

const PALETTE = [
  "#202124","#5f6368","#80868b","#bdc1c6","#f8f9fa","#ffffff",
  "#ea4335","#ff6d00","#f4b400","#0f9d58","#1a56db","#9334e6",
  "#fad2cf","#fce8b2","#b7e1cd","#c9e2f9","#e6d4f5","#d2e3fc",
];

function ColorPicker({ onSelect }: { onSelect: (c: string) => void }) {
  return (
    <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 w-36" onClick={e => e.stopPropagation()}>
      <div className="grid grid-cols-6 gap-1">
        {PALETTE.map(c => (
          <button key={c} className="h-4 w-4 rounded border border-[#e8eaed] hover:scale-110 transition-transform" style={{ background: c }} onClick={() => onSelect(c)} />
        ))}
      </div>
      <input type="color" className="w-full mt-2 h-6 cursor-pointer" onChange={e => onSelect(e.target.value)} />
    </div>
  );
}

// ─── Column header ──────────────────────────────────────────────────────────

function ColHeader({ col: _col, label, width, hidden, selected, onResize, onAutofit, onHide, onSort, onFilter, filterActive }: {
  col: number; label: string; width: number; hidden: boolean; selected: boolean;
  onResize: (w: number) => void; onAutofit: () => void; onHide: () => void; onSort: (d: "asc" | "desc") => void;
  onFilter: () => void; filterActive: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const resizing = useRef<{ startX: number; startW: number } | null>(null);

  if (hidden) return (
    <div
      title={"Show column " + label}
      onClick={onHide}
      style={{ width: 6, height: COL_HEADER_H, background: "#d0d5dd", cursor: "pointer", borderRight: "1px solid #9aa0a6", borderLeft: "1px solid #9aa0a6" }}
    />
  );

  return (
    <div
      className={`relative flex items-center justify-center text-xs font-semibold sticky top-0 z-10 border-r border-b border-[#e8eaed] select-none cursor-pointer group ${selected ? "bg-[#e8f0fe] text-[#1a56db]" : "bg-[#f8f9fa] text-[#5f6368] hover:bg-[#e8eaed]"}`}
      style={{ height: COL_HEADER_H, width }}
      onContextMenu={e => { e.preventDefault(); setMenu(true); }}
    >
      {label}
      {filterActive && <div className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#1a56db]" />}
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#1a56db]"
        title="Drag to resize · double-click to autofit"
        onDoubleClick={e => { e.stopPropagation(); onAutofit(); }}
        onMouseDown={e => {
          e.preventDefault();
          resizing.current = { startX: e.clientX, startW: width };
          const onMove = (ev: MouseEvent) => {
            if (!resizing.current) return;
            onResize(Math.max(40, resizing.current.startW + ev.clientX - resizing.current.startX));
          };
          const onUp = () => { resizing.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />
      {menu && (
        <div className="absolute top-full left-0 mt-0.5 w-36 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1 text-[#202124]" onClick={e => e.stopPropagation()}>
          <MenuItem onClick={() => { onSort("asc"); setMenu(false); }}><SortAsc className="h-3 w-3" /> Sort A→Z</MenuItem>
          <MenuItem onClick={() => { onSort("desc"); setMenu(false); }}><SortDesc className="h-3 w-3" /> Sort Z→A</MenuItem>
          <MenuItem onClick={() => { onFilter(); setMenu(false); }}><Filter className="h-3 w-3" /> Filter</MenuItem>
          <MenuItem onClick={() => { onHide(); setMenu(false); }}><EyeOff className="h-3 w-3" /> Hide</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#f1f3f4]" onClick={onClick}>{children}</button>;
}

function FreezeMenuItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#f1f3f4] ${active ? "text-[#1a56db] font-medium" : "text-[#202124]"}`}>
      <span>{label}</span>
      {active && <Check className="h-3 w-3 text-[#1a56db]" />}
    </button>
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────

type TemplateDef = { id: string; name: string; description: string; build: () => Record<string, Cell> };

// Helper: build a cells map from a 2D array of { v, bold? } (or null to skip).
function buildCells(grid: (null | { v: string; bold?: boolean })[][]): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) return;
      const key = r + ":" + c;
      cells[key] = cell.bold ? { v: cell.v, s: { bold: true } } : { v: cell.v };
    });
  });
  return cells;
}

const SHEET_TEMPLATES: TemplateDef[] = [
  {
    id: "budget",
    name: "Monthly Budget",
    description: "Income & expenses with an auto-summed total.",
    build: () => buildCells([
      [{ v: "Monthly Budget", bold: true }],
      [],
      [{ v: "Category", bold: true }, { v: "Budget", bold: true }, { v: "Actual", bold: true }, { v: "Difference", bold: true }],
      [{ v: "Salary" }, { v: "4000" }, { v: "4000" }, { v: "=C4-B4" }],
      [{ v: "Rent" }, { v: "1200" }, { v: "1200" }, { v: "=C5-B5" }],
      [{ v: "Groceries" }, { v: "450" }, { v: "512" }, { v: "=C6-B6" }],
      [{ v: "Utilities" }, { v: "180" }, { v: "165" }, { v: "=C7-B7" }],
      [{ v: "Transport" }, { v: "220" }, { v: "240" }, { v: "=C8-B8" }],
      [{ v: "Entertainment" }, { v: "150" }, { v: "190" }, { v: "=C9-B9" }],
      [],
      [{ v: "Total", bold: true }, { v: "=SUM(B4:B9)", bold: true }, { v: "=SUM(C4:C9)", bold: true }, { v: "=SUM(D4:D9)", bold: true }],
    ]),
  },
  {
    id: "invoice",
    name: "Invoice",
    description: "Line items with quantity, price and grand total.",
    build: () => buildCells([
      [{ v: "INVOICE", bold: true }],
      [{ v: "Invoice #" }, { v: "INV-1001" }],
      [{ v: "Date" }, { v: "2026-06-14" }],
      [{ v: "Bill To" }, { v: "Acme Corp" }],
      [],
      [{ v: "Item", bold: true }, { v: "Qty", bold: true }, { v: "Unit Price", bold: true }, { v: "Amount", bold: true }],
      [{ v: "Consulting (hrs)" }, { v: "10" }, { v: "150" }, { v: "=B7*C7" }],
      [{ v: "Setup fee" }, { v: "1" }, { v: "500" }, { v: "=B8*C8" }],
      [{ v: "Support plan" }, { v: "3" }, { v: "99" }, { v: "=B9*C9" }],
      [],
      [{ v: "Subtotal", bold: true }, null, null, { v: "=SUM(D7:D9)", bold: true }],
      [{ v: "Tax (10%)" }, null, null, { v: "=D11*0.1" }],
      [{ v: "Total Due", bold: true }, null, null, { v: "=D11+D12", bold: true }],
    ]),
  },
  {
    id: "tracker",
    name: "Project Tracker",
    description: "Task list with status, owner and progress total.",
    build: () => buildCells([
      [{ v: "Project Tracker", bold: true }],
      [],
      [{ v: "Task", bold: true }, { v: "Owner", bold: true }, { v: "Status", bold: true }, { v: "Priority", bold: true }, { v: "% Done", bold: true }],
      [{ v: "Define requirements" }, { v: "Alice" }, { v: "Done" }, { v: "High" }, { v: "100" }],
      [{ v: "Design mockups" }, { v: "Bob" }, { v: "In Progress" }, { v: "High" }, { v: "60" }],
      [{ v: "Build backend" }, { v: "Carol" }, { v: "In Progress" }, { v: "Medium" }, { v: "40" }],
      [{ v: "Write tests" }, { v: "Dan" }, { v: "Todo" }, { v: "Medium" }, { v: "0" }],
      [{ v: "Launch" }, { v: "Eve" }, { v: "Todo" }, { v: "Low" }, { v: "0" }],
      [],
      [{ v: "Avg progress", bold: true }, null, null, null, { v: "=AVERAGE(E4:E8)", bold: true }],
    ]),
  },
];

function TemplatesDialog({ hasData, onClose, onApply }: {
  hasData: boolean;
  onClose: () => void;
  onApply: (cells: Record<string, Cell>) => void;
}) {
  const [selected, setSelected] = useState<TemplateDef | null>(null);

  const choose = (t: TemplateDef) => {
    if (hasData) { setSelected(t); return; }
    onApply(t.build());
  };

  return (
    <Modal title="Insert template" onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-[#5f6368]">Start from a ready-made layout. Each one fills this sheet with sample rows and live formulas.</p>

        <div className="space-y-2">
          {SHEET_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => choose(t)}
              className="w-full text-left bg-[#f8f9fa] border border-[#e8eaed] rounded-lg px-3 py-2.5 hover:border-[#1a56db]/40 hover:bg-[#e8f0fe]/40 transition-colors flex items-center gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#e8f0fe] text-[#1a56db] flex-shrink-0">
                <LayoutGrid className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#202124]">{t.name}</div>
                <div className="text-[11px] text-[#5f6368] truncate">{t.description}</div>
              </div>
            </button>
          ))}
        </div>

        {hasData && selected && (
          <div className="bg-[#fce8b2]/40 border border-[#f4b400]/40 rounded-lg p-3 space-y-2">
            <p className="text-xs text-[#202124]">This replaces the current sheet contents with the <span className="font-semibold">{selected.name}</span> template. This can&apos;t be undone except via Undo (⌘Z).</p>
            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} className="flex-1 px-3 py-1.5 text-xs border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
              <button onClick={() => onApply(selected.build())} className="flex-1 px-3 py-1.5 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Replace contents</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Close</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function Row({ row, cols, sheet, sel, selEnd, editing, editVal, cellInputRef, colWidths, rowHeight, frozenRows, frozenCols, frozenColLefts, frozenRowTops, getCellDisplayValue, getCFStyle, getCellValidation, dvDropdown, onOpenDropdown, onPickValidation, onCloseDropdown, fillDrag, fillTo, onStartFill, onCellEnter, onCellMouseDown, onCellContextMenu, onCellClick, onCellDoubleClick, onEditChange, onEditCommit, onEditCancel, onRowResize, onHideRow }: {
  row: number; cols: number; sheet: SheetTab; sel: { r: number; c: number }; selEnd: { r: number; c: number } | null;
  editing: boolean; editVal: string; cellInputRef: React.RefObject<HTMLInputElement | null>;
  colWidths: Record<number, number>; rowHeight: number;
  frozenRows: number; frozenCols: number;
  frozenColLefts: Record<number, number>; frozenRowTops: Record<number, number>;
  getCellDisplayValue: (r: number, c: number, s: SheetTab) => string;
  getCFStyle: (r: number, c: number, s: SheetTab) => Partial<CellStyle>;
  getCellValidation: (r: number, c: number) => DataValidation | null;
  dvDropdown: { r: number; c: number; values: string[] } | null;
  onOpenDropdown: (r: number, c: number, values: string[]) => void;
  onPickValidation: (r: number, c: number, val: string) => void;
  onCloseDropdown: () => void;
  fillDrag: { r1: number; c1: number; r2: number; c2: number } | null;
  fillTo: { r: number; c: number } | null;
  onStartFill: () => void;
  onCellEnter: (r: number, c: number) => void;
  onCellMouseDown: (r: number, c: number, shift: boolean) => void;
  onCellContextMenu: (r: number, c: number, x: number, y: number) => void;
  onCellClick: (r: number, c: number, shift: boolean) => void;
  onCellDoubleClick: (r: number, c: number) => void;
  onEditChange: (v: string) => void;
  onEditCommit: (dir: "down" | "right" | "none") => void;
  onEditCancel: () => void;
  onRowResize: (h: number) => void;
  onHideRow: () => void;
}) {
  const resizing = useRef<{ startY: number; startH: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState(false);

  const inSel = (c: number) => {
    if (!selEnd) return row === sel.r && c === sel.c;
    return row >= Math.min(sel.r, selEnd.r) && row <= Math.max(sel.r, selEnd.r) &&
      c >= Math.min(sel.c, selEnd.c) && c <= Math.max(sel.c, selEnd.c);
  };

  // Selection bottom-right (where the fill handle sits)
  const selR2 = selEnd ? Math.max(sel.r, selEnd.r) : sel.r;
  const selC2 = selEnd ? Math.max(sel.c, selEnd.c) : sel.c;
  const inFillPreview = (c: number) => {
    if (!fillDrag || !fillTo) return false;
    const down = Math.max(0, fillTo.r - fillDrag.r2);
    const right = Math.max(0, fillTo.c - fillDrag.c2);
    if (down === 0 && right === 0) return false;
    if (down >= right) return c >= fillDrag.c1 && c <= fillDrag.c2 && row > fillDrag.r2 && row <= fillTo.r;
    return row >= fillDrag.r1 && row <= fillDrag.r2 && c > fillDrag.c2 && c <= fillTo.c;
  };

  const isFrozenRow = row < frozenRows;
  const isLastFrozenRow = isFrozenRow && row === frozenRows - 1;
  // Row header sits in the frozen-col territory already (sticky left). Stack it above
  // body cells; when the row is also frozen, give it the highest z so the corner stays on top.
  const rowHeaderStyle: React.CSSProperties = {
    height: rowHeight,
    width: ROW_HEADER_W,
    ...(isFrozenRow ? { position: "sticky", top: frozenRowTops[row], zIndex: 30 } : {}),
    ...(isLastFrozenRow ? { borderBottom: "2px solid #d0d5dd" } : {}),
  };

  return (
    <>
      {/* Row header */}
      <div
        className={`sticky left-0 z-10 flex items-center justify-center text-xs text-[#5f6368] border-r border-b border-[#e8eaed] select-none bg-[#f8f9fa] cursor-pointer group relative
          ${inSel(0) ? "bg-[#e8f0fe]" : "hover:bg-[#e8eaed]"}`}
        style={rowHeaderStyle}
        onContextMenu={e => { e.preventDefault(); setCtxMenu(true); }}
      >
        {row + 1}
        {/* Row resize */}
        <div className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-[#1a56db]"
          onMouseDown={e => {
            e.preventDefault();
            resizing.current = { startY: e.clientY, startH: rowHeight };
            const onMove = (ev: MouseEvent) => { if (resizing.current) onRowResize(Math.max(16, resizing.current.startH + ev.clientY - resizing.current.startY)); };
            const onUp = () => { resizing.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
        {ctxMenu && (
          <div className="absolute top-0 left-full ml-1 w-32 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1 text-[#202124]" onClick={e => e.stopPropagation()}>
            <MenuItem onClick={() => { onHideRow(); setCtxMenu(false); }}><EyeOff className="h-3 w-3" /> Hide row</MenuItem>
          </div>
        )}
      </div>

      {/* Cells */}
      {Array.from({ length: cols }, (_, c) => {
        if (sheet.hiddenCols.has(c)) return null;
        const cell = sheet.cells[ck(row, c)];
        if (cell?.merged) return null;

        const isSelected = row === sel.r && c === sel.c;
        const isInRange = inSel(c);
        const isEditing = editing && isSelected;
        const display = getCellDisplayValue(row, c, sheet);
        const style = cell?.s ?? {};
        const cfStyle = getCFStyle(row, c, sheet);
        const w = colWidths[c] ?? DEFAULT_COL_W;
        const span = cell?.mergeSpan;
        const validation = getCellValidation(row, c);
        const dropdownOpen = dvDropdown?.r === row && dvDropdown?.c === c;

        const isFrozenCol = c < frozenCols;
        const cellIsFrozenRow = row < frozenRows;
        const isLastFrozenCol = isFrozenCol && c === frozenCols - 1;
        const cellIsLastFrozenRow = cellIsFrozenRow && row === frozenRows - 1;
        // Frozen cells must paint over scrolling ones — give them an opaque fill
        // (transparent sticky cells would let scrolled content show through).
        const frozenBg = cfStyle.background ?? style.background ?? "#ffffff";
        const stickyFreeze: React.CSSProperties = (isFrozenCol || cellIsFrozenRow) ? {
          position: "sticky",
          ...(isFrozenCol ? { left: frozenColLefts[c] } : {}),
          ...(cellIsFrozenRow ? { top: frozenRowTops[row] } : {}),
          background: frozenBg,
          // corner (row+col frozen) highest, then frozen rows, then frozen cols
          zIndex: isFrozenCol && cellIsFrozenRow ? 25 : cellIsFrozenRow ? 20 : 15,
        } : {};

        const cellStyle: React.CSSProperties = {
          width: span ? undefined : w,
          height: rowHeight,
          minWidth: w,
          fontFamily: style.fontFamily ?? "Arial",
          fontSize: style.fontSize ?? 12,
          fontWeight: style.bold ? "bold" : "normal",
          fontStyle: style.italic ? "italic" : "normal",
          textDecoration: [style.underline && "underline", style.strikethrough && "line-through"].filter(Boolean).join(" ") || "none",
          textAlign: style.align ?? "left",
          color: cfStyle.color ?? style.color ?? "#202124",
          background: cfStyle.background ?? style.background ?? "transparent",
          whiteSpace: style.wrap ? "pre-wrap" : "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...(span ? { gridColumn: `span ${span.cols}`, gridRow: `span ${span.rows}` } : {}),
          ...stickyFreeze,
          ...(isLastFrozenCol ? { borderRight: "2px solid #d0d5dd" } : {}),
          ...(cellIsLastFrozenRow ? { borderBottom: "2px solid #d0d5dd" } : {}),
          ...(style.border?.top ? { borderTop: "1px solid #5f6368" } : {}),
          ...(style.border?.bottom ? { borderBottom: "1px solid #5f6368" } : {}),
          ...(style.border?.left ? { borderLeft: "1px solid #5f6368" } : {}),
          ...(style.border?.right ? { borderRight: "1px solid #5f6368" } : {}),
        };

        const isFillPreview = inFillPreview(c);
        const isFillHandleCell = row === selR2 && c === selC2 && !editing;

        return (
          <div
            key={c}
            className={`relative border-r border-b border-[#e8eaed] px-1 cursor-cell select-none transition-colors
              ${isSelected ? "outline outline-2 outline-[#1a56db] z-[5]" : isInRange ? "bg-[#e8f0fe]/60" : ""}
              ${isFillPreview ? "outline-dashed outline-1 outline-[#1a56db]/60 bg-[#e8f0fe]/40" : ""}`}
            style={cellStyle}
            data-cellrow={row}
            data-cellcol={c}
            onMouseDown={e => { if (e.button === 0) onCellMouseDown(row, c, e.shiftKey); }}
            onClick={e => onCellClick(row, c, e.shiftKey)}
            onDoubleClick={() => onCellDoubleClick(row, c)}
            onContextMenu={e => { e.preventDefault(); onCellContextMenu(row, c, e.clientX, e.clientY); }}
            onMouseEnter={() => onCellEnter(row, c)}
          >
            {isEditing ? (
              <input
                ref={cellInputRef}
                className="absolute inset-0 w-full h-full px-1 text-xs font-mono outline-none border-none bg-white z-10"
                style={{ fontFamily: style.fontFamily ?? "Arial", fontSize: style.fontSize ?? 12 }}
                value={editVal}
                onChange={e => onEditChange(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); onEditCommit("down"); }
                  else if (e.key === "Tab") { e.preventDefault(); onEditCommit("right"); }
                  else if (e.key === "Escape") { onEditCancel(); }
                }}
                onBlur={() => onEditCommit("none")}
              />
            ) : cell?.spark ? (
              <SparklineCell spark={cell.spark} sheet={sheet} getCellDisplayValue={getCellDisplayValue} height={rowHeight} />
            ) : (
              <span className="text-xs leading-none flex items-center h-full" style={{ fontSize: style.fontSize ?? 12, paddingLeft: (style.indent ?? 0) * 12 }}>
                {display}
              </span>
            )}

            {/* Data-validation dropdown caret */}
            {validation && validation.type === "list" && !isEditing && (
              <button
                title="Choose from list"
                onClick={e => { e.stopPropagation(); onOpenDropdown(row, c, validation.values); }}
                className="absolute right-0 top-1/2 -translate-y-1/2 h-full w-4 flex items-center justify-center text-[#5f6368] hover:text-[#1a56db] bg-[#f1f3f4]/80 z-[6]"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            )}

            {/* Data-validation dropdown menu */}
            {dropdownOpen && (
              <div
                className="absolute left-0 top-full mt-0.5 min-w-full max-h-48 overflow-y-auto bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1"
                onClick={e => e.stopPropagation()}
              >
                {validation?.values.length ? validation.values.map(v => (
                  <button key={v} onClick={() => onPickValidation(row, c, v)}
                    className="w-full text-left px-3 py-1.5 text-xs text-[#202124] hover:bg-[#e8f0fe] whitespace-nowrap flex items-center gap-2">
                    {display === v && <Check className="h-3 w-3 text-[#1a56db]" />}
                    <span className={display === v ? "" : "pl-5"}>{v}</span>
                  </button>
                )) : <div className="px-3 py-1.5 text-xs text-[#80868b]">No options</div>}
                <button onClick={onCloseDropdown} className="w-full text-left px-3 py-1 text-[11px] text-[#80868b] hover:bg-[#f1f3f4] border-t border-[#e8eaed] mt-1">Close</button>
              </div>
            )}

            {/* Note indicator (small triangle, top-right) + hover popover */}
            {cell?.note && !isEditing && (
              <div className="group/note absolute top-0 right-0 z-[7]">
                <div
                  className="w-0 h-0 cursor-default"
                  style={{ borderTop: "7px solid #f4b400", borderLeft: "7px solid transparent" }}
                  title={cell.note}
                />
                <div className="hidden group-hover/note:block absolute top-2 right-0 z-[40] w-48 max-w-[12rem] whitespace-pre-wrap break-words bg-white border border-[#e8eaed] rounded-lg shadow-lg px-3 py-2 text-[11px] text-[#202124] leading-relaxed">
                  {cell.note}
                </div>
              </div>
            )}

            {/* Fill handle (drag to autofill) */}
            {isFillHandleCell && (
              <div
                title="Drag to fill"
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onStartFill(); }}
                className="absolute -bottom-[3px] -right-[3px] h-[7px] w-[7px] bg-[#1a56db] border border-white cursor-crosshair z-[8]"
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Chart Widget ─────────────────────────────────────────────────────────────

function ChartWidget({ chart, sheet, computeCell, onRemove }: {
  chart: ChartDef; sheet: SheetTab;
  computeCell: (v: string, s: SheetTab) => CellValue;
  onRemove: () => void;
}) {
  const range = parseRange(chart.range);
  if (!range) return null;

  const rows: (string | number)[][] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    const row: (string | number)[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) {
      const cell = sheet.cells[ck(r, c)];
      row.push(cell?.v ? (computeCell(cell.v, sheet) ?? "") as string | number : "");
    }
    rows.push(row);
  }

  const headers = chart.hasHeader ? (rows[0] as string[]) : rows[0].map((_, i) => `Series ${i + 1}`);
  const dataRows = chart.hasHeader ? rows.slice(1) : rows;
  const chartData = dataRows.map(row => {
    const obj: Record<string, string | number> = { name: String(row[0]) };
    headers.slice(1).forEach((h, i) => { obj[String(h)] = Number(row[i + 1]) || 0; });
    return obj;
  });

  const keys = headers.slice(1).map(String);
  const colors = chart.colors.length ? chart.colors : CHART_COLORS;

  const renderChart = () => {
    switch (chart.type) {
      case "bar": return (
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {keys.map((k, i) => <Bar key={k} dataKey={k} fill={colors[i % colors.length]} />)}
        </BarChart>
      );
      case "line": return (
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} dot={false} />)}
        </LineChart>
      );
      case "area": return (
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length] + "40"} />)}
        </AreaChart>
      );
      case "pie": return (
        <PieChart>
          <Pie data={chartData} dataKey={keys[0] ?? "value"} nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
            {chartData.map((_, i) => <PieCell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      );
      case "donut": return (
        <PieChart>
          <Pie data={chartData} dataKey={keys[0] ?? "value"} nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} label>
            {chartData.map((_, i) => <PieCell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      );
      case "combo": return (
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {keys.map((k, i) => i === keys.length - 1 && keys.length > 1
            ? <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} dot={false} strokeWidth={2} />
            : <Bar key={k} dataKey={k} fill={colors[i % colors.length]} />)}
        </ComposedChart>
      );
      case "radar": return (
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius={80}>
          <PolarGrid stroke="#e8eaed" />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend />
          {keys.map((k, i) => <Radar key={k} name={k} dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.3} />)}
        </RadarChart>
      );
      case "scatter": return (
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" type="number" tick={{ fontSize: 11 }} />
          <YAxis dataKey={keys[0]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Scatter data={chartData} fill={colors[0]} />
        </ScatterChart>
      );
    }
  };

  return (
    <div className="mx-4 my-4 bg-white border border-[#e8eaed] rounded-xl p-4 relative shadow-sm" style={{ width: 480, height: 300 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#202124]">{chart.title}</span>
        <button onClick={onRemove} className="text-[#80868b] hover:text-[#ea4335]"><X className="h-3.5 w-3.5" /></button>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {renderChart() ?? <div />}
      </ResponsiveContainer>
    </div>
  );
}

// ─── Chart Dialog ─────────────────────────────────────────────────────────────

function ChartDialog({ defaultRange, onClose, onInsert }: {
  defaultRange: string; onClose: () => void;
  onInsert: (c: Omit<ChartDef, "id">) => void;
}) {
  const [type, setType] = useState<ChartDef["type"]>("bar");
  const [range, setRange] = useState(defaultRange);
  const [title, setTitle] = useState("My Chart");
  const [hasHeader, setHasHeader] = useState(true);

  return (
    <Modal title="Insert Chart" onClose={onClose}>
      <div className="space-y-3 p-4">
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Chart type</label>
          <div className="flex gap-2 flex-wrap">
            {(["bar","line","area","pie","donut","combo","radar","scatter"] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${type === t ? "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/30" : "border-[#e8eaed] text-[#5f6368] hover:border-[#d0d5dd]"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Data range</label>
          <input className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm font-mono focus:outline-none focus:border-[#1a56db]/60"
            value={range} onChange={e => setRange(e.target.value)} placeholder="e.g. A1:C10" />
        </div>
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Title</label>
          <input className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm focus:outline-none focus:border-[#1a56db]/60"
            value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} />
          <span className="text-xs text-[#5f6368]">First row is header</span>
        </label>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={() => onInsert({ type, range: range.toUpperCase(), title, hasHeader, colors: CHART_COLORS })}
            className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">
            Insert
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Conditional Formatting Dialog ────────────────────────────────────────────

const CF_SWATCHES = [
  { bg: "#fce8e6", color: "#ea4335", label: "Red" },
  { bg: "#fef3e2", color: "#f57c00", label: "Orange" },
  { bg: "#fef9e0", color: "#f4b400", label: "Yellow" },
  { bg: "#e6f4ea", color: "#0f9d58", label: "Green" },
  { bg: "#e8f0fe", color: "#1a56db", label: "Blue" },
  { bg: "#f3e8fd", color: "#9334e6", label: "Purple" },
];

function CFDialog({ defaultRange, rules, onClose, onAdd, onRemove }: {
  defaultRange: string;
  rules: ConditionalRule[];
  onClose: () => void;
  onAdd: (r: Omit<ConditionalRule, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [range, setRange] = useState(defaultRange);
  const [ruleType, setRuleType] = useState<ConditionalRule["type"]>("gt");
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [bg, setBg] = useState(CF_SWATCHES[0].bg);
  const [color, setColor] = useState(CF_SWATCHES[0].color);
  const [bold, setBold] = useState(false);
  const [useTextColor, setUseTextColor] = useState(false);

  const parsedRange = parseRange(range.toUpperCase());
  const noValue = ruleType === "not_empty" || ruleType === "color_scale" || ruleType === "data_bar" || ruleType === "aboveAvg" || ruleType === "belowAvg";
  const noStyle = ruleType === "color_scale" || ruleType === "data_bar";

  const handleAdd = () => {
    if (!parsedRange) return toast.error("Invalid range");
    onAdd({
      range: { r1: parsedRange.startRow, c1: parsedRange.startCol, r2: parsedRange.endRow, c2: parsedRange.endCol },
      type: ruleType, value, value2,
      style: { background: bg, color: useTextColor ? color : undefined, bold: bold || undefined },
    });
  };

  const ruleLabel = (type: ConditionalRule["type"]) => {
    const map: Record<string, string> = {
      gt: "> Greater than", lt: "< Less than", gte: ">= Greater than or equal",
      lte: "<= Less than or equal", eq: "= Equal to", neq: "<> Not equal to",
      between: "Between", not_empty: "Not empty", contains: "Contains text",
      formula: "Formula is", top_n: "Top N", bottom_n: "Bottom N",
      aboveAvg: "Above average", belowAvg: "Below average",
      color_scale: "Color scale", data_bar: "Data bars",
    };
    return map[type] ?? type;
  };

  return (
    <Modal title="Conditional Formatting" onClose={onClose}>
      <div className="space-y-3 p-4 max-h-[80vh] overflow-y-auto">
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Range</label>
          <input className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm font-mono focus:outline-none focus:border-[#1a56db]/60"
            value={range} onChange={e => setRange(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Rule</label>
          <select className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm focus:outline-none"
            value={ruleType} onChange={e => setRuleType(e.target.value as ConditionalRule["type"])}>
            <option value="gt">Greater than</option>
            <option value="lt">Less than</option>
            <option value="gte">Greater than or equal</option>
            <option value="lte">Less than or equal</option>
            <option value="eq">Equal to</option>
            <option value="neq">Not equal to</option>
            <option value="between">Between</option>
            <option value="not_empty">Not empty</option>
            <option value="contains">Contains text</option>
            <option value="formula">Formula is</option>
            <option value="top_n">Top N values</option>
            <option value="bottom_n">Bottom N values</option>
            <option value="aboveAvg">Above average</option>
            <option value="belowAvg">Below average</option>
            <option value="color_scale">Color scale</option>
            <option value="data_bar">Data bars</option>
          </select>
        </div>
        {!noValue && (
          <div className="flex gap-2">
            <input placeholder={ruleType === "formula" ? "=A1>10" : "Value"} className="flex-1 px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm focus:outline-none focus:border-[#1a56db]/60"
              value={value} onChange={e => setValue(e.target.value)} />
            {ruleType === "between" && (
              <input placeholder="And" className="flex-1 px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm focus:outline-none focus:border-[#1a56db]/60"
                value={value2} onChange={e => setValue2(e.target.value)} />
            )}
          </div>
        )}
        {!noStyle && (
          <>
            <div>
              <label className="text-xs font-medium text-[#5f6368] mb-1.5 block">Fill color</label>
              <div className="flex gap-1.5 flex-wrap">
                {CF_SWATCHES.map(sw => (
                  <button key={sw.bg} title={sw.label} onClick={() => { setBg(sw.bg); setColor(sw.color); }}
                    className={"h-6 w-6 rounded border-2 transition-all " + (bg === sw.bg ? "border-[#1a56db] scale-110" : "border-[#e8eaed] hover:scale-105")}
                    style={{ background: sw.bg }} />
                ))}
                <input type="color" value={bg} onChange={e => setBg(e.target.value)} className="h-6 w-10 cursor-pointer rounded border border-[#e8eaed]" title="Custom fill" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[#5f6368]">
                <input type="checkbox" checked={useTextColor} onChange={e => setUseTextColor(e.target.checked)} />
                Custom text color
              </label>
              {useTextColor && (
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-6 w-10 cursor-pointer rounded border border-[#e8eaed]" />
              )}
              <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[#5f6368] ml-2">
                <input type="checkbox" checked={bold} onChange={e => setBold(e.target.checked)} />
                Bold
              </label>
            </div>
          </>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={handleAdd} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Add Rule</button>
        </div>

        {rules.length > 0 && (
          <>
            <div className="border-t border-[#e8eaed] pt-3">
              <div className="text-xs font-medium text-[#5f6368] mb-2">Manage Rules ({rules.length})</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {rules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-2 bg-[#f8f9fa] border border-[#e8eaed] rounded-lg px-3 py-1.5">
                    <div className="h-3.5 w-3.5 rounded flex-shrink-0 border border-[#e8eaed]" style={{ background: rule.style.background ?? "#f8f9fa" }} />
                    <span className="text-[11px] font-mono text-[#5f6368] flex-shrink-0">
                      {indexToCol(rule.range.c1)}{rule.range.r1 + 1}:{indexToCol(rule.range.c2)}{rule.range.r2 + 1}
                    </span>
                    <span className="text-[11px] text-[#202124] truncate flex-1">{ruleLabel(rule.type)}{rule.value ? " " + rule.value : ""}{rule.value2 ? "–" + rule.value2 : ""}</span>
                    <button onClick={() => onRemove(rule.id)} className="p-0.5 rounded text-[#80868b] hover:text-[#ea4335] flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Find & Replace Dialog ────────────────────────────────────────────────────

function FindReplaceDialog({ onClose, countMatches, onFindNext, onReplace, onReplaceAll }: {
  onClose: () => void;
  countMatches: (find: string, matchCase: boolean, wholeCell: boolean) => number;
  onFindNext: (find: string, matchCase: boolean, wholeCell: boolean) => boolean;
  onReplace: (find: string, replace: string, matchCase: boolean, wholeCell: boolean) => boolean;
  onReplaceAll: (find: string, replace: string, matchCase: boolean, wholeCell: boolean) => number;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);

  const count = countMatches(find, matchCase, wholeCell);

  return (
    <Modal title="Find & replace" onClose={onClose}>
      <div className="space-y-3 p-4">
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Find</label>
          <input autoFocus value={find} onChange={e => setFind(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onFindNext(find, matchCase, wholeCell); }}
            placeholder="Search for…"
            className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors" />
        </div>
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Replace with</label>
          <input value={replace} onChange={e => setReplace(e.target.value)}
            placeholder="Replace with…"
            className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors" />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-[#5f6368] cursor-pointer">
            <input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} /> Match case
          </label>
          <label className="flex items-center gap-2 text-xs text-[#5f6368] cursor-pointer">
            <input type="checkbox" checked={wholeCell} onChange={e => setWholeCell(e.target.checked)} /> Match entire cell
          </label>
        </div>
        <div className="text-[11px] text-[#80868b]">
          {find === "" ? "Enter a term to search" : count + " matching cell" + (count === 1 ? "" : "s")}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => { if (!onFindNext(find, matchCase, wholeCell)) toast.error("No matches found"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] transition-colors border border-[#e8eaed]">
            <Search className="h-3.5 w-3.5" /> Find next
          </button>
          <button onClick={() => { if (!onReplace(find, replace, matchCase, wholeCell)) onFindNext(find, matchCase, wholeCell); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] transition-colors border border-[#e8eaed]">
            <Replace className="h-3.5 w-3.5" /> Replace
          </button>
          <button onClick={() => { const n = onReplaceAll(find, replace, matchCase, wholeCell); toast.success("Replaced " + n + " cell" + (n === 1 ? "" : "s")); }}
            className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors">
            Replace all
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Filter Dialog ────────────────────────────────────────────────────────────

function FilterDialog({ col: _col, values, current, colLabel, onClose, onApply }: {
  col: number; values: string[]; current: string[]; colLabel: string;
  onClose: () => void; onApply: (allowed: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(current.length ? new Set(current) : new Set(values));
  const [search, setSearch] = useState("");

  const filtered = values.filter(v => v.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal title={`Filter column ${colLabel}`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <input className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm focus:outline-none focus:border-[#1a56db]/60"
          placeholder="Search values…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-2 text-xs">
          <button className="text-[#1a56db] hover:underline" onClick={() => setSelected(new Set(values))}>Select all</button>
          <span className="text-[#bdc1c6]">·</span>
          <button className="text-[#1a56db] hover:underline" onClick={() => setSelected(new Set())}>Clear all</button>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1 border border-[#e8eaed] rounded-lg p-2">
          {filtered.map(v => (
            <label key={v} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[#f1f3f4] px-1 rounded">
              <input type="checkbox" checked={selected.has(v)} onChange={e => {
                const s = new Set(selected);
                if (e.target.checked) { s.add(v); } else { s.delete(v); }
                setSelected(s);
              }} />
              {v}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onApply([])} className="px-3 py-1.5 text-xs border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Clear filter</button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={() => onApply([...selected])} className="flex-1 px-4 py-1.5 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Apply</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Named Ranges Dialog ──────────────────────────────────────────────────────

function NamesDialog({ names, defaultRange, onClose, onSave }: {
  names: Record<string, string>;
  defaultRange: string;
  onClose: () => void;
  onSave: (n: Record<string, string>) => void;
}) {
  const [local, setLocal] = useState<Record<string, string>>({ ...names });
  const [newName, setNewName] = useState("");
  const [newRange, setNewRange] = useState(defaultRange);

  const validName = (n: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);

  const add = () => {
    const n = newName.trim();
    if (!validName(n)) return toast.error("Name must start with a letter and contain only letters, numbers, _");
    if (!parseRange(newRange.toUpperCase()) && !parseRef(newRange.toUpperCase())) return toast.error("Invalid range (e.g. A1:B10)");
    setLocal(prev => ({ ...prev, [n]: newRange.toUpperCase() }));
    setNewName("");
  };

  const save = () => { onSave(local); onClose(); toast.success("Named ranges saved"); };

  return (
    <Modal title="Named ranges" onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-[#5f6368]">Give a range a name, then use it in formulas — e.g. <span className="font-mono text-[#202124]">=SUM(Revenue)</span>.</p>

        {Object.keys(local).length > 0 && (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {Object.entries(local).map(([n, r]) => (
              <div key={n} className="flex items-center gap-2 bg-[#f8f9fa] border border-[#e8eaed] rounded-lg px-3 py-1.5">
                <Tag className="h-3.5 w-3.5 text-[#1a56db] flex-shrink-0" />
                <span className="text-xs font-semibold text-[#202124] flex-shrink-0">{n}</span>
                <span className="text-xs font-mono text-[#5f6368] ml-1 truncate flex-1">{r}</span>
                <button onClick={() => setLocal(prev => { const cp = { ...prev }; delete cp[n]; return cp; })}
                  className="p-1 rounded hover:bg-[#f1f3f4] text-[#80868b] hover:text-[#ea4335] flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Revenue"
              onKeyDown={e => e.key === "Enter" && add()}
              className="w-full px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none focus:border-[#1a56db]/60" />
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Range</label>
            <input value={newRange} onChange={e => setNewRange(e.target.value)} placeholder="A1:A10"
              onKeyDown={e => e.key === "Enter" && add()}
              className="w-full px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1a56db]/60" />
          </div>
          <button onClick={add} className="px-3 py-1.5 text-xs font-semibold bg-[#e8f0fe] text-[#1a56db] rounded-lg hover:bg-[#d2e3fc] h-[30px]">Add</button>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Data Validation Dialog ───────────────────────────────────────────────────

// ─── Sparkline cell renderer ────────────────────────────────────────────────

function SparklineCell({ spark, sheet, getCellDisplayValue, height }: {
  spark: Sparkline;
  sheet: SheetTab;
  getCellDisplayValue: (r: number, c: number, s: SheetTab) => string;
  height: number;
}) {
  const pr = parseRange(spark.range.toUpperCase());
  const vals: number[] = [];
  if (pr) {
    for (let r = pr.startRow; r <= pr.endRow; r++)
      for (let c = pr.startCol; c <= pr.endCol; c++) {
        const n = Number(getCellDisplayValue(r, c, sheet).replace(/[^0-9.\-]/g, ""));
        if (!isNaN(n)) vals.push(n);
      }
  }
  if (!vals.length) return <span className="text-[10px] text-[#80868b] flex items-center h-full">(no data)</span>;

  const w = 80;
  const h = Math.max(12, Math.min(height - 4, 22));
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const norm = (v: number) => h - ((v - min) / span) * h;

  return (
    <svg width={w} height={h} viewBox={"0 0 " + w + " " + h} className="block" preserveAspectRatio="none">
      {spark.mode === "line" ? (
        <polyline
          fill="none"
          stroke={spark.color}
          strokeWidth={1.5}
          points={vals.map((v, i) => (vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w) + "," + norm(v)).join(" ")}
        />
      ) : (
        vals.map((v, i) => {
          const bw = w / vals.length;
          const top = norm(v);
          return <rect key={i} x={i * bw + 0.5} y={top} width={Math.max(1, bw - 1)} height={Math.max(1, h - top)} fill={spark.color} />;
        })
      )}
    </svg>
  );
}

function ValidationDialog({ defaultRange, rules, onClose, onAdd, onRemove }: {
  defaultRange: string;
  rules: DataValidation[];
  onClose: () => void;
  onAdd: (r: Omit<DataValidation, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [range, setRange] = useState(defaultRange);
  const [kind, setKind] = useState<"list" | "number">("list");
  const [values, setValues] = useState("");
  const [strict, setStrict] = useState(true);
  const [op, setOp] = useState<NumberOp>("between");
  const [minV, setMinV] = useState("");
  const [maxV, setMaxV] = useState("");

  const add = () => {
    const pr = parseRange(range.toUpperCase());
    const single = parseRef(range.toUpperCase());
    if (!pr && !single) return toast.error("Invalid range (e.g. A1:A10)");
    const r = pr ?? { startRow: single!.row, startCol: single!.col, endRow: single!.row, endCol: single!.col };
    const baseRange = { r1: r.startRow, c1: r.startCol, r2: r.endRow, c2: r.endCol };
    if (kind === "number") {
      const min = Number(minV);
      if (minV === "" || isNaN(min)) return toast.error("Enter a numeric value");
      const max = op === "between" ? Number(maxV) : undefined;
      if (op === "between" && (maxV === "" || isNaN(Number(maxV)))) return toast.error("Enter a maximum value");
      onAdd({ range: baseRange, type: "number", values: [], strict, op, min, max });
      setMinV(""); setMaxV("");
      toast.success("Number rule added");
      return;
    }
    const list = values.split(",").map(v => v.trim()).filter(Boolean);
    if (!list.length) return toast.error("Enter at least one option (comma-separated)");
    onAdd({ range: baseRange, type: "list", values: list, strict });
    setValues("");
    toast.success("Dropdown added");
  };

  const rangeLabel = (r: DataValidation["range"]) => `${indexToCol(r.c1)}${r.r1 + 1}:${indexToCol(r.c2)}${r.r2 + 1}`;
  const opLabel = (o: NumberOp, mn?: number, mx?: number) =>
    o === "between" ? "between " + mn + " and " + mx :
    o === "gt" ? "> " + mn : o === "lt" ? "< " + mn :
    o === "gte" ? "≥ " + mn : o === "lte" ? "≤ " + mn :
    o === "eq" ? "= " + mn : "≠ " + mn;
  const ruleSummary = (rule: DataValidation) =>
    rule.type === "number" ? opLabel(rule.op ?? "between", rule.min, rule.max) : rule.values.join(", ");

  return (
    <Modal title="Data validation" onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-[#5f6368]">Restrict what a range accepts — a dropdown list, or a numeric range.</p>

        <div className="flex gap-1 bg-[#f1f3f4] rounded-lg p-0.5">
          {(["list", "number"] as const).map(k => (
            <button key={k} onClick={() => setKind(k)}
              className={"flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors " + (kind === k ? "bg-white text-[#1a56db] shadow-sm" : "text-[#5f6368] hover:text-[#202124]")}>
              {k === "list" ? "List" : "Number"}
            </button>
          ))}
        </div>

        {rules.length > 0 && (
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-2 bg-[#f8f9fa] border border-[#e8eaed] rounded-lg px-3 py-1.5">
                <ListChecks className="h-3.5 w-3.5 text-[#1a56db] flex-shrink-0" />
                <span className="text-xs font-mono font-semibold text-[#202124] flex-shrink-0">{rangeLabel(rule.range)}</span>
                <span className="text-xs text-[#5f6368] ml-1 truncate flex-1">{rule.type === "number" ? "#" : ""} {ruleSummary(rule)}</span>
                <button onClick={() => onRemove(rule.id)}
                  className="p-1 rounded hover:bg-[#f1f3f4] text-[#80868b] hover:text-[#ea4335] flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Apply to range</label>
          <input value={range} onChange={e => setRange(e.target.value)} placeholder="A1:A10"
            className="w-full px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1a56db]/60" />
        </div>
        {kind === "list" ? (
          <div>
            <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Options (comma-separated)</label>
            <input value={values} onChange={e => setValues(e.target.value)} placeholder="Low, Medium, High, Critical"
              onKeyDown={e => e.key === "Enter" && add()}
              className="w-full px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none focus:border-[#1a56db]/60" />
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Condition</label>
              <select value={op} onChange={e => setOp(e.target.value as NumberOp)}
                className="w-full px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none focus:border-[#1a56db]/60">
                <option value="between">Between</option>
                <option value="gt">Greater than</option>
                <option value="gte">Greater than or equal</option>
                <option value="lt">Less than</option>
                <option value="lte">Less than or equal</option>
                <option value="eq">Equal to</option>
                <option value="neq">Not equal to</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input type="number" value={minV} onChange={e => setMinV(e.target.value)} placeholder={op === "between" ? "Min" : "Value"}
                onKeyDown={e => e.key === "Enter" && op !== "between" && add()}
                className="flex-1 px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none focus:border-[#1a56db]/60" />
              {op === "between" && (
                <input type="number" value={maxV} onChange={e => setMaxV(e.target.value)} placeholder="Max"
                  onKeyDown={e => e.key === "Enter" && add()}
                  className="flex-1 px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none focus:border-[#1a56db]/60" />
              )}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-[#5f6368] cursor-pointer">
          <input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />
          {kind === "list" ? "Reject input outside the list" : "Reject out-of-range numbers"}
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Done</button>
          <button onClick={add} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">{kind === "list" ? "Add dropdown" : "Add rule"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Pivot Widget ─────────────────────────────────────────────────────────────

function PivotWidget({ def, rows, onRemove }: { def: PivotDef; rows: string[][]; onRemove: () => void }) {
  const [pivotView, setPivotView] = useState<"table" | "chart">("table");
  if (!rows.length) {
    return (
      <div className="mx-4 my-4 bg-white border border-[#e8eaed] rounded-xl p-4 relative shadow-sm inline-block">
        <button onClick={onRemove} className="absolute top-2 right-2 text-[#80868b] hover:text-[#ea4335]"><X className="h-3.5 w-3.5" /></button>
        <p className="text-xs text-[#80868b]">Pivot source range {def.sourceRange} is empty.</p>
      </div>
    );
  }
  const headers = rows[0] ?? [];
  const piv = computePivot(rows, def);
  const aggLabel = def.agg.charAt(0).toUpperCase() + def.agg.slice(1);
  const fmt = (n: number) => Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const showColHeader = def.colField !== null;

  const seriesKeys = piv.colKeys.map(ck => ck === "__ALL__" ? aggLabel : ck);
  const chartData = piv.rowKeys.map(rk => {
    const row: Record<string, string | number> = { name: rk || "(blank)" };
    piv.colKeys.forEach((ck, i) => { row[seriesKeys[i]] = piv.cells[rk + PIVOT_SEP + ck] ?? 0; });
    return row;
  });

  return (
    <div className="mx-4 my-4 bg-white border border-[#e8eaed] rounded-xl p-4 relative shadow-sm inline-block max-w-full overflow-x-auto">
      <div className="flex items-center justify-between mb-2 gap-6">
        <span className="text-xs font-semibold text-[#202124]">
          Pivot · {aggLabel} of {headers[def.valueField] ?? `col ${def.valueField}`} by {headers[def.rowField] ?? `col ${def.rowField}`}
          {showColHeader ? ` × ${headers[def.colField!] ?? ""}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPivotView(v => v === "table" ? "chart" : "table")} title={pivotView === "table" ? "Show chart" : "Show table"}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded text-[#5f6368] hover:bg-[#f1f3f4]">
            <BarChart3 className="h-3.5 w-3.5" /> {pivotView === "table" ? "Chart" : "Table"}
          </button>
          <button onClick={onRemove} className="text-[#80868b] hover:text-[#ea4335]"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {pivotView === "chart" ? (
        <div style={{ width: Math.max(360, Math.min(720, chartData.length * 70 + 120)), height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {seriesKeys.map((k, i) => <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="border border-[#e8eaed] bg-[#f8f9fa] px-3 py-1.5 text-left text-[#5f6368] font-semibold">{headers[def.rowField] ?? ""}</th>
            {piv.colKeys.map(ck => (
              <th key={ck} className="border border-[#e8eaed] bg-[#f8f9fa] px-3 py-1.5 text-right text-[#5f6368] font-semibold">{ck === "__ALL__" ? aggLabel : ck}</th>
            ))}
            <th className="border border-[#e8eaed] bg-[#e8f0fe] px-3 py-1.5 text-right text-[#1a56db] font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {piv.rowKeys.map(rk => (
            <tr key={rk}>
              <td className="border border-[#e8eaed] px-3 py-1.5 text-[#202124] font-medium">{rk || "(blank)"}</td>
              {piv.colKeys.map(ck => (
                <td key={ck} className="border border-[#e8eaed] px-3 py-1.5 text-right text-[#202124] tabular-nums">{fmt(piv.cells[rk + PIVOT_SEP + ck] ?? 0)}</td>
              ))}
              <td className="border border-[#e8eaed] px-3 py-1.5 text-right font-semibold text-[#1a56db] tabular-nums bg-[#e8f0fe]/40">{fmt(piv.rowTotals[rk] ?? 0)}</td>
            </tr>
          ))}
          <tr>
            <td className="border border-[#e8eaed] px-3 py-1.5 font-semibold text-[#1a56db] bg-[#e8f0fe]/40">Grand total</td>
            {piv.colKeys.map(ck => (
              <td key={ck} className="border border-[#e8eaed] px-3 py-1.5 text-right font-semibold text-[#1a56db] tabular-nums bg-[#e8f0fe]/40">{fmt(piv.colTotals[ck] ?? 0)}</td>
            ))}
            <td className="border border-[#e8eaed] px-3 py-1.5 text-right font-bold text-[#1a56db] tabular-nums bg-[#e8f0fe]">{fmt(piv.grand)}</td>
          </tr>
        </tbody>
      </table>
      )}
    </div>
  );
}

// ─── Pivot Dialog ─────────────────────────────────────────────────────────────

function PivotDialog({ defaultRange, existing, readHeaders, onClose, onAdd, onRemove }: {
  defaultRange: string;
  existing: PivotDef[];
  readHeaders: (rangeStr: string) => string[];
  onClose: () => void;
  onAdd: (p: Omit<PivotDef, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [range, setRange] = useState(defaultRange);
  const [rowField, setRowField] = useState(0);
  const [colField, setColField] = useState<number | "none">("none");
  const [valueField, setValueField] = useState(1);
  const [agg, setAgg] = useState<PivotAgg>("sum");

  const headers = readHeaders(range);
  const fieldOptions = headers.length
    ? headers.map((h, i) => ({ i, label: h || `Column ${indexToCol(i)}` }))
    : Array.from({ length: 8 }, (_, i) => ({ i, label: `Column ${indexToCol(i)}` }));

  const add = () => {
    if (!parseRange(range.toUpperCase())) return toast.error("Invalid range (e.g. A1:D100)");
    onAdd({ sourceRange: range.toUpperCase(), rowField, colField: colField === "none" ? null : colField, valueField, agg });
  };

  return (
    <Modal title="Pivot table" onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-[#5f6368]">Summarise a table. Pick the source range (first row = headers), then group by a field and aggregate a value.</p>

        {existing.length > 0 && (
          <div className="space-y-1.5 max-h-28 overflow-y-auto">
            {existing.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-[#f8f9fa] border border-[#e8eaed] rounded-lg px-3 py-1.5">
                <Table className="h-3.5 w-3.5 text-[#1a56db] flex-shrink-0" />
                <span className="text-xs font-mono text-[#202124] flex-shrink-0">{p.sourceRange}</span>
                <span className="text-xs text-[#5f6368] ml-1 truncate flex-1">{p.agg}</span>
                <button onClick={() => onRemove(p.id)} className="p-1 rounded hover:bg-[#f1f3f4] text-[#80868b] hover:text-[#ea4335] flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Source range</label>
          <input value={range} onChange={e => setRange(e.target.value)} placeholder="A1:D100"
            className="w-full px-2.5 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1a56db]/60" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Rows (group by)</label>
            <select value={rowField} onChange={e => setRowField(Number(e.target.value))} className="w-full px-2 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none">
              {fieldOptions.map(o => <option key={o.i} value={o.i}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Columns (optional)</label>
            <select value={colField} onChange={e => setColField(e.target.value === "none" ? "none" : Number(e.target.value))} className="w-full px-2 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none">
              <option value="none">None</option>
              {fieldOptions.map(o => <option key={o.i} value={o.i}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Values</label>
            <select value={valueField} onChange={e => setValueField(Number(e.target.value))} className="w-full px-2 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none">
              {fieldOptions.map(o => <option key={o.i} value={o.i}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#5f6368] mb-1 block">Summarise by</label>
            <select value={agg} onChange={e => setAgg(e.target.value as PivotAgg)} className="w-full px-2 py-1.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-xs focus:outline-none">
              <option value="sum">Sum</option>
              <option value="count">Count</option>
              <option value="average">Average</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Done</button>
          <button onClick={add} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Insert pivot</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── AI Sheet Panel ───────────────────────────────────────────────────────────

function AISheetPanel({ sheet, sel, getCellDisplayValue, computeCell, onClose, onInsertFormula }: {
  sheet: SheetTab; sel: { r: number; c: number };
  getCellDisplayValue: (r: number, c: number, s: SheetTab) => string;
  computeCell: (v: string, s: SheetTab) => CellValue;
  onClose: () => void;
  onInsertFormula: (formula: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [mode, setMode] = useState<"explain" | "generate" | "analyze">("generate");

  const cellVal = sheet.cells[ck(sel.r, sel.c)]?.v ?? "";
  const displayVal = getCellDisplayValue(sel.r, sel.c, sheet);

  const run = async () => {
    setLoading(true);
    setResult("");
    try {
      const context = mode === "analyze"
        ? buildSheetContext(sheet, computeCell)
        : mode === "explain"
        ? `The selected cell ${indexToCol(sel.c)}${sel.r + 1} contains: "${cellVal}"\nDisplayed value: "${displayVal}"`
        : `The user wants a formula for: ${prompt}`;

      const systemMsg = mode === "explain"
        ? "You are a spreadsheet expert. Explain this formula in plain English, step by step."
        : mode === "generate"
        ? "You are a spreadsheet expert. Generate an Excel-compatible formula. Return ONLY the formula starting with =, with a brief explanation on the next line."
        : "You are a data analyst. Analyze this spreadsheet data and provide insights, patterns, and anomalies. Be concise.";

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: context, systemPrompt: systemMsg }),
      });
      const data = await res.json() as { reply?: string; message?: string };
      setResult(data.reply ?? data.message ?? "No response");
    } catch {
      setResult("Failed to get AI response");
    } finally {
      setLoading(false);
    }
  };

  const formulaMatch = result.match(/^(=\S+)/m);

  return (
    <div className="w-72 border-l border-[#e8eaed] bg-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaed]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#202124]">
          <Sparkles className="h-4 w-4 text-purple-600" /> AI Assistant
        </div>
        <button onClick={onClose} className="text-[#80868b] hover:text-[#202124]"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex border-b border-[#e8eaed]">
        {(["generate", "explain", "analyze"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-[11px] font-medium capitalize transition-colors ${mode === m ? "text-[#1a56db] border-b-2 border-[#1a56db]" : "text-[#5f6368] hover:text-[#202124]"}`}>
            {m}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {mode === "explain" && (
          <div className="text-xs bg-[#f8f9fa] rounded-lg p-3 text-[#5f6368]">
            <div className="font-medium text-[#202124] mb-1">Selected: {indexToCol(sel.c)}{sel.r + 1}</div>
            <div className="font-mono text-[11px]">{cellVal || "(empty)"}</div>
          </div>
        )}
        {mode === "analyze" && (
          <div className="text-xs text-[#5f6368]">Analyzes the full sheet for patterns and anomalies.</div>
        )}
        {(mode === "generate" || mode === "analyze") && (
          <textarea
            className="w-full text-xs px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg resize-none focus:outline-none focus:border-[#1a56db]/60"
            rows={3}
            placeholder={mode === "generate" ? "Describe what formula you need…\ne.g. Sum column B where column A = Sales" : "Any specific question about the data?"}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
        )}
        <button onClick={run} disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Thinking…" : mode === "explain" ? "Explain" : mode === "analyze" ? "Analyze" : "Generate"}
        </button>
        {result && (
          <div className="bg-[#f8f9fa] rounded-lg p-3 text-xs text-[#202124] whitespace-pre-wrap leading-relaxed">
            {result}
          </div>
        )}
        {formulaMatch && (
          <button onClick={() => onInsertFormula(formulaMatch[1])}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold border border-[#1a56db]/30 text-[#1a56db] rounded-lg hover:bg-[#e8f0fe] transition-colors">
            <Check className="h-3.5 w-3.5" /> Insert formula
          </button>
        )}
      </div>
    </div>
  );
}

function buildSheetContext(sheet: SheetTab, computeCell: (v: string, s: SheetTab) => CellValue): string {
  const rows: string[] = [];
  for (let r = 0; r < Math.min(20, 200); r++) {
    const row: string[] = [];
    let hasData = false;
    for (let c = 0; c < Math.min(10, 26); c++) {
      const cell = sheet.cells[ck(r, c)];
      if (cell?.v) { hasData = true; }
      const val = cell?.v ? computeCell(cell.v, sheet) : "";
      row.push(String(val ?? ""));
    }
    if (!hasData) break;
    rows.push(row.join("\t"));
  }
  return `Sheet data (tab-separated, first ${rows.length} rows):\n${rows.join("\n")}`;
}

// ─── Cell Note Dialog ─────────────────────────────────────────────────────────

function NoteDialog({ cellLabel, initial, onClose, onSave, onDelete }: {
  cellLabel: string;
  initial: string;
  onClose: () => void;
  onSave: (note: string) => void;
  onDelete: () => void;
}) {
  const [note, setNote] = useState(initial);

  return (
    <Modal title={"Note on " + cellLabel} onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-[#5f6368]">Add a note to this cell. A small amber marker appears in the corner; hover the cell to read it.</p>
        <textarea
          autoFocus
          rows={4}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Type a note…"
          className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] resize-none focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors"
        />
        <div className="flex gap-2 pt-1">
          {initial.trim() !== "" && (
            <button onClick={onDelete}
              className="px-3 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] hover:text-[#ea4335] transition-colors">
              Delete
            </button>
          )}
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={() => onSave(note)} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Remove Duplicates Dialog ─────────────────────────────────────────────────

function RemoveDuplicatesDialog({ rangeLabel, onClose, onApply }: {
  rangeLabel: string;
  onClose: () => void;
  onApply: (hasHeader: boolean) => void;
}) {
  const [hasHeader, setHasHeader] = useState(false);

  return (
    <Modal title="Remove duplicates" onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-[#5f6368]">
          Scans the selected range <span className="font-mono font-semibold text-[#202124]">{rangeLabel}</span> and removes rows whose values (across the selected columns) match an earlier row. Survivors are compacted upward.
        </p>
        <label className="flex items-center gap-2 text-xs text-[#5f6368] cursor-pointer">
          <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} />
          Data has a header row (skip the first row)
        </label>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={() => onApply(hasHeader)} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Remove duplicates</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Split Text to Columns Dialog ─────────────────────────────────────────────

function SplitTextDialog({ colLabel, onClose, onApply }: {
  colLabel: string;
  onClose: () => void;
  onApply: (delimiter: string) => void;
}) {
  const [choice, setChoice] = useState<"comma" | "space" | "semicolon" | "tab" | "custom">("comma");
  const [custom, setCustom] = useState("");

  const delimiterFor = (): string => {
    switch (choice) {
      case "comma": return ",";
      case "space": return " ";
      case "semicolon": return ";";
      case "tab": return "\t";
      case "custom": return custom;
    }
  };

  const options: { id: typeof choice; label: string }[] = [
    { id: "comma", label: "Comma" },
    { id: "space", label: "Space" },
    { id: "semicolon", label: "Semicolon" },
    { id: "tab", label: "Tab" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <Modal title="Split text to columns" onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-[#5f6368]">
          Splits each cell in column <span className="font-mono font-semibold text-[#202124]">{colLabel}</span> by the chosen delimiter and writes the parts into the columns to the right (overwriting).
        </p>
        <div>
          <label className="text-xs font-medium text-[#5f6368] mb-1 block">Delimiter</label>
          <div className="flex flex-wrap gap-2">
            {options.map(o => (
              <button key={o.id} onClick={() => setChoice(o.id)}
                className={"px-3 py-1.5 text-xs rounded-lg border transition-colors " + (choice === o.id ? "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/30" : "border-[#e8eaed] text-[#5f6368] hover:border-[#d0d5dd]")}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {choice === "custom" && (
          <input autoFocus value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. | or - or ::"
            className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm font-mono focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors" />
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={() => onApply(delimiterFor())} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Split</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaed]">
          <span className="text-sm font-semibold text-[#202124]">{title}</span>
          <button onClick={onClose} className="text-[#80868b] hover:text-[#202124]"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
