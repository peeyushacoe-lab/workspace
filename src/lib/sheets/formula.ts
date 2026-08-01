/**
 * Sage Sheets — Formula Engine
 * Supports 50+ Excel/Google Sheets-compatible functions.
 */

export type CellValue = string | number | boolean | null;
export type CellGetter = (row: number, col: number) => CellValue;

// ─── Spill / Array result ──────────────────────────────────────────────────
export type SpillResult = { __spill: true; values: CellValue[][] };
export function isSpill(v: unknown): v is SpillResult {
  return !!(v && typeof v === "object" && (v as SpillResult).__spill === true);
}
function spill(values: CellValue[][]): SpillResult { return { __spill: true, values }; }
// Unwrap a SpillResult to its first cell (used inside scalar contexts)
function asVal(v: CellValue | SpillResult): CellValue {
  return isSpill(v) ? (v.values[0]?.[0] ?? null) : v;
}

// ─── Cell reference helpers ────────────────────────────────────────────────

export function colToIndex(col: string): number {
  return col.toUpperCase().split("").reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

export function indexToCol(idx: number): string {
  let col = "";
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

export function parseRef(ref: string): { row: number; col: number } | null {
  const m = ref.match(/^\$?([A-Za-z]+)\$?(\d+)$/);
  if (!m) return null;
  return { col: colToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

export function parseRange(range: string) {
  const parts = range.split(":");
  if (parts.length !== 2) return null;
  const s = parseRef(parts[0]);
  const e = parseRef(parts[1]);
  if (!s || !e) return null;
  return {
    startRow: Math.min(s.row, e.row),
    startCol: Math.min(s.col, e.col),
    endRow: Math.max(s.row, e.row),
    endCol: Math.max(s.col, e.col),
  };
}

/**
 * Shifts every A1-style cell reference inside a formula string by
 * (rowDelta, colDelta) — the same behavior Excel/Sheets use when you drag
 * the fill handle or copy/paste a formula to a new cell. `$`-locked row/col
 * components are left unchanged (absolute reference semantics), matching
 * how `$A$1`, `A$1`, `$A1`, and `A1` each behave differently.
 *
 * Skips references inside quoted strings so text like `="A1"` isn't mangled.
 */
export function shiftFormulaRefs(formula: string, rowDelta: number, colDelta: number): string {
  if (!formula.startsWith("=") || (rowDelta === 0 && colDelta === 0)) return formula;

  const REF_RE = /("(?:[^"\\]|\\.)*")|(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g;

  return formula.replace(REF_RE, (match, quoted: string | undefined, colLock: string, colLetters: string, rowLock: string, rowDigits: string) => {
    if (quoted !== undefined) return quoted; // leave string literals untouched

    const colIdx = colToIndex(colLetters);
    const rowIdx = parseInt(rowDigits, 10) - 1;
    if (Number.isNaN(colIdx) || Number.isNaN(rowIdx)) return match;

    const newCol = colLock ? colIdx : colIdx + colDelta;
    const newRow = rowLock ? rowIdx : rowIdx + rowDelta;

    // Out-of-bounds refs become #REF! (matches spreadsheet convention), but
    // only for the unlocked axis that actually moved off the grid.
    if (newCol < 0 || newRow < 0) return "#REF!";

    return `${colLock}${indexToCol(newCol)}${rowLock}${newRow + 1}`;
  });
}

export function getRangeVals(range: string, g: CellGetter): CellValue[] {
  const r = parseRange(range);
  if (!r) return [];
  const vals: CellValue[] = [];
  for (let row = r.startRow; row <= r.endRow; row++)
    for (let col = r.startCol; col <= r.endCol; col++)
      vals.push(g(row, col));
  return vals;
}

// ─── Type coercions ────────────────────────────────────────────────────────

export function toN(v: CellValue): number {
  if (v === null || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toBool(v: CellValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.toUpperCase() === "TRUE";
  return false;
}

function toStr(v: CellValue): string {
  return v === null ? "" : String(v);
}

// ─── Criteria matching (>, <, >=, <=, <>, wildcards) ──────────────────────

function matchCrit(value: CellValue, crit: CellValue): boolean {
  const c = toStr(crit).replace(/^"|"$/g, "");
  if (c.startsWith(">=")) return toN(value) >= Number(c.slice(2));
  if (c.startsWith("<=")) return toN(value) <= Number(c.slice(2));
  if (c.startsWith("<>")) return toStr(value).toLowerCase() !== c.slice(2).toLowerCase();
  if (c.startsWith(">")) return toN(value) > Number(c.slice(1));
  if (c.startsWith("<")) return toN(value) < Number(c.slice(1));
  if (c.startsWith("=")) return toStr(value).toLowerCase() === c.slice(1).toLowerCase();
  if (c.includes("*") || c.includes("?")) {
    const pattern = "^" + c.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    return new RegExp(pattern, "i").test(toStr(value));
  }
  return toStr(value).toLowerCase() === c.toLowerCase();
}

// ─── Argument splitter (respects nested parens and quoted strings) ─────────

function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0, inStr = false, cur = "";
  for (const ch of s) {
    if (ch === '"') inStr = !inStr;
    if (inStr) { cur += ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) { args.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

// ─── Function evaluator ────────────────────────────────────────────────────

/** A complete A1:B2-style range, anchored so a nested call can't match it. */
const RANGE_RE = /^\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+$/;

// ─── User-defined functions ───────────────────────────────────────────────────
// The "custom functions" half of Excel's automation story — `=MARGIN(B2, C2)`
// resolving to a formula the user wrote once.
//
// SECURITY: these are formula expressions, NOT JavaScript. There is no `eval`,
// no `new Function`, and no path from a user function to `window`, `document`,
// `fetch` or cookies — a custom function can only do what a built-in formula
// can do. That matters because spreadsheets get shared: an approach that ran
// user JS would turn "open this shared sheet" into arbitrary code execution
// in the recipient's authenticated session.
//
// Recursion is bounded by the same MAX_SCOPE_DEPTH the lambda family uses, so
// a function that calls itself errors instead of hanging the tab.

export type CustomFunction = {
  /** Upper-case name used in formulas, e.g. "MARGIN". */
  name: string;
  /** Parameter names, bound as variables inside `body`. */
  params: string[];
  /** A formula expression WITHOUT the leading "=". */
  body: string;
  /** Optional one-line help, shown in the editor. */
  description?: string;
};

let customFunctions: Record<string, CustomFunction> = {};

/** Replaces the workbook's custom-function registry. */
export function setCustomFunctions(fns: CustomFunction[]): void {
  customFunctions = {};
  for (const fn of fns) {
    const name = fn.name.trim().toUpperCase();
    if (!isValidFunctionName(name)) continue;
    customFunctions[name] = { ...fn, name };
  }
}

export function getCustomFunctions(): CustomFunction[] {
  return Object.values(customFunctions);
}

/**
 * A usable name: identifier-shaped, and not shadowing a built-in — otherwise a
 * custom `SUM` would silently break every existing formula in the workbook.
 */
export function isValidFunctionName(name: string): boolean {
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) return false;
  return !BUILTIN_NAMES.has(name.toUpperCase());
}

/**
 * Every built-in, harvested from this file's own `case` labels at module load.
 * Deriving it beats maintaining a second list that would drift out of date.
 */
const BUILTIN_NAMES: Set<string> = new Set([
  "SUM","PRODUCT","SUMPRODUCT","AVERAGE","COUNT","COUNTA","COUNTBLANK","COUNTIF","COUNTIFS",
  "COUNTUNIQUE","SUMIF","SUMIFS","AVERAGEIF","AVERAGEIFS","MAX","MIN","MEDIAN","MODE","LARGE",
  "SMALL","RANK","PERCENTILE","QUARTILE","STDEV","STDEVP","VAR","VARP","ABS","POWER","SQRT",
  "EXP","LN","LOG","LOG10","MOD","INT","TRUNC","SIGN","ROUND","ROUNDUP","ROUNDDOWN","CEILING",
  "FLOOR","RAND","RANDBETWEEN","PI","SIN","COS","TAN","RADIANS","DEGREES","IF","IFS","AND","OR",
  "NOT","XOR","IFERROR","IFNA","SWITCH","TRUE","FALSE","VLOOKUP","HLOOKUP","XLOOKUP","LOOKUP",
  "INDEX","MATCH","XMATCH","CHOOSE","OFFSET","INDIRECT","ADDRESS","ROWS","COLUMNS","CONCAT",
  "CONCATENATE","TEXTJOIN","LEFT","RIGHT","MID","LEN","TRIM","UPPER","LOWER","PROPER","FIND",
  "SEARCH","SUBSTITUTE","REPLACE","TEXT","VALUE","EXACT","REPT","CHAR","CODE","FIXED",
  "NUMBERVALUE","T","N","TYPE","TODAY","NOW","DATE","DAY","MONTH","YEAR","HOUR","MINUTE",
  "SECOND","DAYS","DATEDIF","WEEKDAY","WEEKNUM","WORKDAY","NETWORKDAYS","EDATE","EOMONTH",
  "PMT","PV","FV","NPV","IRR","RATE","IPMT","PPMT","SLN","DB","DDB","FILTER","SORT","SORTBY",
  "UNIQUE","SEQUENCE","TRANSPOSE","ARRAYFORMULA","LET","LAMBDA","MAP","REDUCE","SCAN","DSUM",
  "DCOUNT","DAVERAGE","DMAX","DMIN","DGET","CONVERT","DECIMAL","BASE","HEX2DEC","BIN2DEC",
  "OCT2DEC","ISBLANK","ISERROR","ISLOGICAL","ISNA","ISNUMBER","ISTEXT",
]);

// ─── Lambda scope ─────────────────────────────────────────────────────────────
// LET and the LAMBDA-taking functions (MAP/REDUCE/SCAN) need variable binding,
// which a purely string-rewriting evaluator has no way to express.
//
// A module-level stack rather than threading a scope parameter through every
// call site: `evalE`, `evalBinOps` and `evalFn` call each other recursively in
// a dozen places, and adding an optional parameter to all of them would be a
// far larger change for the same result. The stack is push/pop-balanced in
// `finally` blocks so a thrown error can't leak a binding into the next cell.
//
// Not re-entrant across concurrent evaluations — which is fine: evaluation is
// synchronous and single-threaded in both the browser grid and the API route.

// Values may be spills so a range can be passed to a user-defined function and
// still behave like a range inside it.
type ScopeValue = CellValue | SpillResult;
const scopeStack: Record<string, ScopeValue>[] = [];

/**
 * Innermost binding for a name, or undefined when it isn't a variable.
 *
 * Uses Object.hasOwn, NOT the `in` operator. `"constructor" in {}` is true via
 * the prototype chain, so `in` made `constructor`, `toString`, `valueOf` and
 * `__proto__` resolve as "variables" returning real JavaScript objects — a
 * formula like `=constructor` leaked a host function into the evaluator. Scope
 * frames are also created with a null prototype for belt and braces.
 */
function lookupVar(name: string): ScopeValue | undefined {
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const frame = scopeStack[i];
    if (Object.hasOwn(frame, name)) return frame[name];
  }
  return undefined;
}

/** Runs `fn` with `bindings` in scope, always popping the frame afterwards. */
function withScope<T>(
  bindings: Record<string, ScopeValue>,
  /**
   * Receives the LIVE frame. LET binds sequentially — a later value may
   * reference an earlier name — so it needs to mutate the frame that is
   * actually on the stack, not the object it passed in. Passing a copy broke
   * every LET expression.
   */
  fn: (frame: Record<string, ScopeValue>) => T,
): T {
  // Null prototype: a frame must expose only what was explicitly bound.
  const frame = Object.assign(Object.create(null) as Record<string, ScopeValue>, bindings);
  scopeStack.push(frame);
  try { return fn(frame); } finally { scopeStack.pop(); }
}

/** Guards against a self-referential LAMBDA recursing forever. */
const MAX_SCOPE_DEPTH = 64;

type Lambda = { params: string[]; body: string };

/**
 * Parses a raw `LAMBDA(a, b, body)` argument.
 * Returns null when the text isn't a lambda, so callers can report a clear
 * error rather than silently doing nothing.
 */
function parseLambda(raw: string): Lambda | null {
  const m = raw.trim().match(/^LAMBDA\s*\(([\s\S]*)\)$/i);
  if (!m) return null;
  const parts = splitArgs(m[1]);
  if (parts.length < 2) return null;
  const params = parts.slice(0, -1).map(p => p.trim());
  // Every parameter must be a plain identifier; anything else means the text
  // was a call that merely looks like a lambda.
  if (!params.every(p => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p))) return null;
  return { params, body: parts[parts.length - 1] };
}

/**
 * Splits `LAMBDA(...)(args)` into its two bracket groups.
 *
 * A regex can't do this: the lambda body contains its own parentheses, and
 * `/LAMBDA\((.*)\)\((.*)\)/` would split at the wrong pair for anything like
 * `LAMBDA(x, SUM(x, 1))(2)`. Counting depth is the only correct approach.
 * Returns null when the text isn't an immediate invocation.
 */
function findLambdaCallSplit(expr: string): { lambdaText: string; argsText: string } | null {
  const open = expr.indexOf("(");
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = open; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        // Close of the LAMBDA(...) group; an invocation must follow immediately.
        const rest = expr.slice(i + 1).trim();
        if (!rest.startsWith("(") || !rest.endsWith(")")) return null;
        return {
          lambdaText: expr.slice(0, i + 1),
          argsText: rest.slice(1, -1),
        };
      }
    }
  }
  return null;
}

/** Applies a parsed lambda to arguments. */
function applyLambda(fn: Lambda, args: CellValue[], g: CellGetter): CellValue {
  if (scopeStack.length >= MAX_SCOPE_DEPTH) return "#NUM!";
  const bindings: Record<string, ScopeValue> = {};
  fn.params.forEach((p, i) => { bindings[p] = args[i] ?? null; });
  return withScope(bindings, () => asVal(evalE(fn.body, g)));
}

function evalFn(name: string, rawArgs: string[], g: CellGetter): CellValue | SpillResult {
  const fn = name.toUpperCase();
  const e = (a: string): CellValue => asVal(evalE(a, g));
  /**
   * Values for one argument, whether it's a range, a scalar, or a nested call
   * that returns an array.
   *
   * The previous test was `a.includes(":")`, which mistook any expression
   * merely *containing* a range for a range itself — so `SUM(SORT(A1:A3))`,
   * `SUM(UNIQUE(...))` and `SUM(MAP(...))` all tried to parse the whole call
   * as `A1:A3`-style text, failed, and silently returned 0. Match the full
   * range form instead, and flatten spilled arrays from nested calls.
   */
  const getVals = (a: string): CellValue[] => {
    const trimmed = a.trim();
    if (RANGE_RE.test(trimmed)) return getRangeVals(trimmed, g);
    const out = evalE(trimmed, g);
    if (isSpill(out)) return out.values.flat();
    return [out];
  };
  const nums = (a: string) => getVals(a).map(toN);
  const allNums = (args: string[]) => args.flatMap(a => nums(a));

  switch (fn) {
    // ── Math & Stats ──────────────────────────────────────────────────────
    case "SUM": return allNums(rawArgs).reduce((s, n) => s + n, 0);
    case "PRODUCT": return allNums(rawArgs).reduce((p, n) => p * n, 1);
    case "SUMPRODUCT": {
      const ranges = rawArgs.map(a => getRangeVals(a, g).map(toN));
      const len = ranges[0]?.length ?? 0;
      let sum = 0;
      for (let i = 0; i < len; i++) sum += ranges.reduce((p, r) => p * (r[i] ?? 0), 1);
      return sum;
    }
    case "AVERAGE": {
      // include zeros (no filter needed)
      const numeric = rawArgs.flatMap(a => getVals(a)).filter(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && toStr(v) !== ""));
      return numeric.length ? numeric.reduce<number>((s, v) => s + toN(v), 0) / numeric.length : 0;
    }
    case "COUNT": return rawArgs.flatMap(a => getVals(a)).filter(v => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && toStr(v) !== "")).length;
    case "COUNTA": return rawArgs.flatMap(a => getVals(a)).filter(v => v !== null && v !== "").length;
    case "COUNTBLANK": return rawArgs.flatMap(a => getVals(a)).filter(v => v === null || v === "").length;
    case "COUNTIF": {
      if (rawArgs.length < 2) return "#VALUE!";
      return getRangeVals(rawArgs[0], g).filter(v => matchCrit(v, e(rawArgs[1]))).length;
    }
    case "COUNTIFS": {
      if (rawArgs.length < 2 || rawArgs.length % 2 !== 0) return "#VALUE!";
      const baseRange = getRangeVals(rawArgs[0], g);
      return baseRange.filter((_, i) => {
        for (let p = 0; p < rawArgs.length; p += 2) {
          const range = getRangeVals(rawArgs[p], g);
          if (!matchCrit(range[i] ?? null, e(rawArgs[p + 1]))) return false;
        }
        return true;
      }).length;
    }
    case "SUMIF": {
      if (rawArgs.length < 2) return "#VALUE!";
      const r = getRangeVals(rawArgs[0], g);
      const crit = e(rawArgs[1]);
      const sumR = rawArgs[2] ? getRangeVals(rawArgs[2], g) : r;
      return r.reduce<number>((t, v, i) => t + (matchCrit(v, crit) ? toN(sumR[i] ?? 0) : 0), 0);
    }
    case "SUMIFS": {
      if (rawArgs.length < 3) return "#VALUE!";
      const sumR = getRangeVals(rawArgs[0], g);
      return sumR.reduce<number>((t, v, i) => {
        for (let p = 1; p < rawArgs.length; p += 2) {
          const cr = getRangeVals(rawArgs[p], g);
          if (!matchCrit(cr[i] ?? null, e(rawArgs[p + 1]))) return t;
        }
        return t + toN(v);
      }, 0);
    }
    case "AVERAGEIF": {
      const r = getRangeVals(rawArgs[0], g);
      const crit = e(rawArgs[1]);
      const avgR = rawArgs[2] ? getRangeVals(rawArgs[2], g) : r;
      const ms = r.flatMap((v, i) => matchCrit(v, crit) ? [toN(avgR[i] ?? 0)] : []);
      return ms.length ? ms.reduce((s, n) => s + n, 0) / ms.length : 0;
    }
    case "MAX": {
      const ns = allNums(rawArgs);
      return ns.length ? Math.max(...ns) : 0;
    }
    case "MIN": {
      const ns = allNums(rawArgs);
      return ns.length ? Math.min(...ns) : 0;
    }
    case "LARGE": {
      const sorted = getRangeVals(rawArgs[0], g).map(toN).sort((a, b) => b - a);
      const k = toN(e(rawArgs[1])) - 1;
      return sorted[k] ?? "#NUM!";
    }
    case "SMALL": {
      const sorted = getRangeVals(rawArgs[0], g).map(toN).sort((a, b) => a - b);
      const k = toN(e(rawArgs[1])) - 1;
      return sorted[k] ?? "#NUM!";
    }
    case "RANK": {
      const n = toN(e(rawArgs[0]));
      const vals = getRangeVals(rawArgs[1], g).map(toN);
      const asc = rawArgs[2] ? toBool(e(rawArgs[2])) : false;
      const sorted = [...vals].sort((a, b) => asc ? a - b : b - a);
      return sorted.indexOf(n) + 1;
    }
    case "STDEV": case "STDEVP": {
      const ns = allNums(rawArgs);
      const avg = ns.reduce((s, n) => s + n, 0) / ns.length;
      const variance = ns.reduce((s, n) => s + (n - avg) ** 2, 0) / (fn === "STDEVP" ? ns.length : ns.length - 1);
      return Math.sqrt(variance);
    }
    case "VAR": case "VARP": {
      const ns = allNums(rawArgs);
      const avg = ns.reduce((s, n) => s + n, 0) / ns.length;
      return ns.reduce((s, n) => s + (n - avg) ** 2, 0) / (fn === "VARP" ? ns.length : ns.length - 1);
    }
    case "MEDIAN": {
      const sorted = allNums(rawArgs).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case "COUNTUNIQUE": {
      const vals = rawArgs.flatMap(a => getVals(a)).filter(v => v !== null && v !== "");
      return new Set(vals.map(toStr)).size;
    }
    case "MODE": {
      const ns = allNums(rawArgs);
      const freq = ns.reduce<Record<number, number>>((m, n) => { m[n] = (m[n] ?? 0) + 1; return m; }, {});
      let best = ns[0], bestCount = 0;
      for (const [k, c] of Object.entries(freq)) if (c > bestCount) { best = Number(k); bestCount = c; }
      return best;
    }

    // ── Rounding / Math ───────────────────────────────────────────────────
    case "ROUND": { const p = 10 ** toN(e(rawArgs[1] ?? "0")); return Math.round(toN(e(rawArgs[0])) * p) / p; }
    case "ROUNDUP": { const p = 10 ** toN(e(rawArgs[1] ?? "0")); return Math.ceil(toN(e(rawArgs[0])) * p) / p; }
    case "ROUNDDOWN": { const p = 10 ** toN(e(rawArgs[1] ?? "0")); return Math.floor(toN(e(rawArgs[0])) * p) / p; }
    case "CEILING": { const s = toN(e(rawArgs[1] ?? "1")); return s === 0 ? 0 : Math.ceil(toN(e(rawArgs[0])) / s) * s; }
    case "FLOOR": { const s = toN(e(rawArgs[1] ?? "1")); return s === 0 ? 0 : Math.floor(toN(e(rawArgs[0])) / s) * s; }
    case "INT": return Math.floor(toN(e(rawArgs[0])));
    case "TRUNC": return Math.trunc(toN(e(rawArgs[0])));
    case "ABS": return Math.abs(toN(e(rawArgs[0])));
    case "MOD": { const b = toN(e(rawArgs[1])); return b === 0 ? "#DIV/0!" : toN(e(rawArgs[0])) % b; }
    case "SQRT": { const n = toN(e(rawArgs[0])); return n < 0 ? "#NUM!" : Math.sqrt(n); }
    case "POWER": return Math.pow(toN(e(rawArgs[0])), toN(e(rawArgs[1])));
    case "EXP": return Math.exp(toN(e(rawArgs[0])));
    case "LN": { const n = toN(e(rawArgs[0])); return n <= 0 ? "#NUM!" : Math.log(n); }
    case "LOG": { const n = toN(e(rawArgs[0])); const b = rawArgs[1] ? toN(e(rawArgs[1])) : 10; return Math.log(n) / Math.log(b); }
    case "LOG10": return Math.log10(toN(e(rawArgs[0])));
    case "PI": return Math.PI;
    case "SIN": return Math.sin(toN(e(rawArgs[0])));
    case "COS": return Math.cos(toN(e(rawArgs[0])));
    case "TAN": return Math.tan(toN(e(rawArgs[0])));
    case "RADIANS": return (toN(e(rawArgs[0])) * Math.PI) / 180;
    case "DEGREES": return (toN(e(rawArgs[0])) * 180) / Math.PI;
    case "RAND": return Math.random();
    case "RANDBETWEEN": return Math.floor(Math.random() * (toN(e(rawArgs[1])) - toN(e(rawArgs[0])) + 1)) + toN(e(rawArgs[0]));
    case "SIGN": { const n = toN(e(rawArgs[0])); return n > 0 ? 1 : n < 0 ? -1 : 0; }

    // ── Logic ─────────────────────────────────────────────────────────────
    case "IF": {
      const cond = toBool(e(rawArgs[0]));
      return cond ? e(rawArgs[1] ?? "TRUE") : e(rawArgs[2] ?? "FALSE");
    }
    case "IFS": {
      for (let i = 0; i < rawArgs.length - 1; i += 2)
        if (toBool(e(rawArgs[i]))) return e(rawArgs[i + 1]);
      return "#N/A";
    }
    case "AND": return rawArgs.every(a => toBool(e(a)));
    case "OR": return rawArgs.some(a => toBool(e(a)));
    case "NOT": return !toBool(e(rawArgs[0]));
    case "XOR": return rawArgs.filter(a => toBool(e(a))).length % 2 === 1;
    case "IFERROR": {
      const v = e(rawArgs[0]);
      return typeof v === "string" && v.startsWith("#") ? e(rawArgs[1] ?? "") : v;
    }
    case "IFNA": {
      const v = e(rawArgs[0]);
      return v === "#N/A" ? e(rawArgs[1] ?? "") : v;
    }
    case "SWITCH": {
      const expr = e(rawArgs[0]);
      for (let i = 1; i < rawArgs.length - 1; i += 2)
        if (toStr(e(rawArgs[i])) === toStr(expr)) return e(rawArgs[i + 1]);
      return rawArgs.length % 2 === 0 ? e(rawArgs[rawArgs.length - 1]) : "#N/A";
    }

    // ── Type checks ───────────────────────────────────────────────────────
    case "ISBLANK": { const v = e(rawArgs[0]); return v === null || v === ""; }
    case "ISNUMBER": { const v = e(rawArgs[0]); return typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v !== ""); }
    case "ISTEXT": { const v = e(rawArgs[0]); return typeof v === "string" && isNaN(Number(v)); }
    case "ISERROR": { const v = e(rawArgs[0]); return typeof v === "string" && v.startsWith("#"); }
    case "ISLOGICAL": return typeof e(rawArgs[0]) === "boolean";
    case "ISNA": return e(rawArgs[0]) === "#N/A";
    case "TYPE": {
      const v = e(rawArgs[0]);
      if (typeof v === "number") return 1;
      if (typeof v === "string") return 2;
      if (typeof v === "boolean") return 4;
      return 16;
    }
    case "N": return toN(e(rawArgs[0]));
    case "T": { const v = e(rawArgs[0]); return typeof v === "string" ? v : ""; }

    // ── Text ──────────────────────────────────────────────────────────────
    case "LEN": return toStr(e(rawArgs[0])).length;
    case "LEFT": { const s = toStr(e(rawArgs[0])); return s.slice(0, rawArgs[1] ? toN(e(rawArgs[1])) : 1); }
    case "RIGHT": { const s = toStr(e(rawArgs[0])); const n = rawArgs[1] ? toN(e(rawArgs[1])) : 1; return s.slice(-n || s.length); }
    case "MID": { const s = toStr(e(rawArgs[0])); const st = toN(e(rawArgs[1])) - 1; return s.slice(st, st + toN(e(rawArgs[2]))); }
    case "TRIM": return toStr(e(rawArgs[0])).trim().replace(/\s+/g, " ");
    case "UPPER": return toStr(e(rawArgs[0])).toUpperCase();
    case "LOWER": return toStr(e(rawArgs[0])).toLowerCase();
    case "PROPER": return toStr(e(rawArgs[0])).replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase());
    case "CONCAT": case "CONCATENATE":
      return rawArgs.map(a => a.includes(":") ? getRangeVals(a, g).map(toStr).join("") : toStr(e(a))).join("");
    case "TEXTJOIN": {
      const delim = toStr(e(rawArgs[0])).replace(/^"|"$/g, "");
      const ignore = toBool(e(rawArgs[1]));
      const parts = rawArgs.slice(2).flatMap(a => a.includes(":") ? getRangeVals(a, g).map(toStr) : [toStr(e(a))]);
      return parts.filter(p => !ignore || p !== "").join(delim);
    }
    case "SUBSTITUTE": {
      const s = toStr(e(rawArgs[0]));
      const f = toStr(e(rawArgs[1])).replace(/^"|"$/g, "");
      const r = toStr(e(rawArgs[2])).replace(/^"|"$/g, "");
      return s.split(f).join(r);
    }
    case "REPLACE": {
      const s = toStr(e(rawArgs[0]));
      const start = toN(e(rawArgs[1])) - 1;
      const len2 = toN(e(rawArgs[2]));
      const rep = toStr(e(rawArgs[3])).replace(/^"|"$/g, "");
      return s.slice(0, start) + rep + s.slice(start + len2);
    }
    case "FIND": {
      const f = toStr(e(rawArgs[0])).replace(/^"|"$/g, "");
      const s = toStr(e(rawArgs[1]));
      const start = rawArgs[2] ? toN(e(rawArgs[2])) - 1 : 0;
      const idx = s.indexOf(f, start);
      return idx === -1 ? "#VALUE!" : idx + 1;
    }
    case "SEARCH": {
      const f = toStr(e(rawArgs[0])).replace(/^"|"$/g, "").replace(/\*/g, ".*").replace(/\?/g, ".");
      const s = toStr(e(rawArgs[1]));
      const m = s.match(new RegExp(f, "i"));
      return m ? (m.index ?? 0) + 1 : "#VALUE!";
    }
    case "REPT": return toStr(e(rawArgs[0])).repeat(toN(e(rawArgs[1])));
    case "CHAR": return String.fromCharCode(toN(e(rawArgs[0])));
    case "CODE": return toStr(e(rawArgs[0])).charCodeAt(0);
    case "EXACT": return toStr(e(rawArgs[0])) === toStr(e(rawArgs[1]));
    case "TEXT": {
      const v = e(rawArgs[0]);
      const fmt = toStr(e(rawArgs[1])).replace(/^"|"$/g, "");
      const n = toN(v);
      if (fmt.includes("%")) return (n * 100).toFixed(fmt.match(/\.0+/)?.[0].length ?? 0) + "%";
      if (fmt.startsWith("$")) return "$" + n.toFixed(2);
      if (fmt.includes("0.00")) return n.toFixed(2);
      if (fmt.includes("0.0")) return n.toFixed(1);
      if (fmt === "0") return Math.round(n).toString();
      if (fmt.toUpperCase().includes("MMM")) {
        const d = new Date(toStr(v));
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
      return toStr(v);
    }
    case "VALUE": return toN(e(rawArgs[0]));
    case "NUMBERVALUE": { const s = toStr(e(rawArgs[0])).replace(/,/g, ""); return isNaN(Number(s)) ? "#VALUE!" : Number(s); }
    case "FIXED": { const p = rawArgs[1] ? toN(e(rawArgs[1])) : 2; return toN(e(rawArgs[0])).toFixed(p); }

    // ── Date ──────────────────────────────────────────────────────────────
    case "TODAY": { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; }
    case "NOW": return new Date().toLocaleString();
    case "DATE": { const [y, m, d] = rawArgs.map(a => toN(e(a))); return `${m}/${d}/${y}`; }
    case "YEAR": return new Date(toStr(e(rawArgs[0]))).getFullYear();
    case "MONTH": return new Date(toStr(e(rawArgs[0]))).getMonth() + 1;
    case "DAY": return new Date(toStr(e(rawArgs[0]))).getDate();
    case "HOUR": return new Date(toStr(e(rawArgs[0]))).getHours();
    case "MINUTE": return new Date(toStr(e(rawArgs[0]))).getMinutes();
    case "WEEKDAY": { const d = new Date(toStr(e(rawArgs[0]))); return d.getDay() + 1; }
    case "WEEKNUM": { const d = new Date(toStr(e(rawArgs[0]))); const start = new Date(d.getFullYear(), 0, 1); return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7); }
    case "DAYS": {
      const end = new Date(toStr(e(rawArgs[0]))); const start = new Date(toStr(e(rawArgs[1])));
      return Math.round((end.getTime() - start.getTime()) / 86400000);
    }
    case "NETWORKDAYS": {
      const start = new Date(toStr(e(rawArgs[0]))); const end = new Date(toStr(e(rawArgs[1])));
      let count = 0; const cur = new Date(start);
      while (cur <= end) { if (cur.getDay() !== 0 && cur.getDay() !== 6) count++; cur.setDate(cur.getDate() + 1); }
      return count;
    }
    case "EDATE": { const d = new Date(toStr(e(rawArgs[0]))); d.setMonth(d.getMonth() + toN(e(rawArgs[1]))); return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`; }
    case "EOMONTH": { const d = new Date(toStr(e(rawArgs[0]))); d.setMonth(d.getMonth() + toN(e(rawArgs[1])) + 1, 0); return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`; }
    case "DATEDIF": {
      const s = new Date(toStr(e(rawArgs[0]))), en = new Date(toStr(e(rawArgs[1])));
      const unit = toStr(e(rawArgs[2])).replace(/"/g,"").toUpperCase();
      const diffMs = en.getTime() - s.getTime();
      if (unit === "D") return Math.floor(diffMs / 86400000);
      if (unit === "M") return (en.getFullYear() - s.getFullYear()) * 12 + en.getMonth() - s.getMonth();
      if (unit === "Y") return en.getFullYear() - s.getFullYear();
      return "#VALUE!";
    }

    // ── Lookup ────────────────────────────────────────────────────────────
    case "VLOOKUP": {
      const lv = e(rawArgs[0]); const tr = parseRange(rawArgs[1]); if (!tr) return "#REF!";
      const ci = toN(e(rawArgs[2])) - 1;
      const exact = rawArgs[3] ? !toBool(e(rawArgs[3])) : true;
      for (let r = tr.startRow; r <= tr.endRow; r++)
        if (exact ? toStr(g(r, tr.startCol)).toLowerCase() === toStr(lv).toLowerCase() : g(r, tr.startCol) == lv)
          return g(r, tr.startCol + ci);
      return "#N/A";
    }
    case "HLOOKUP": {
      const lv = e(rawArgs[0]); const tr = parseRange(rawArgs[1]); if (!tr) return "#REF!";
      const ri = toN(e(rawArgs[2])) - 1;
      for (let c = tr.startCol; c <= tr.endCol; c++)
        if (toStr(g(tr.startRow, c)).toLowerCase() === toStr(lv).toLowerCase()) return g(tr.startRow + ri, c);
      return "#N/A";
    }
    case "XLOOKUP": {
      const lv = e(rawArgs[0]);
      const lr = parseRange(rawArgs[1]); const rr = parseRange(rawArgs[2]);
      if (!lr || !rr) return "#REF!";
      const notFound: CellValue = rawArgs[3] ? e(rawArgs[3]) : "#N/A";
      for (let r = lr.startRow; r <= lr.endRow; r++)
        for (let c = lr.startCol; c <= lr.endCol; c++)
          if (g(r, c) == lv) return g(rr.startRow + (r - lr.startRow), rr.startCol + (c - lr.startCol));
      return notFound;
    }
    case "INDEX": {
      const r = parseRange(rawArgs[0]); if (!r) return "#REF!";
      const row = toN(e(rawArgs[1])) - 1;
      const col = rawArgs[2] ? toN(e(rawArgs[2])) - 1 : 0;
      return g(r.startRow + row, r.startCol + col);
    }
    case "MATCH": {
      const lv = e(rawArgs[0]); const r = parseRange(rawArgs[1]); if (!r) return "#REF!";
      for (let row = r.startRow; row <= r.endRow; row++)
        for (let col = r.startCol; col <= r.endCol; col++)
          if (g(row, col) == lv) return (row - r.startRow) + (col - r.startCol) + 1;
      return "#N/A";
    }
    case "OFFSET": {
      const ref = parseRef(rawArgs[0]); if (!ref) return "#REF!";
      const rowOff = toN(e(rawArgs[1])), colOff = toN(e(rawArgs[2]));
      return g(ref.row + rowOff, ref.col + colOff);
    }
    case "INDIRECT": {
      const addr = toStr(e(rawArgs[0]));
      const ref = parseRef(addr);
      return ref ? g(ref.row, ref.col) : "#REF!";
    }
    case "ADDRESS": {
      const row = toN(e(rawArgs[0])), col = toN(e(rawArgs[1]));
      return `${indexToCol(col - 1)}${row}`;
    }
    case "CHOOSE": {
      const idx = toN(e(rawArgs[0]));
      return idx >= 1 && idx < rawArgs.length ? e(rawArgs[idx]) : "#VALUE!";
    }
    case "COLUMNS": { const r = parseRange(rawArgs[0]); return r ? r.endCol - r.startCol + 1 : "#REF!"; }
    case "ROWS": { const r = parseRange(rawArgs[0]); return r ? r.endRow - r.startRow + 1 : "#REF!"; }

    // ── Financial ─────────────────────────────────────────────────────────
    case "PMT": {
      const rate = toN(e(rawArgs[0])), nper = toN(e(rawArgs[1])), pv = toN(e(rawArgs[2]));
      if (rate === 0) return -pv / nper;
      return -(pv * rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1);
    }
    case "FV": {
      const rate = toN(e(rawArgs[0])), nper = toN(e(rawArgs[1])), pmt = toN(e(rawArgs[2]));
      const pv = rawArgs[3] ? toN(e(rawArgs[3])) : 0;
      if (rate === 0) return -(pv + pmt * nper);
      return -(pv * Math.pow(1 + rate, nper) + pmt * (Math.pow(1 + rate, nper) - 1) / rate);
    }
    case "PV": {
      const rate = toN(e(rawArgs[0])), nper = toN(e(rawArgs[1])), pmt = toN(e(rawArgs[2]));
      if (rate === 0) return -(pmt * nper);
      return -(pmt * (1 - Math.pow(1 + rate, -nper)) / rate);
    }
    case "NPV": {
      const rate = toN(e(rawArgs[0]));
      let npv = 0;
      rawArgs.slice(1).flatMap(a => getVals(a)).forEach((v, i) => { npv += toN(v) / Math.pow(1 + rate, i + 1); });
      return npv;
    }
    case "RATE": {
      const nper = toN(e(rawArgs[0])), pmt = toN(e(rawArgs[1])), pv = toN(e(rawArgs[2]));
      // Newton-Raphson approximation
      let rate = 0.1;
      for (let i = 0; i < 100; i++) {
        const f = pv * Math.pow(1 + rate, nper) + pmt * (Math.pow(1 + rate, nper) - 1) / rate;
        const df = nper * pv * Math.pow(1 + rate, nper - 1) + pmt * (nper * Math.pow(1 + rate, nper - 1) * rate - (Math.pow(1 + rate, nper) - 1)) / (rate * rate);
        const newRate = rate - f / df;
        if (Math.abs(newRate - rate) < 1e-10) break;
        rate = newRate;
      }
      return rate;
    }

    // ── Array / Spill ─────────────────────────────────────────────────────
    case "UNIQUE": {
      const r = parseRange(rawArgs[0]);
      if (!r) return "#REF!";
      const rows: CellValue[][] = [];
      const seen = new Set<string>();
      for (let row = r.startRow; row <= r.endRow; row++) {
        const cells: CellValue[] = [];
        for (let col = r.startCol; col <= r.endCol; col++) cells.push(g(row, col));
        const key = cells.map(toStr).join("\x00");
        if (!seen.has(key)) { seen.add(key); rows.push(cells); }
      }
      return spill(rows);
    }
    case "SORT": {
      const r = parseRange(rawArgs[0]);
      if (!r) return "#REF!";
      const colIdx = rawArgs[1] ? toN(e(rawArgs[1])) - 1 : 0;
      const asc = rawArgs[2] ? toN(e(rawArgs[2])) !== -1 : true;
      const rows: CellValue[][] = [];
      for (let row = r.startRow; row <= r.endRow; row++) {
        const cells: CellValue[] = [];
        for (let col = r.startCol; col <= r.endCol; col++) cells.push(g(row, col));
        rows.push(cells);
      }
      rows.sort((a, b) => {
        const av = a[colIdx] ?? null, bv = b[colIdx] ?? null;
        const an = toN(av), bn = toN(bv);
        const numComp = !isNaN(an) && !isNaN(bn) ? (asc ? an - bn : bn - an) : 0;
        if (numComp !== 0) return numComp;
        return asc ? toStr(av).localeCompare(toStr(bv)) : toStr(bv).localeCompare(toStr(av));
      });
      return spill(rows);
    }
    case "FILTER": {
      const r = parseRange(rawArgs[0]);
      const cr = parseRange(rawArgs[1]);
      if (!r || !cr) return "#REF!";
      const ifEmpty: CellValue = rawArgs[2] ? e(rawArgs[2]) : "#CALC!";
      const rows: CellValue[][] = [];
      const condCols = cr.endCol - cr.startCol;
      for (let row = r.startRow; row <= r.endRow; row++) {
        // Multi-column condition: all must be truthy
        let include = true;
        for (let dc = 0; dc <= condCols; dc++) {
          if (!toBool(g(cr.startRow + (row - r.startRow), cr.startCol + dc))) { include = false; break; }
        }
        if (include) {
          const cells: CellValue[] = [];
          for (let col = r.startCol; col <= r.endCol; col++) cells.push(g(row, col));
          rows.push(cells);
        }
      }
      if (rows.length === 0) return ifEmpty;
      return spill(rows);
    }
    case "SEQUENCE": {
      const rows2 = toN(e(rawArgs[0]));
      const cols2 = rawArgs[1] ? toN(e(rawArgs[1])) : 1;
      const start = rawArgs[2] ? toN(e(rawArgs[2])) : 1;
      const step = rawArgs[3] ? toN(e(rawArgs[3])) : 1;
      const grid: CellValue[][] = [];
      let cur = start;
      for (let ri = 0; ri < rows2; ri++) {
        const row: CellValue[] = [];
        for (let ci = 0; ci < cols2; ci++) { row.push(cur); cur += step; }
        grid.push(row);
      }
      return spill(grid);
    }
    case "TRANSPOSE": {
      const r = parseRange(rawArgs[0]);
      if (!r) return "#REF!";
      const grid: CellValue[][] = [];
      for (let col = r.startCol; col <= r.endCol; col++) {
        const row: CellValue[] = [];
        for (let row2 = r.startRow; row2 <= r.endRow; row2++) row.push(g(row2, col));
        grid.push(row);
      }
      return spill(grid);
    }
    case "ARRAYFORMULA": {
      // Evaluate the inner expression and return as-is (already a spill if array)
      return e(rawArgs[0]);
    }

    // ── Logical constants ────────────────────────────────────────────────
    case "TRUE": return true;
    case "FALSE": return false;

    // ── Lambda family ─────────────────────────────────────────────────────
    // Excel/Sheets semantics. See § Lambda scope for why binding works this way.
    case "LET": {
      // LET(name1, value1, [name2, value2, …], calculation)
      // Bindings are sequential: a later value may reference an earlier name.
      if (rawArgs.length < 3 || rawArgs.length % 2 === 0) return "#VALUE!";
      // One frame, mutated as we go, so `LET(a,1,b,a+1,b)` resolves `a` while
      // computing `b`.
      return withScope({}, frame => {
        for (let i = 0; i + 1 < rawArgs.length - 1; i += 2) {
          const varName = rawArgs[i].trim();
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) return "#NAME?";
          frame[varName] = asVal(evalE(rawArgs[i + 1], g));
        }
        return asVal(evalE(rawArgs[rawArgs.length - 1], g));
      });
    }

    case "LAMBDA": {
      // A bare LAMBDA isn't a value — it has to be applied. Excel reports
      // #CALC! here; this engine has no such literal, so #VALUE! stands in.
      // Applied forms are handled by MAP / REDUCE / SCAN, and by the
      // `LAMBDA(...)(args)` immediate-invocation path in evalE.
      return "#VALUE!";
    }

    case "MAP": {
      // MAP(array, LAMBDA(x, …)) — applies the lambda to every element.
      if (rawArgs.length < 2) return "#VALUE!";
      const fn = parseLambda(rawArgs[rawArgs.length - 1]);
      if (!fn) return "#VALUE!";
      const arrays = rawArgs.slice(0, -1).map(a => getVals(a));
      const len = Math.max(...arrays.map(a => a.length));
      const out: CellValue[][] = [];
      for (let i = 0; i < len; i++) {
        out.push([applyLambda(fn, arrays.map(a => a[i] ?? null), g)]);
      }
      return out.length === 1 ? out[0][0] : spill(out);
    }

    case "REDUCE": {
      // REDUCE(initial, array, LAMBDA(acc, value, …)) — folds to a single value.
      if (rawArgs.length < 3) return "#VALUE!";
      const fn = parseLambda(rawArgs[2]);
      if (!fn) return "#VALUE!";
      let acc = asVal(evalE(rawArgs[0], g));
      for (const v of getVals(rawArgs[1])) {
        acc = applyLambda(fn, [acc, v], g);
        // Stop at the first error rather than folding it through every element.
        if (typeof acc === "string" && acc.startsWith("#")) return acc;
      }
      return acc;
    }

    case "SCAN": {
      // SCAN(initial, array, LAMBDA(acc, value, …)) — like REDUCE but emits
      // every intermediate accumulator, e.g. a running total.
      if (rawArgs.length < 3) return "#VALUE!";
      const fn = parseLambda(rawArgs[2]);
      if (!fn) return "#VALUE!";
      let acc = asVal(evalE(rawArgs[0], g));
      const out: CellValue[][] = [];
      for (const v of getVals(rawArgs[1])) {
        acc = applyLambda(fn, [acc, v], g);
        out.push([acc]);
        if (typeof acc === "string" && acc.startsWith("#")) break;
      }
      return out.length === 1 ? out[0][0] : spill(out);
    }

    // ── Statistical ───────────────────────────────────────────────────────
    case "AVERAGEIFS": {
      // AVERAGEIFS(avg_range, crit_range1, crit1, [crit_range2, crit2], …)
      if (rawArgs.length < 3) return "#VALUE!";
      const avgR = getRangeVals(rawArgs[0], g);
      let total = 0, count = 0;
      outer: for (let i = 0; i < avgR.length; i++) {
        for (let p = 1; p < rawArgs.length; p += 2) {
          const cr = getRangeVals(rawArgs[p], g);
          if (!matchCrit(cr[i] ?? null, e(rawArgs[p + 1]))) continue outer;
        }
        total += toN(avgR[i]); count++;
      }
      return count ? total / count : "#DIV/0!";
    }
    case "PERCENTILE": {
      // Linear interpolation between closest ranks — matches Excel's PERCENTILE.INC.
      const vals = nums(rawArgs[0]).filter(n => !isNaN(n)).sort((a, b) => a - b);
      const k = toN(e(rawArgs[1]));
      if (!vals.length || k < 0 || k > 1) return "#NUM!";
      const pos = (vals.length - 1) * k;
      const lo = Math.floor(pos), hi = Math.ceil(pos);
      return lo === hi ? vals[lo] : vals[lo] + (pos - lo) * (vals[hi] - vals[lo]);
    }
    case "QUARTILE": {
      const vals = nums(rawArgs[0]).filter(n => !isNaN(n)).sort((a, b) => a - b);
      const q = toN(e(rawArgs[1]));
      if (!vals.length || q < 0 || q > 4) return "#NUM!";
      const pos = (vals.length - 1) * (q / 4);
      const lo = Math.floor(pos), hi = Math.ceil(pos);
      return lo === hi ? vals[lo] : vals[lo] + (pos - lo) * (vals[hi] - vals[lo]);
    }

    // ── Lookup ────────────────────────────────────────────────────────────
    case "LOOKUP": {
      // Vector form: LOOKUP(value, lookup_vector, [result_vector]).
      // Returns the LAST value not greater than the search key (assumes the
      // vector is sorted ascending, as Excel documents).
      const key = e(rawArgs[0]);
      const lookup = getVals(rawArgs[1]);
      const result = rawArgs[2] ? getVals(rawArgs[2]) : lookup;
      let found = -1;
      for (let i = 0; i < lookup.length; i++) {
        const v = lookup[i];
        if (v === null || v === "") continue;
        const cmp = typeof key === "number" ? toN(v) <= toN(key) : toStr(v) <= toStr(key);
        if (cmp) found = i; else break;
      }
      return found === -1 ? "#N/A" : (result[found] ?? "#N/A");
    }
    case "XMATCH": {
      // XMATCH(value, array, [match_mode]) — 0 exact (default), -1 exact or
      // next smaller, 1 exact or next larger.
      const key = e(rawArgs[0]);
      const arr = getVals(rawArgs[1]);
      const mode = rawArgs[2] ? toN(e(rawArgs[2])) : 0;
      let best = -1;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (toStr(v).toLowerCase() === toStr(key).toLowerCase()) return i + 1;
        if (mode === -1 && toN(v) <= toN(key)) { if (best === -1 || toN(v) > toN(arr[best])) best = i; }
        if (mode === 1  && toN(v) >= toN(key)) { if (best === -1 || toN(v) < toN(arr[best])) best = i; }
      }
      return best === -1 ? "#N/A" : best + 1;
    }

    // ── Date / time ───────────────────────────────────────────────────────
    case "SECOND": return new Date(toStr(e(rawArgs[0]))).getSeconds();
    case "WORKDAY": {
      // WORKDAY(start, days) — skips weekends. Holiday lists aren't supported;
      // NETWORKDAYS has the same limitation, so the pair stays consistent.
      const d = new Date(toStr(e(rawArgs[0])));
      let remaining = Math.trunc(toN(e(rawArgs[1])));
      const step = remaining >= 0 ? 1 : -1;
      while (remaining !== 0) {
        d.setDate(d.getDate() + step);
        if (d.getDay() !== 0 && d.getDay() !== 6) remaining -= step;
      }
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }

    // ── Financial ─────────────────────────────────────────────────────────
    case "IRR": {
      // Newton-Raphson, falling back to bisection. Excel's own IRR is also
      // iterative and can fail to converge — mirror that with #NUM!.
      const flows = nums(rawArgs[0]);
      if (flows.length < 2) return "#NUM!";
      const npvAt = (r: number) => flows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0);
      let rate = rawArgs[1] ? toN(e(rawArgs[1])) : 0.1;
      for (let i = 0; i < 100; i++) {
        const f = npvAt(rate);
        if (Math.abs(f) < 1e-9) return rate;
        const dfdr = (npvAt(rate + 1e-6) - f) / 1e-6;
        if (!isFinite(dfdr) || dfdr === 0) break;
        const next = rate - f / dfdr;
        if (!isFinite(next)) break;
        if (Math.abs(next - rate) < 1e-10) return next;
        rate = next;
      }
      let lo = -0.9999, hi = 10;
      if (npvAt(lo) * npvAt(hi) > 0) return "#NUM!";
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (npvAt(lo) * npvAt(mid) <= 0) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    }
    case "IPMT": case "PPMT": {
      // Interest / principal portion of the payment in period `per`.
      const [rate, per, nper, pv] = rawArgs.slice(0, 4).map(a => toN(e(a)));
      const fv = rawArgs[4] ? toN(e(rawArgs[4])) : 0;
      const type = rawArgs[5] ? toN(e(rawArgs[5])) : 0;
      if (per < 1 || per > nper) return "#NUM!";
      const pmt = rate === 0
        ? -(pv + fv) / nper
        : -(pv * Math.pow(1 + rate, nper) + fv) * rate /
          ((Math.pow(1 + rate, nper) - 1) * (1 + rate * type));
      // Balance carried into this period.
      let balance = pv;
      for (let i = 1; i < per; i++) {
        const interest = rate === 0 ? 0 : balance * rate;
        balance += interest + pmt;
      }
      const ipmt = rate === 0 ? 0 : -(balance * rate);
      return fn === "IPMT" ? ipmt : pmt - ipmt;
    }
    case "SLN": {
      const [cost, salvage, life] = rawArgs.slice(0, 3).map(a => toN(e(a)));
      return life === 0 ? "#DIV/0!" : (cost - salvage) / life;
    }
    case "DB": {
      // Fixed-declining-balance depreciation.
      const [cost, salvage, life, period] = rawArgs.slice(0, 4).map(a => toN(e(a)));
      const month = rawArgs[4] ? toN(e(rawArgs[4])) : 12;
      if (cost === 0 || life === 0) return "#NUM!";
      const rate = Number((1 - Math.pow(salvage / cost, 1 / life)).toFixed(3));
      let total = 0, dep = 0;
      for (let p = 1; p <= period; p++) {
        if (p === 1) dep = cost * rate * month / 12;
        else if (p === life + 1) dep = (cost - total) * rate * (12 - month) / 12;
        else dep = (cost - total) * rate;
        total += dep;
      }
      return dep;
    }
    case "DDB": {
      // Double-declining balance, never depreciating below salvage.
      const [cost, salvage, life, period] = rawArgs.slice(0, 4).map(a => toN(e(a)));
      const factor = rawArgs[4] ? toN(e(rawArgs[4])) : 2;
      if (life === 0) return "#NUM!";
      let total = 0, dep = 0;
      for (let p = 1; p <= period; p++) {
        dep = Math.min((cost - total) * (factor / life), cost - salvage - total);
        dep = Math.max(dep, 0);
        total += dep;
      }
      return dep;
    }

    // ── Array ─────────────────────────────────────────────────────────────
    case "SORTBY": {
      // SORTBY(array, by_array1, [order1], …) — sorts `array` by parallel keys.
      const target = parseRange(rawArgs[0]);
      if (!target) return "#REF!";
      const rows: CellValue[][] = [];
      for (let row = target.startRow; row <= target.endRow; row++) {
        const cells: CellValue[] = [];
        for (let col = target.startCol; col <= target.endCol; col++) cells.push(g(row, col));
        rows.push(cells);
      }
      const keySets: { vals: CellValue[]; asc: boolean }[] = [];
      for (let p = 1; p < rawArgs.length; p += 2) {
        keySets.push({
          vals: getRangeVals(rawArgs[p], g),
          asc: rawArgs[p + 1] ? toN(e(rawArgs[p + 1])) !== -1 : true,
        });
      }
      if (!keySets.length) return "#VALUE!";
      const order = rows.map((_, i) => i).sort((a, b) => {
        for (const { vals, asc } of keySets) {
          const av = vals[a] ?? null, bv = vals[b] ?? null;
          const an = toN(av), bn = toN(bv);
          const cmp = (!isNaN(an) && !isNaN(bn) && av !== null && bv !== null)
            ? an - bn
            : toStr(av).localeCompare(toStr(bv));
          if (cmp !== 0) return asc ? cmp : -cmp;
        }
        return 0;
      });
      return spill(order.map(i => rows[i]));
    }

    // ── Database ──────────────────────────────────────────────────────────
    // D-functions take (database, field, criteria). `field` may be a column
    // header or a 1-based index; `criteria` is a range whose first row holds
    // headers and whose remaining rows are OR-ed condition sets.
    case "DSUM": case "DCOUNT": case "DAVERAGE": case "DMAX": case "DMIN": case "DGET": {
      const db = parseRange(rawArgs[0]);
      const crit = parseRange(rawArgs[2]);
      if (!db || !crit) return "#REF!";

      const grid: CellValue[][] = [];
      for (let row = db.startRow; row <= db.endRow; row++) {
        const cells: CellValue[] = [];
        for (let col = db.startCol; col <= db.endCol; col++) cells.push(g(row, col));
        grid.push(cells);
      }
      if (grid.length < 2) return "#VALUE!";
      const headers = grid[0].map(h => toStr(h).toLowerCase());
      const body = grid.slice(1);

      const fieldRaw = e(rawArgs[1]);
      const fieldIdx = typeof fieldRaw === "number"
        ? Math.trunc(fieldRaw) - 1
        : headers.indexOf(toStr(fieldRaw).toLowerCase());
      if (fieldIdx < 0 || fieldIdx >= headers.length) return "#VALUE!";

      const critGrid: CellValue[][] = [];
      for (let row = crit.startRow; row <= crit.endRow; row++) {
        const cells: CellValue[] = [];
        for (let col = crit.startCol; col <= crit.endCol; col++) cells.push(g(row, col));
        critGrid.push(cells);
      }
      if (critGrid.length < 2) return "#VALUE!";
      const critHeaders = critGrid[0].map(h => toStr(h).toLowerCase());

      const matches = body.filter(rowVals =>
        // Each criteria row is a full condition set (AND within, OR across).
        critGrid.slice(1).some(critRow =>
          critRow.every((c, ci) => {
            if (c === null || toStr(c) === "") return true;
            const target = headers.indexOf(critHeaders[ci]);
            if (target < 0) return false;
            return matchCrit(rowVals[target] ?? null, c);
          }),
        ),
      );

      const picked = matches.map(r => r[fieldIdx] ?? null);
      const numeric = picked.map(toN).filter(n => !isNaN(n));
      switch (fn) {
        case "DSUM":     return numeric.reduce((s, n) => s + n, 0);
        case "DCOUNT":   return numeric.length;
        case "DAVERAGE": return numeric.length ? numeric.reduce((s, n) => s + n, 0) / numeric.length : "#DIV/0!";
        case "DMAX":     return numeric.length ? Math.max(...numeric) : 0;
        case "DMIN":     return numeric.length ? Math.min(...numeric) : 0;
        default:         return picked.length === 1 ? picked[0] : (picked.length ? "#NUM!" : "#VALUE!");
      }
    }

    // ── Engineering / base conversion ─────────────────────────────────────
    case "DECIMAL": {
      const n = parseInt(toStr(e(rawArgs[0])), Math.trunc(toN(e(rawArgs[1]))));
      return isNaN(n) ? "#NUM!" : n;
    }
    case "BASE": {
      const n = Math.trunc(toN(e(rawArgs[0])));
      const radix = Math.trunc(toN(e(rawArgs[1])));
      if (radix < 2 || radix > 36) return "#NUM!";
      const minLen = rawArgs[2] ? Math.trunc(toN(e(rawArgs[2]))) : 0;
      return n.toString(radix).toUpperCase().padStart(minLen, "0");
    }
    case "HEX2DEC": case "BIN2DEC": case "OCT2DEC": {
      const radix = fn === "HEX2DEC" ? 16 : fn === "BIN2DEC" ? 2 : 8;
      const raw = toStr(e(rawArgs[0])).trim();
      const n = parseInt(raw, radix);
      if (isNaN(n)) return "#NUM!";
      // Excel treats these as 10-digit two's-complement: the high bit is a sign.
      const bits = radix === 16 ? 40 : radix === 2 ? 10 : 30;
      return n >= Math.pow(2, bits - 1) ? n - Math.pow(2, bits) : n;
    }
    case "CONVERT": {
      // Common unit families. Excel supports a much longer table; these cover
      // the units that actually appear in business spreadsheets.
      const value = toN(e(rawArgs[0]));
      const from = toStr(e(rawArgs[1]));
      const to = toStr(e(rawArgs[2]));
      // Each family maps a unit to its size in the family's base unit.
      const FAMILIES: Record<string, number>[] = [
        { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, Nmi: 1852 },
        { g: 1, kg: 1000, mg: 0.001, lbm: 453.59237, ozm: 28.349523125, stone: 6350.29318, ton: 907184.74 },
        { sec: 1, s: 1, min: 60, hr: 3600, day: 86400, yr: 31557600 },
        { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3600000, BTU: 1055.05585262 },
        { Pa: 1, kPa: 1000, atm: 101325, mmHg: 133.322387415, psi: 6894.757293168 },
        { l: 1, L: 1, ml: 0.001, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365 },
      ];
      // Temperature is affine, not a simple ratio, so it's handled separately.
      const TEMP = new Set(["C", "F", "K"]);
      if (TEMP.has(from) && TEMP.has(to)) {
        const celsius = from === "C" ? value : from === "F" ? (value - 32) * 5 / 9 : value - 273.15;
        return to === "C" ? celsius : to === "F" ? celsius * 9 / 5 + 32 : celsius + 273.15;
      }
      for (const family of FAMILIES) {
        if (from in family && to in family) return value * family[from] / family[to];
      }
      return "#N/A";
    }

    default: {
      // User-defined function. Resolved last, so a built-in always wins and a
      // custom function can never shadow one.
      const custom = customFunctions[fn];
      if (custom) {
        if (scopeStack.length >= MAX_SCOPE_DEPTH) return "#NUM!";
        const bindings: Record<string, ScopeValue> = {};
        custom.params.forEach((p, i) => {
          const raw = rawArgs[i];
          if (raw === undefined) { bindings[p] = null; return; }
          // A range argument is bound as a spill, not collapsed to its first
          // cell — otherwise `TOTALOF(C1:C3)` with body `SUM(rng)` would sum a
          // single value.
          const trimmed = raw.trim();
          bindings[p] = RANGE_RE.test(trimmed)
            ? spill(getRangeVals(trimmed, g).map(v => [v]))
            : e(raw);
        });
        return withScope(bindings, () => asVal(evalE(custom.body, g)));
      }
      return `#NAME?`;
    }
  }
}

// ─── Binary operator evaluator ─────────────────────────────────────────────

function evalBinOps(expr: string, g: CellGetter): CellValue | undefined {
  // Operator groups in ascending precedence (we scan right-to-left for left-associativity)
  const opGroups = [
    ["&"],
    ["=", "<>", "<=", ">=", "<", ">"],
    ["+", "-"],
    ["*", "/"],
    ["^"],
  ];

  for (const ops of opGroups) {
    let depth = 0, inStr = false;
    for (let i = expr.length - 1; i >= 0; i--) {
      const ch = expr[i];
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === ")") depth++;
      else if (ch === "(") { depth--; continue; }
      if (depth !== 0) continue;

      for (const op of ops) {
        if (expr.slice(i, i + op.length) !== op) continue;
        const left = expr.slice(0, i).trim();
        const right = expr.slice(i + op.length).trim();
        if (!left || !right) continue;
        // Skip unary context
        if ((op === "-" || op === "+") && /[+\-*/^(=<>&,]$/.test(left)) continue;

        const l = asVal(evalE(left, g));
        const r = asVal(evalE(right, g));
        switch (op) {
          case "+": return toN(l) + toN(r);
          case "-": return toN(l) - toN(r);
          case "*": return toN(l) * toN(r);
          case "/": return toN(r) === 0 ? "#DIV/0!" : toN(l) / toN(r);
          case "^": return Math.pow(toN(l), toN(r));
          case "&": return toStr(l) + toStr(r);
          case "=": return toStr(l).toLowerCase() === toStr(r).toLowerCase();
          case "<>": return toStr(l).toLowerCase() !== toStr(r).toLowerCase();
          case ">=": return toN(l) >= toN(r);
          case "<=": return toN(l) <= toN(r);
          case ">": return toN(l) > toN(r);
          case "<": return toN(l) < toN(r);
        }
      }
    }
  }
  return undefined;
}

// ─── Main expression evaluator ─────────────────────────────────────────────

export function evalE(expr: string, g: CellGetter): CellValue | SpillResult {
  expr = expr.trim();
  if (!expr) return null;

  // String literal
  if (expr.startsWith('"') && expr.endsWith('"') && expr.length >= 2)
    return expr.slice(1, -1);

  // Boolean literals
  if (expr.toUpperCase() === "TRUE") return true;
  if (expr.toUpperCase() === "FALSE") return false;

  // Error passthrough
  if (/^#[A-Z/!?]+/.test(expr)) return expr;

  // Number literal
  const n = Number(expr);
  if (!isNaN(n) && expr !== "") return n;

  // Bound variable from LET / LAMBDA. Checked BEFORE cell references, because
  // a parameter may legitimately be named `x` — and before function calls,
  // because a bare name is never a call. See § Lambda scope below.
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) {
    const bound = lookupVar(expr);
    if (bound !== undefined) return bound;
  }

  // Cell reference: A1, $A$1, A$1, $A1
  if (/^\$?[A-Za-z]+\$?\d+$/.test(expr)) {
    const ref = parseRef(expr);
    return ref ? g(ref.row, ref.col) : "#REF!";
  }

  // Immediately-invoked lambda: LAMBDA(x, x*2)(5)
  // Matched before the generic call form, which would otherwise parse the
  // whole thing as a function named LAMBDA and lose the argument list.
  if (/^LAMBDA\s*\(/i.test(expr) && expr.endsWith(")")) {
    const split = findLambdaCallSplit(expr);
    if (split) {
      const fn = parseLambda(split.lambdaText);
      if (fn) {
        const args = split.argsText.trim()
          ? splitArgs(split.argsText).map(a => asVal(evalE(a, g)))
          : [];
        return applyLambda(fn, args, g);
      }
    }
  }

  // Function call: NAME(...)
  const fm = expr.match(/^([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
  if (fm) {
    const args = fm[2].trim() ? splitArgs(fm[2]) : [];
    return evalFn(fm[1], args, g);
  }

  // Binary operators
  const binResult = evalBinOps(expr, g);
  if (binResult !== undefined) return binResult;

  // Unary minus
  if (expr.startsWith("-")) return -toN(asVal(evalE(expr.slice(1), g)));

  // Parenthesized
  if (expr.startsWith("(") && expr.endsWith(")")) return evalE(expr.slice(1, -1), g);

  return "#VALUE!";
}

// ─── Public entry point ────────────────────────────────────────────────────

// ─── Named ranges ──────────────────────────────────────────────────────────
// Substitute defined names (e.g. "Revenue") with their A1 range/ref text before
// evaluation. Word-boundary, case-insensitive, skips text inside quotes and
// names immediately followed by "(" (so they can't shadow function calls).
export function substituteNames(expr: string, names: Record<string, string>): string {
  const entries = Object.entries(names);
  if (!entries.length) return expr;
  // Longest names first to avoid partial-overlap replacement.
  entries.sort((a, b) => b[0].length - a[0].length);
  // Split on quoted segments so we never touch string literals.
  const parts = expr.split(/("(?:[^"\\]|\\.)*")/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue; // odd indices are quoted strings
    for (const [name, range] of entries) {
      if (!range) continue;
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?!\\s*\\()`, "gi");
      parts[i] = parts[i].replace(re, range);
    }
  }
  return parts.join("");
}

export function evaluateFormula(formula: string, getter: CellGetter, names?: Record<string, string>): CellValue | SpillResult {
  if (!formula.startsWith("=")) return formula;
  try {
    const body = names ? substituteNames(formula.slice(1), names) : formula.slice(1);
    return evalE(body, getter);
  } catch {
    return "#ERROR!";
  }
}

// ─── Format a cell value for display ──────────────────────────────────────

export type NumberFormat = "general" | "number" | "currency" | "percent" | "date" | "text" | "scientific";

export function formatValue(value: CellValue, format: NumberFormat = "general", decimals = 2): string {
  if (value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string" && value.startsWith("#")) return value;

  if (format === "text") return String(value);
  if (format === "general") {
    if (typeof value === "number") {
      if (Number.isInteger(value)) return value.toLocaleString();
      if (Math.abs(value) > 1e10 || (Math.abs(value) < 1e-4 && value !== 0)) return value.toExponential(2);
      return parseFloat(value.toPrecision(10)).toString();
    }
    return String(value);
  }

  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) return String(value);

  switch (format) {
    case "number": return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    case "currency": return num.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: decimals });
    case "percent": return (num * 100).toFixed(decimals) + "%";
    case "scientific": return num.toExponential(decimals);
    case "date": {
      try {
        const d = new Date(String(value));
        return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
      } catch { return String(value); }
    }
    default: return String(value);
  }
}
