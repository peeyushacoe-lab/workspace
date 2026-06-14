/**
 * Nexus Sheets — Formula Engine
 * Supports 50+ Excel/Google Sheets-compatible functions.
 */

export type CellValue = string | number | boolean | null;
export type CellGetter = (row: number, col: number) => CellValue;

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

function evalFn(name: string, rawArgs: string[], g: CellGetter): CellValue {
  const fn = name.toUpperCase();
  const e = (a: string) => evalE(a, g);
  const getVals = (a: string): CellValue[] => a.includes(":") ? getRangeVals(a.trim(), g) : [e(a)];
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
    case "TRANSPOSE": {
      const r = parseRange(rawArgs[0]); if (!r) return "#REF!";
      return g(r.startRow, r.startCol); // simplified — returns first cell
    }

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

    // ── Array-like ────────────────────────────────────────────────────────
    case "UNIQUE": {
      const vals = getRangeVals(rawArgs[0], g);
      return [...new Set(vals.map(toStr))].join(", ");
    }
    case "SORT": {
      const vals = getRangeVals(rawArgs[0], g);
      const asc = rawArgs[1] ? toN(e(rawArgs[1])) !== -1 : true;
      return [...vals].sort((a, b) => asc ? toStr(a).localeCompare(toStr(b)) : toStr(b).localeCompare(toStr(a))).join(", ");
    }

    default:
      return `#NAME?`;
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

        const l = evalE(left, g);
        const r = evalE(right, g);
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

export function evalE(expr: string, g: CellGetter): CellValue {
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

  // Cell reference: A1, $A$1, A$1, $A1
  if (/^\$?[A-Za-z]+\$?\d+$/.test(expr)) {
    const ref = parseRef(expr);
    return ref ? g(ref.row, ref.col) : "#REF!";
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
  if (expr.startsWith("-")) return -toN(evalE(expr.slice(1), g));

  // Parenthesized
  if (expr.startsWith("(") && expr.endsWith(")")) return evalE(expr.slice(1, -1), g);

  return "#VALUE!";
}

// ─── Public entry point ────────────────────────────────────────────────────

export function evaluateFormula(formula: string, getter: CellGetter): CellValue {
  if (!formula.startsWith("=")) return formula;
  try {
    return evalE(formula.slice(1), getter);
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
