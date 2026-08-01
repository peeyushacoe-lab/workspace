import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { resolveDocAccess } from "@/lib/doc-access";
import { evaluateFormula, parseRange, indexToCol } from "@/lib/sheets/formula";
import type { CellValue } from "@/lib/sheets/formula";

type Params = { params: Promise<{ id: string }> };

/**
 * Reads a computed cell range out of a spreadsheet, for embedding elsewhere.
 *
 * This is the backbone of cross-app linking: a Doc or a Slide holds a reference
 * to `{ sheetId, sheet, range }` and refetches through here, so the embedded
 * table reflects the live spreadsheet rather than a copy that silently rots.
 *
 * Formulas are evaluated server-side with the same engine the grid uses, so an
 * embedded range shows values, not `=SUM(...)`.
 *
 * Access is resolved against the SPREADSHEET, not the embedding document —
 * otherwise sharing a doc would leak the contents of a sheet the recipient
 * cannot open.
 */

type StoredSheet = {
  id: string;
  name: string;
  cells?: Record<string, { v?: string; f?: string } | undefined>;
};

/** GET ?sheet=<tabId|name>&range=A1:C10 */
export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.kind !== "sheet") {
    return NextResponse.json({ error: "Not a spreadsheet" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const rangeRef = (searchParams.get("range") ?? "").trim().toUpperCase();
  const sheetKey = searchParams.get("sheet") ?? "";

  const parsed = parseRange(rangeRef);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid range — use A1:C10 form" }, { status: 400 });
  }
  // A runaway range would serialise the whole workbook into a document.
  const cellCount =
    (parsed.endRow - parsed.startRow + 1) * (parsed.endCol - parsed.startCol + 1);
  if (cellCount > 5_000) {
    return NextResponse.json({ error: "Range is too large (max 5000 cells)" }, { status: 400 });
  }

  let workbook: { sheets?: StoredSheet[] };
  try {
    workbook = JSON.parse(doc.content) as { sheets?: StoredSheet[] };
  } catch {
    return NextResponse.json({ error: "Spreadsheet could not be read" }, { status: 500 });
  }

  const sheets = workbook.sheets ?? [];
  const sheet =
    sheets.find(s => s.id === sheetKey) ??
    sheets.find(s => s.name?.toLowerCase() === sheetKey.toLowerCase()) ??
    sheets[0];
  if (!sheet) return NextResponse.json({ error: "Sheet tab not found" }, { status: 404 });

  const cells = sheet.cells ?? {};
  const raw = (r: number, c: number): CellValue => {
    const cell = cells[`${r}:${c}`];
    if (!cell) return null;
    return cell.f ? cell.f : (cell.v ?? null);
  };

  // Same getter contract the grid uses, so formulas resolve identically.
  const getter = (r: number, c: number): CellValue => {
    const v = raw(r, c);
    if (typeof v === "string" && v.startsWith("=")) {
      const out = evaluateFormula(v, getter);
      return typeof out === "object" && out !== null ? "" : out;
    }
    return v;
  };

  const rows: CellValue[][] = [];
  for (let r = parsed.startRow; r <= parsed.endRow; r++) {
    const row: CellValue[] = [];
    for (let c = parsed.startCol; c <= parsed.endCol; c++) row.push(getter(r, c));
    rows.push(row);
  }

  return NextResponse.json({
    sheetId: id,
    sheetTabId: sheet.id,
    sheetName: sheet.name,
    range: rangeRef,
    columns: Array.from(
      { length: parsed.endCol - parsed.startCol + 1 },
      (_, i) => indexToCol(parsed.startCol + i),
    ),
    rows,
    fetchedAt: new Date().toISOString(),
  });
}
