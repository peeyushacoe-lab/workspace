"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Plus, Download, Upload, Users, X,
  Loader2, Share2,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { DocShareModal } from "./DocShareModal";

// ─── Types ───────────────────────────────────────────────────────────────────

type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  bg?: string;
  fontSize?: number;
};

type Cell = {
  v?: string | number; // display value (computed)
  f?: string;          // formula (starts with =)
  s?: CellStyle;
};

type SheetTab = {
  id: string;
  name: string;
  cells: Record<string, Cell>; // key = "row:col"
  colWidths: Record<string, number>;
  rowHeights: Record<string, number>;
};

type SpreadsheetDoc = {
  sheets: SheetTab[];
  activeSheet: string;
};

const COLS = 26;   // A–Z
const ROWS = 100;
const DEFAULT_COL_W = 100;
const DEFAULT_ROW_H = 24;
const ROW_HEADER_W = 48;
const COL_HEADER_H = 24;

function colLabel(c: number): string {
  return String.fromCharCode(65 + c);
}

// ─── Simple formula evaluator ────────────────────────────────────────────────

function cellRef(ref: string): { row: number; col: number } | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const col = m[1].charCodeAt(0) - 65;
  const row = parseInt(m[2]) - 1;
  return { row, col };
}

function rangeValues(sheet: SheetTab, from: string, to: string): number[] {
  const a = cellRef(from);
  const b = cellRef(to);
  if (!a || !b) return [];
  const vals: number[] = [];
  for (let r = a.row; r <= b.row; r++) {
    for (let c = a.col; c <= b.col; c++) {
      const cell = sheet.cells[`${r}:${c}`];
      const n = parseFloat(String(cell?.v ?? ""));
      if (!isNaN(n)) vals.push(n);
    }
  }
  return vals;
}

function evaluateFormula(formula: string, sheet: SheetTab): string | number {
  const f = formula.slice(1).trim();

  // Single cell ref e.g. =A1
  const singleRef = cellRef(f);
  if (singleRef) {
    const cell = sheet.cells[`${singleRef.row}:${singleRef.col}`];
    return cell?.v ?? "";
  }

  // Functions: SUM, AVERAGE, COUNT, MIN, MAX, CONCATENATE, IF
  const fnMatch = f.match(/^(\w+)\((.+)\)$/);
  if (!fnMatch) return formula; // can't parse

  const [, fn, args] = fnMatch;
  const fnUpper = fn.toUpperCase();

  // Range functions
  const rangeMatch = args.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
  if (rangeMatch) {
    const vals = rangeValues(sheet, rangeMatch[1], rangeMatch[2]);
    if (fnUpper === "SUM") return vals.reduce((a, b) => a + b, 0);
    if (fnUpper === "AVERAGE") return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    if (fnUpper === "COUNT") return vals.length;
    if (fnUpper === "MIN") return vals.length ? Math.min(...vals) : 0;
    if (fnUpper === "MAX") return vals.length ? Math.max(...vals) : 0;
  }

  // IF(condition, true_val, false_val)
  if (fnUpper === "IF") {
    const parts = args.split(",");
    if (parts.length >= 3) {
      try {
        const cond = evaluateFormula("=" + parts[0].trim(), sheet);
        return cond ? parts[1].trim().replace(/^"|"$/g, "") : parts[2].trim().replace(/^"|"$/g, "");
      } catch { return "#ERROR"; }
    }
  }

  // CONCATENATE
  if (fnUpper === "CONCATENATE" || fnUpper === "CONCAT") {
    return args.split(",").map((a) => {
      const trimmed = a.trim();
      const ref = cellRef(trimmed);
      if (ref) return String(sheet.cells[`${ref.row}:${ref.col}`]?.v ?? "");
      return trimmed.replace(/^"|"$/g, "");
    }).join("");
  }

  return "#UNSUPPORTED";
}

function computeCell(cell: Cell, sheet: SheetTab): string | number {
  if (cell.f && cell.f.startsWith("=")) {
    try { return evaluateFormula(cell.f, sheet); } catch { return "#ERROR"; }
  }
  return cell.v ?? "";
}

// ─── Collab hook ─────────────────────────────────────────────────────────────

function useSheetCollab(sheetId: string | null, onRemoteUpdate: (data: unknown) => void) {
  const [collaborators, setCollaborators] = useState<{ userId: string; name: string; color: string }[]>([]);

  useEffect(() => {
    if (!sheetId) return;
    const es = new EventSource(`/api/sheets/${sheetId}/collab`);
    es.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string; userId?: string; name?: string; color?: string;
          action?: string; sessions?: { userId: string; cursorName: string; cursorColor: string }[];
          update?: unknown;
        };
        if (msg.type === "INIT" && msg.sessions) {
          setCollaborators(msg.sessions.map((s) => ({ userId: s.userId, name: s.cursorName, color: s.cursorColor })));
        }
        if (msg.type === "PRESENCE") {
          setCollaborators((prev) => {
            if (msg.action === "LEAVE") return prev.filter((c) => c.userId !== msg.userId);
            if (prev.some((c) => c.userId === msg.userId)) return prev;
            return [...prev, { userId: msg.userId!, name: msg.name ?? "", color: msg.color ?? "#1a56db" }];
          });
        }
        if (msg.type === "SHEET_UPDATE") onRemoteUpdate(msg.update);
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [sheetId, onRemoteUpdate]);

  const broadcast = useCallback((update: unknown) => {
    if (!sheetId) return;
    fetch(`/api/sheets/${sheetId}/collab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SHEET_UPDATE", update }),
    }).catch(() => {});
  }, [sheetId]);

  return { collaborators, broadcast };
}

// ─── SheetsEditor ────────────────────────────────────────────────────────────

export function SheetsEditor({ sheetId }: { sheetId: string }) {
  const [doc, setDoc] = useState<SpreadsheetDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Untitled Spreadsheet");
  const [editingTitle, setEditingTitle] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [activeSheetId, setActiveSheetId] = useState<string>("s1");
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [formulaBarValue, setFormulaBarValue] = useState("");
  const [_selectionRange, setSelectionRange] = useState<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/sheets/${sheetId}`)
      .then((r) => r.json())
      .then((data: { title?: string; content?: string }) => {
        setTitle(data.title ?? "Untitled Spreadsheet");
        if (data.content) {
          const parsed = JSON.parse(data.content) as SpreadsheetDoc;
          setDoc(parsed);
          setActiveSheetId(parsed.activeSheet ?? parsed.sheets[0]?.id ?? "s1");
        }
      })
      .catch(() => toast.error("Failed to load spreadsheet"))
      .finally(() => setLoading(false));
  }, [sheetId]);

  // ── Collab ────────────────────────────────────────────────────────────────
  const handleRemoteUpdate = useCallback((update: unknown) => {
    if (!update || typeof update !== "object") return;
    const u = update as { sheetId?: string; cellKey?: string; cell?: Cell };
    if (u.sheetId && u.cellKey !== undefined) {
      setDoc((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sheets: prev.sheets.map((s) =>
            s.id === u.sheetId
              ? { ...s, cells: { ...s.cells, [u.cellKey!]: u.cell ?? {} } }
              : s
          ),
        };
      });
    }
  }, []);

  const { collaborators, broadcast } = useSheetCollab(sheetId, handleRemoteUpdate);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((newDoc: SpreadsheetDoc) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`/api/sheets/${sheetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(newDoc) }),
      }).catch(() => {});
    }, 1500);
  }, [sheetId]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const activeSheet = doc?.sheets.find((s) => s.id === activeSheetId) ?? null;

  function getCellKey(row: number, col: number) { return `${row}:${col}`; }

  function getCell(row: number, col: number): Cell {
    return activeSheet?.cells[getCellKey(row, col)] ?? {};
  }

  function getCellDisplay(row: number, col: number): string {
    const cell = getCell(row, col);
    if (!cell) return "";
    const val = computeCell(cell, activeSheet!);
    return String(val ?? "");
  }

  function updateCell(row: number, col: number, partial: Partial<Cell>, shId = activeSheetId) {
    setDoc((prev) => {
      if (!prev) return prev;
      const sheet = prev.sheets.find((s) => s.id === shId);
      if (!sheet) return prev;
      const key = getCellKey(row, col);
      const existing = sheet.cells[key] ?? {};
      const updated: Cell = { ...existing, ...partial };
      const newCells = { ...sheet.cells, [key]: updated };
      const newSheets = prev.sheets.map((s) => s.id === shId ? { ...s, cells: newCells } : s);
      const newDoc = { ...prev, sheets: newSheets };
      scheduleSave(newDoc);
      broadcast({ sheetId: shId, cellKey: key, cell: updated });
      return newDoc;
    });
  }

  // ── Cell selection ────────────────────────────────────────────────────────
  function selectCell(row: number, col: number) {
    setSelectedCell({ row, col });
    setSelectionRange(null);
    const cell = getCell(row, col);
    setFormulaBarValue(cell.f ?? String(cell.v ?? ""));
  }

  function startEdit(row: number, col: number) {
    const cell = getCell(row, col);
    const val = cell.f ?? String(cell.v ?? "");
    setEditingCell({ row, col });
    setEditValue(val);
    setTimeout(() => cellInputRef.current?.focus(), 0);
  }

  function commitEdit(row: number, col: number, value: string) {
    setEditingCell(null);
    const isFormula = value.startsWith("=");
    const numericVal = isFormula ? undefined : (isNaN(Number(value)) || value === "" ? value : Number(value));
    updateCell(row, col, isFormula ? { f: value, v: undefined } : { v: numericVal, f: undefined });
    setFormulaBarValue(value);
  }

  function cancelEdit() {
    setEditingCell(null);
  }

  // ── Keyboard nav ──────────────────────────────────────────────────────────
  function handleCellKeyDown(e: React.KeyboardEvent, row: number, col: number) {
    if (e.key === "Enter") {
      commitEdit(row, col, editValue);
      selectCell(Math.min(row + 1, ROWS - 1), col);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitEdit(row, col, editValue);
      selectCell(row, Math.min(col + 1, COLS - 1));
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  function handleGridKeyDown(e: React.KeyboardEvent) {
    if (!selectedCell || editingCell) return;
    const { row, col } = selectedCell;
    if (e.key === "ArrowUp")    { e.preventDefault(); selectCell(Math.max(row - 1, 0), col); }
    if (e.key === "ArrowDown")  { e.preventDefault(); selectCell(Math.min(row + 1, ROWS - 1), col); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); selectCell(row, Math.max(col - 1, 0)); }
    if (e.key === "ArrowRight") { e.preventDefault(); selectCell(row, Math.min(col + 1, COLS - 1)); }
    if (e.key === "Delete" || e.key === "Backspace") {
      updateCell(row, col, { v: "", f: undefined });
      setFormulaBarValue("");
    }
    if (e.key === "Enter") startEdit(row, col);
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setEditValue(e.key);
      startEdit(row, col);
    }
  }

  // ── Formatting ────────────────────────────────────────────────────────────
  function toggleFormat(key: keyof CellStyle, value?: unknown) {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    const cell = getCell(row, col);
    const current = cell.s ?? {};
    const newStyle: CellStyle = key === "align"
      ? { ...current, align: value as CellStyle["align"] }
      : { ...current, [key]: !current[key as keyof CellStyle] };
    updateCell(row, col, { s: newStyle });
  }

  function setColor(key: "color" | "bg", value: string) {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    const cell = getCell(row, col);
    updateCell(row, col, { s: { ...(cell.s ?? {}), [key]: value } });
  }

  // ── Sheet tabs ────────────────────────────────────────────────────────────
  function addSheet() {
    const id = `s${Date.now()}`;
    const name = `Sheet ${(doc?.sheets.length ?? 0) + 1}`;
    setDoc((prev) => {
      if (!prev) return prev;
      const newDoc = { ...prev, sheets: [...prev.sheets, { id, name, cells: {}, colWidths: {}, rowHeights: {} }], activeSheet: id };
      scheduleSave(newDoc);
      return newDoc;
    });
    setActiveSheetId(id);
  }

  function deleteSheet(id: string) {
    if ((doc?.sheets.length ?? 0) <= 1) { toast.error("Cannot delete the only sheet"); return; }
    setDoc((prev) => {
      if (!prev) return prev;
      const remaining = prev.sheets.filter((s) => s.id !== id);
      const newActive = remaining[0]?.id ?? "";
      const newDoc = { ...prev, sheets: remaining, activeSheet: newActive };
      scheduleSave(newDoc);
      return newDoc;
    });
    setActiveSheetId((prev) => prev === id ? (doc?.sheets.find((s) => s.id !== id)?.id ?? "") : prev);
  }

  // ── Import/Export ──────────────────────────────────────────────────────────
  function exportXLSX() {
    if (!doc) return;
    const wb = XLSX.utils.book_new();
    for (const sheet of doc.sheets) {
      const aoa: (string | number)[][] = [];
      for (let r = 0; r < ROWS; r++) {
        const row: (string | number)[] = [];
        for (let c = 0; c < COLS; c++) {
          const cell = sheet.cells[`${r}:${c}`];
          row.push(cell ? computeCell(cell, sheet) : "");
        }
        aoa.push(row);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    XLSX.writeFile(wb, `${title}.xlsx`);
  }

  function importXLSX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const newSheets: SheetTab[] = wb.SheetNames.map((name, idx) => {
          const ws = wb.Sheets[name];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
          const cells: Record<string, Cell> = {};
          aoa.forEach((row, r) => {
            row.forEach((val, c) => {
              if (val !== "" && val !== undefined && val !== null) {
                cells[`${r}:${c}`] = { v: val };
              }
            });
          });
          return { id: `imported-${idx}`, name, cells, colWidths: {}, rowHeights: {} };
        });
        const newDoc: SpreadsheetDoc = { sheets: newSheets, activeSheet: newSheets[0]?.id ?? "s1" };
        setDoc(newDoc);
        setActiveSheetId(newDoc.activeSheet);
        scheduleSave(newDoc);
        toast.success(`Imported ${wb.SheetNames.length} sheet(s)`);
      } catch { toast.error("Failed to import file"); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  // ── Title save ────────────────────────────────────────────────────────────
  function saveTitle() {
    setEditingTitle(false);
    fetch(`/api/sheets/${sheetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#1a56db]" />
      </div>
    );
  }
  if (!doc || !activeSheet) return null;

  const selectedStyle = selectedCell ? (getCell(selectedCell.row, selectedCell.col).s ?? {}) : {};

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#e8eaed] bg-white flex-shrink-0">
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            className="text-sm font-semibold text-[#202124] bg-transparent border-b border-[#1a56db] outline-none px-1"
          />
        ) : (
          <span
            className="text-sm font-semibold text-[#202124] cursor-pointer hover:underline"
            onDoubleClick={() => setEditingTitle(true)}
          >
            {title}
          </span>
        )}

        <div className="flex-1" />

        {/* Collaborators */}
        {collaborators.length > 0 && (
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-[#5f6368]" />
            <div className="flex -space-x-1">
              {collaborators.slice(0, 4).map((c) => (
                <div key={c.userId} title={c.name}
                  className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: c.color }}>
                  {c.name[0]?.toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-md transition-colors">
          <Upload className="w-3.5 h-3.5" /> Import XLSX
        </button>
        <button onClick={exportXLSX}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-md transition-colors">
          <Download className="w-3.5 h-3.5" /> Export XLSX
        </button>
        <button onClick={() => setShowShare(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1a56db] hover:bg-[#1648c7] rounded-md transition-colors">
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importXLSX} />
      </div>

      {/* ── Formatting toolbar ── */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-[#e8eaed] bg-white flex-shrink-0">
        <button onClick={() => toggleFormat("bold")}
          className={`p-1.5 rounded hover:bg-[#f1f3f4] transition-colors ${selectedStyle.bold ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => toggleFormat("italic")}
          className={`p-1.5 rounded hover:bg-[#f1f3f4] transition-colors ${selectedStyle.italic ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => toggleFormat("underline")}
          className={`p-1.5 rounded hover:bg-[#f1f3f4] transition-colors ${selectedStyle.underline ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
          <Underline className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-[#e8eaed] mx-1" />
        {(["left","center","right"] as const).map((a) => (
          <button key={a} onClick={() => toggleFormat("align", a)}
            className={`p-1.5 rounded hover:bg-[#f1f3f4] transition-colors ${selectedStyle.align === a ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
            {a === "left" ? <AlignLeft className="w-3.5 h-3.5" /> : a === "center" ? <AlignCenter className="w-3.5 h-3.5" /> : <AlignRight className="w-3.5 h-3.5" />}
          </button>
        ))}
        <div className="w-px h-4 bg-[#e8eaed] mx-1" />
        <label className="flex items-center gap-1 text-[10px] text-[#5f6368] cursor-pointer">
          <span>Text</span>
          <input type="color" value={selectedStyle.color ?? "#202124"}
            onChange={(e) => setColor("color", e.target.value)}
            className="w-5 h-5 rounded cursor-pointer border border-[#e8eaed]" />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-[#5f6368] cursor-pointer">
          <span>Fill</span>
          <input type="color" value={selectedStyle.bg ?? "#ffffff"}
            onChange={(e) => setColor("bg", e.target.value)}
            className="w-5 h-5 rounded cursor-pointer border border-[#e8eaed]" />
        </label>
      </div>

      {/* ── Formula bar ── */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[#e8eaed] bg-white flex-shrink-0">
        <span className="text-xs font-mono text-[#5f6368] w-12 text-center flex-shrink-0 bg-[#f8f9fa] border border-[#e8eaed] rounded px-1 py-0.5">
          {selectedCell ? `${colLabel(selectedCell.col)}${selectedCell.row + 1}` : ""}
        </span>
        <div className="w-px h-4 bg-[#e8eaed]" />
        <input
          className="flex-1 text-xs font-mono text-[#202124] outline-none bg-transparent"
          value={editingCell ? editValue : formulaBarValue}
          onChange={(e) => {
            if (editingCell) setEditValue(e.target.value);
            else setFormulaBarValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !editingCell && selectedCell) {
              commitEdit(selectedCell.row, selectedCell.col, formulaBarValue);
            }
          }}
          placeholder="Enter value or formula"
        />
      </div>

      {/* ── Grid ── */}
      <div
        ref={gridRef}
        className="flex-1 overflow-auto outline-none select-none"
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
      >
        <div style={{ minWidth: ROW_HEADER_W + COLS * DEFAULT_COL_W }}>
          {/* Column headers */}
          <div className="flex sticky top-0 z-10 bg-[#f8f9fa]">
            <div style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: COL_HEADER_H }}
              className="border-b border-r border-[#e8eaed] bg-[#f8f9fa]" />
            {Array.from({ length: COLS }, (_, c) => (
              <div key={c}
                style={{ width: DEFAULT_COL_W, minWidth: DEFAULT_COL_W, height: COL_HEADER_H }}
                className="border-b border-r border-[#e8eaed] flex items-center justify-center text-xs font-medium text-[#5f6368] bg-[#f8f9fa]">
                {colLabel(c)}
              </div>
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: ROWS }, (_, r) => (
            <div key={r} className="flex">
              {/* Row header */}
              <div style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: DEFAULT_ROW_H }}
                className="border-b border-r border-[#e8eaed] flex items-center justify-center text-xs text-[#5f6368] bg-[#f8f9fa] flex-shrink-0 sticky left-0 z-10">
                {r + 1}
              </div>

              {/* Cells */}
              {Array.from({ length: COLS }, (_, c) => {
                const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                const isEditing = editingCell?.row === r && editingCell?.col === c;
                const cell = getCell(r, c);
                const style = cell.s ?? {};
                const display = getCellDisplay(r, c);

                return (
                  <div
                    key={c}
                    style={{
                      width: DEFAULT_COL_W, minWidth: DEFAULT_COL_W,
                      height: DEFAULT_ROW_H,
                      backgroundColor: style.bg ?? "transparent",
                    }}
                    className={`border-b border-r border-[#e8eaed] relative cursor-cell overflow-hidden
                      ${isSelected ? "outline outline-2 outline-[#1a56db] outline-offset-[-2px] z-[5]" : ""}
                    `}
                    onClick={() => { selectCell(r, c); gridRef.current?.focus(); }}
                    onDoubleClick={() => startEdit(r, c)}
                    onMouseDown={() => setIsDragging(true)}
                    onMouseEnter={() => {
                      if (isDragging && selectedCell) {
                        setSelectionRange({ start: selectedCell, end: { row: r, col: c } });
                      }
                    }}
                    onMouseUp={() => setIsDragging(false)}
                  >
                    {isEditing ? (
                      <input
                        ref={cellInputRef}
                        value={editValue}
                        onChange={(e) => { setEditValue(e.target.value); setFormulaBarValue(e.target.value); }}
                        onKeyDown={(e) => handleCellKeyDown(e, r, c)}
                        onBlur={() => commitEdit(r, c, editValue)}
                        className="absolute inset-0 w-full h-full text-xs px-1 outline-none bg-white border-2 border-[#1a56db] z-20"
                        style={{ fontWeight: style.bold ? "bold" : "normal", fontStyle: style.italic ? "italic" : "normal" }}
                      />
                    ) : (
                      <span
                        className="absolute inset-0 flex items-center px-1 text-xs overflow-hidden whitespace-nowrap"
                        style={{
                          fontWeight: style.bold ? "bold" : "normal",
                          fontStyle: style.italic ? "italic" : "normal",
                          textDecoration: style.underline ? "underline" : "none",
                          textAlign: style.align ?? "left",
                          color: style.color ?? "#202124",
                          justifyContent: style.align === "center" ? "center" : style.align === "right" ? "flex-end" : "flex-start",
                        }}
                      >
                        {display}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {showShare && <DocShareModal docId={sheetId} docType="sheet" onClose={() => setShowShare(false)} />}

      {/* ── Sheet tabs ── */}
      <div className="flex items-center border-t border-[#e8eaed] bg-[#f8f9fa] px-2 h-9 flex-shrink-0 overflow-x-auto">
        {doc.sheets.map((sheet) => (
          <div key={sheet.id}
            className={`flex items-center gap-1 px-3 h-7 text-xs font-medium rounded-t cursor-pointer mr-0.5 group flex-shrink-0 transition-colors
              ${sheet.id === activeSheetId ? "bg-white border border-b-white border-[#e8eaed] text-[#1a56db]" : "text-[#5f6368] hover:bg-white hover:text-[#202124]"}`}
            onClick={() => { setActiveSheetId(sheet.id); setSelectedCell(null); }}
          >
            {sheet.name}
            {doc.sheets.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); deleteSheet(sheet.id); }}
                className="opacity-0 group-hover:opacity-100 hover:text-[#ea4335] transition-opacity ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addSheet}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[#e8eaed] text-[#5f6368] transition-colors ml-1 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
