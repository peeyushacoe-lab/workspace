"use client";

/**
 * Nexus Sheets — Professional spreadsheet editor
 * Features: 50+ formulas, charts, sort/filter, conditional formatting,
 * number formats, column/row resize, freeze panes, merge cells, AI assistant
 */

import { useCallback, useEffect, useRef, useState, useMemo, useId } from "react";
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Plus, Trash2, Download, Upload, Share2, Loader2,
  BarChart3, SortAsc, SortDesc, Filter, Sparkles,
  ChevronDown, Paintbrush, Type, Merge, X, Check,
  Undo2, Redo2, Search, WrapText, Lock, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell as PieCell,
  AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { DocShareModal } from "./DocShareModal";
import { evaluateFormula, formatValue, indexToCol, parseRef, parseRange, getRangeVals } from "@/lib/sheets/formula";
import type { CellValue, NumberFormat } from "@/lib/sheets/formula";

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
  wrap?: boolean;
  indent?: number;
};

type Cell = {
  v: string;           // raw value / formula
  s?: CellStyle;
  merged?: boolean;    // true if consumed by a merge
  mergeSpan?: { rows: number; cols: number };
};

type ConditionalRule = {
  id: string;
  range: { r1: number; c1: number; r2: number; c2: number };
  type: "gt" | "lt" | "eq" | "between" | "not_empty" | "contains" | "top_n" | "bottom_n" | "color_scale";
  value?: string;
  value2?: string;
  style: Pick<CellStyle, "color" | "background" | "bold">;
};

type ChartDef = {
  id: string;
  type: "bar" | "line" | "pie" | "area" | "scatter";
  title: string;
  range: string;
  hasHeader: boolean;
  colors: string[];
};

type SortRule = { col: number; dir: "asc" | "desc" };
type FilterState = Record<number, string[]>; // col → allowed values

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
};

type WorkbookDoc = {
  sheets: SheetTab[];
  version: number;
};

const ROWS = 200;
const COLS = 26;
const DEFAULT_COL_W = 100;
const DEFAULT_ROW_H = 24;
const ROW_HEADER_W = 48;
const COL_HEADER_H = 24;

const FONTS = ["Arial", "Roboto", "Georgia", "Courier New", "Times New Roman", "Verdana"];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const CHART_COLORS = ["#1a56db", "#0f9d58", "#f4b400", "#ea4335", "#9334e6", "#00897b", "#f57c00", "#3949ab"];

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
  };
}

// ─── Cell key ────────────────────────────────────────────────────────────────

function ck(r: number, c: number) { return `${r}:${c}`; }

// ─── A1 notation ─────────────────────────────────────────────────────────────

function toA1(row: number, col: number) { return `${indexToCol(col)}${row + 1}`; }

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
  const uid = useId();

  // ── Document state ───────────────────────────────────────────────────────
  const [title, setTitle] = useState("Untitled Spreadsheet");
  const [sheets, setSheets] = useState<SheetTab[]>([blankSheet("s1", "Sheet 1")]);
  const [activeSheetId, setActiveSheetId] = useState("s1");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Selection / editing ──────────────────────────────────────────────────
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [selEnd, setSelEnd] = useState<{ r: number; c: number } | null>(null);
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
  const [filterCol, setFilterCol] = useState<number | null>(null);
  const [editingSheetName, setEditingSheetName] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [colorPickerTarget, setColorPickerTarget] = useState<"text" | "bg" | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);

  const activeSheet = sheets.find(s => s.id === activeSheetId) ?? sheets[0];

  // ── Compute cell value ───────────────────────────────────────────────────
  const computeCell = useCallback((raw: string, sheet: SheetTab): CellValue => {
    if (!raw.startsWith("=")) return raw === "" ? null : isNaN(Number(raw)) ? raw : Number(raw);
    return evaluateFormula(raw, (r, c) => {
      const cell = sheet.cells[ck(r, c)];
      if (!cell?.v) return null;
      if (cell.v.startsWith("=")) return evaluateFormula(cell.v, (r2, c2) => {
        const c2ell = sheet.cells[ck(r2, c2)];
        return c2ell?.v ? (c2ell.v.startsWith("=") ? null : (isNaN(Number(c2ell.v)) ? c2ell.v : Number(c2ell.v))) : null;
      });
      return isNaN(Number(cell.v)) ? cell.v : Number(cell.v);
    });
  }, []);

  const getCellDisplayValue = useCallback((r: number, c: number, sheet: SheetTab): string => {
    const cell = sheet.cells[ck(r, c)];
    if (!cell?.v) return "";
    const val = computeCell(cell.v, sheet);
    if (val === null) return "";
    const fmt = cell.s?.format ?? "general";
    const dec = cell.s?.decimals ?? 2;
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
            const wb = JSON.parse(data.content) as { sheets?: unknown[] };
            if (wb.sheets?.length) setSheets((wb.sheets as Record<string, unknown>[]).map(deserializeSheet));
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
            content: JSON.stringify({ sheets: sheetsToSave.map(serializeSheet) }),
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
            newCells[k] = { v: "", ...newCells[k], s: { ...newCells[k]?.s, ...stylePatch } };
          }
        }
        return { ...sh, cells: newCells };
      });
      pushHistory(next);
      scheduleSave(next, title);
      return next;
    });
  }, [sel, selEnd, activeSheetId, pushHistory, scheduleSave, title]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) return;
      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setSel(s => ({ r: Math.max(0, Math.min(ROWS - 1, s.r + dr)), c: Math.max(0, Math.min(COLS - 1, s.c + dc)) }));
        setSelEnd(null);
      };
      if (e.key === "ArrowUp") move(-1, 0);
      else if (e.key === "ArrowDown") move(1, 0);
      else if (e.key === "ArrowLeft") move(0, -1);
      else if (e.key === "ArrowRight") move(0, 1);
      else if (e.key === "Tab") { e.preventDefault(); move(0, 1); }
      else if (e.key === "Enter") move(1, 0);
      else if (e.key === "Delete" || e.key === "Backspace") {
        updateCell(sel.r, sel.c, "");
      } else if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); if (e.shiftKey) redo(); else undo();
      } else if (e.key === "c" && (e.metaKey || e.ctrlKey)) {
        const val = getCellDisplayValue(sel.r, sel.c, activeSheet);
        void navigator.clipboard.writeText(val);
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
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, sel, activeSheet, updateCell, undo, redo, getCellDisplayValue]);

  // Update formula bar on selection change
  useEffect(() => {
    const cell = activeSheet.cells[ck(sel.r, sel.c)];
    setFormulaBarVal(cell?.v ?? "");
  }, [sel, activeSheet]);

  // ── Commit edit ──────────────────────────────────────────────────────────
  const commitEdit = useCallback((moveDir: "down" | "right" | "none" = "down") => {
    updateCell(sel.r, sel.c, editVal);
    setEditing(false);
    if (moveDir === "down") setSel(s => ({ r: Math.min(ROWS - 1, s.r + 1), c: s.c }));
    else if (moveDir === "right") setSel(s => ({ r: s.r, c: Math.min(COLS - 1, s.c + 1) }));
  }, [sel, editVal, updateCell]);

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
        let cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : sa.localeCompare(sb);
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
        case "eq": match = String(val).toLowerCase() === (rule.value ?? "").toLowerCase(); break;
        case "not_empty": match = val !== null && val !== ""; break;
        case "contains": match = String(val).toLowerCase().includes((rule.value ?? "").toLowerCase()); break;
        case "between": match = !isNaN(num) && num >= v && num <= Number(rule.value2); break;
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
      }
      if (match) return rule.style;
    }
    return {};
  }, [computeCell]);

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

  // ── Current cell style (for toolbar display) ───────────────────────────────
  const cellStyle = activeSheet.cells[ck(sel.r, sel.c)]?.s ?? {};

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!loaded) return (
    <div className="flex items-center justify-center h-screen bg-white">
      <Loader2 className="h-6 w-6 animate-spin text-[#1a56db]" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden" onClick={() => { setColorPickerTarget(null); setSortMenuOpen(false); }}>

      {/* ── Title bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#e8eaed] bg-white z-20">
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
          value={cellStyle.format ?? "general"}
          onChange={e => applyStyle({ format: e.target.value as NumberFormat })}
        >
          <option value="general">General</option>
          <option value="number">Number</option>
          <option value="currency">Currency</option>
          <option value="percent">Percent</option>
          <option value="date">Date</option>
          <option value="scientific">Scientific</option>
          <option value="text">Text</option>
        </select>
        <Sep />

        {/* Merge */}
        <ToolBtn icon={<Merge className="h-3.5 w-3.5" />} title="Merge cells" onClick={mergeCells} />
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
        <ToolBtn icon={<Paintbrush className="h-3.5 w-3.5" />} title="Conditional formatting" onClick={() => setShowCF(true)} />

        {/* Chart */}
        <ToolBtn icon={<BarChart3 className="h-3.5 w-3.5" />} title="Insert chart" onClick={() => setShowChart(true)} />
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
        <div className="flex-1 overflow-auto" ref={gridRef}>
          <div style={{ display: "grid", gridTemplateColumns: `${ROW_HEADER_W}px ${Array.from({ length: COLS }, (_, c) => `${activeSheet.colWidths[c] ?? DEFAULT_COL_W}px`).join(" ")}` }}>
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
                onHide={() => setSheets(prev => prev.map(sh => {
                  if (sh.id !== activeSheetId) return sh;
                  const hs = new Set(sh.hiddenCols);
                  hs.has(c) ? hs.delete(c) : hs.add(c);
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
                  getCellDisplayValue={getCellDisplayValue}
                  getCFStyle={getCFStyle}
                  onCellClick={(rr, cc, shiftKey) => {
                    if (shiftKey) {
                      setSelEnd({ r: rr, c: cc });
                    } else {
                      setSel({ r: rr, c: cc });
                      setSelEnd(null);
                      setEditing(false);
                    }
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
                    hs.has(r) ? hs.delete(r) : hs.add(r);
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
      </div>

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
          onClose={() => setShowCF(false)}
          onAdd={(rule) => {
            setSheets(prev => prev.map(sh => sh.id === activeSheetId ? { ...sh, conditionalRules: [...sh.conditionalRules, { ...rule, id: `cf_${Date.now()}` }] } : sh));
            setShowCF(false);
            toast.success("Rule added");
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

function ColHeader({ col, label, width, hidden, selected, onResize, onHide, onSort, onFilter, filterActive }: {
  col: number; label: string; width: number; hidden: boolean; selected: boolean;
  onResize: (w: number) => void; onHide: () => void; onSort: (d: "asc" | "desc") => void;
  onFilter: () => void; filterActive: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const resizing = useRef<{ startX: number; startW: number } | null>(null);

  if (hidden) return <div style={{ width: 4, height: COL_HEADER_H, background: "#e8eaed", cursor: "col-resize", borderRight: "1px solid #e8eaed" }} />;

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

// ─── Row ─────────────────────────────────────────────────────────────────────

function Row({ row, cols, sheet, sel, selEnd, editing, editVal, cellInputRef, colWidths, rowHeight, getCellDisplayValue, getCFStyle, onCellClick, onCellDoubleClick, onEditChange, onEditCommit, onEditCancel, onRowResize, onHideRow }: {
  row: number; cols: number; sheet: SheetTab; sel: { r: number; c: number }; selEnd: { r: number; c: number } | null;
  editing: boolean; editVal: string; cellInputRef: React.RefObject<HTMLInputElement | null>;
  colWidths: Record<number, number>; rowHeight: number;
  getCellDisplayValue: (r: number, c: number, s: SheetTab) => string;
  getCFStyle: (r: number, c: number, s: SheetTab) => Partial<CellStyle>;
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

  return (
    <>
      {/* Row header */}
      <div
        className={`sticky left-0 z-10 flex items-center justify-center text-xs text-[#5f6368] border-r border-b border-[#e8eaed] select-none bg-[#f8f9fa] cursor-pointer group relative
          ${inSel(0) ? "bg-[#e8f0fe]" : "hover:bg-[#e8eaed]"}`}
        style={{ height: rowHeight, width: ROW_HEADER_W }}
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
        };

        return (
          <div
            key={c}
            className={`relative border-r border-b border-[#e8eaed] px-1 cursor-cell select-none transition-colors
              ${isSelected ? "outline outline-2 outline-[#1a56db] z-[5]" : isInRange ? "bg-[#e8f0fe]/60" : ""}`}
            style={cellStyle}
            onClick={e => onCellClick(row, c, e.shiftKey)}
            onDoubleClick={() => onCellDoubleClick(row, c)}
          >
            {isEditing ? (
              <input
                ref={cellInputRef}
                className="absolute inset-0 w-full h-full px-1 text-xs font-mono outline-none border-none bg-white z-10"
                style={{ fontFamily: style.fontFamily ?? "Arial", fontSize: style.fontSize ?? 12 }}
                value={editVal}
                onChange={e => onEditChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); onEditCommit("down"); }
                  else if (e.key === "Tab") { e.preventDefault(); onEditCommit("right"); }
                  else if (e.key === "Escape") { onEditCancel(); }
                }}
                onBlur={() => onEditCommit("none")}
              />
            ) : (
              <span className="text-xs leading-none flex items-center h-full" style={{ fontSize: style.fontSize ?? 12, paddingLeft: (style.indent ?? 0) * 12 }}>
                {display}
              </span>
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
            {(["bar","line","area","pie","scatter"] as const).map(t => (
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

function CFDialog({ defaultRange, onClose, onAdd }: {
  defaultRange: string; onClose: () => void;
  onAdd: (r: Omit<ConditionalRule, "id">) => void;
}) {
  const [range, setRange] = useState(defaultRange);
  const [ruleType, setRuleType] = useState<ConditionalRule["type"]>("gt");
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [bg, setBg] = useState("#fad2cf");
  const [color, setColor] = useState("#ea4335");
  const [bold, setBold] = useState(false);

  const parsedRange = parseRange(range.toUpperCase());

  const handleAdd = () => {
    if (!parsedRange) return toast.error("Invalid range");
    onAdd({ range: { r1: parsedRange.startRow, c1: parsedRange.startCol, r2: parsedRange.endRow, c2: parsedRange.endCol }, type: ruleType, value, value2, style: { background: bg, color, bold } });
  };

  return (
    <Modal title="Conditional Formatting" onClose={onClose}>
      <div className="space-y-3 p-4">
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
            <option value="eq">Equal to</option>
            <option value="between">Between</option>
            <option value="not_empty">Not empty</option>
            <option value="contains">Contains</option>
            <option value="top_n">Top N values</option>
            <option value="bottom_n">Bottom N values</option>
            <option value="color_scale">Color scale</option>
          </select>
        </div>
        {ruleType !== "not_empty" && ruleType !== "color_scale" && (
          <div className="flex gap-2">
            <input placeholder="Value" className="flex-1 px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm focus:outline-none focus:border-[#1a56db]/60"
              value={value} onChange={e => setValue(e.target.value)} />
            {ruleType === "between" && (
              <input placeholder="And" className="flex-1 px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm focus:outline-none focus:border-[#1a56db]/60"
                value={value2} onChange={e => setValue2(e.target.value)} />
            )}
          </div>
        )}
        {ruleType !== "color_scale" && (
          <div className="flex gap-3 items-center">
            <div>
              <label className="text-[10px] text-[#5f6368] block mb-1">Background</label>
              <input type="color" value={bg} onChange={e => setBg(e.target.value)} className="h-7 w-14 cursor-pointer" />
            </div>
            <div>
              <label className="text-[10px] text-[#5f6368] block mb-1">Text</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-7 w-14 cursor-pointer" />
            </div>
            <label className="flex items-center gap-1 text-xs cursor-pointer mt-3">
              <input type="checkbox" checked={bold} onChange={e => setBold(e.target.checked)} /> Bold
            </label>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-[#e8eaed] rounded-lg text-[#5f6368] hover:bg-[#f1f3f4]">Cancel</button>
          <button onClick={handleAdd} className="flex-1 px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Add Rule</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Filter Dialog ────────────────────────────────────────────────────────────

function FilterDialog({ col, values, current, colLabel, onClose, onApply }: {
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
                e.target.checked ? s.add(v) : s.delete(v);
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
