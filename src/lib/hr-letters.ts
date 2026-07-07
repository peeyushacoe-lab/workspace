import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb, type RGB } from "pdf-lib";
import fs from "fs";
import path from "path";

/**
 * HR letter PDFs — onboarding, offboarding (resignation / termination) and NOC.
 * All letters use the Cybersage letterhead (white eagle logo on a navy badge).
 * Company name is "Cybersage" — never mention the Nexus workspace app in documents.
 */

// ─── palette ──────────────────────────────────────────────────────────────────
const NAVY = rgb(0.043, 0.165, 0.235); // #0B2A3C
const CYAN = rgb(0, 0.76, 1); // #00C2FF
const INK = rgb(0.102, 0.114, 0.137); // #1a1d23
const GREY = rgb(0.42, 0.447, 0.502); // #6b7280
const LIGHT = rgb(0.886, 0.91, 0.941); // #e2e8f0
const PANEL = rgb(0.957, 0.969, 0.976); // #f4f7f9
const AMBER_BG = rgb(1, 0.973, 0.929); // #fff8ed
const AMBER_BD = rgb(0.949, 0.851, 0.678); // #f2d9ad
const AMBER_TX = rgb(0.573, 0.251, 0.055); // #92400e
const GREEN_BG = rgb(0.925, 0.992, 0.961); // #ecfdf5
const GREEN_TX = rgb(0.016, 0.471, 0.341); // #047857

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 64;

// ─── shared plumbing ──────────────────────────────────────────────────────────

export interface LetterPerson {
  fullName: string;
  email: string;
  employeeId?: string | null;
  jobTitle?: string | null;
  department?: string | null;
}

/** Who signs the letter. The company stamp is always drawn and is not configurable. */
export interface LetterSignatory {
  name: string;
  title: string;
  /** Uploaded signature image (PNG or JPEG bytes) — drawn above the signature line. */
  signatureBytes?: Uint8Array | null;
  signatureMime?: string | null;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Generate a document reference like CS-ONB-2026-000142. */
export function makeRef(kind: "ONB" | "OFF" | "NOC"): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `CS-${kind}-${new Date().getFullYear()}-${n}`;
}

function loadLogoBytes(): Uint8Array | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "cybersage-logo.png"));
  } catch {
    return null;
  }
}

/** Word-wrap text to a max width; returns lines. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw a wrapped paragraph; returns the new y after the block. */
function paragraph(
  page: PDFPage,
  text: string,
  y: number,
  fonts: Fonts,
  opts: { size?: number; color?: RGB; bold?: boolean; leading?: number; x?: number; maxWidth?: number } = {},
): number {
  const size = opts.size ?? 10.5;
  const font = opts.bold ? fonts.bold : fonts.regular;
  const x = opts.x ?? MARGIN;
  const maxWidth = opts.maxWidth ?? A4[0] - MARGIN * 2;
  const leading = opts.leading ?? size * 1.55;
  for (const line of wrap(text, font, size, maxWidth)) {
    page.drawText(line, { x, y, size, font, color: opts.color ?? INK });
    y -= leading;
  }
  return y;
}

/** Letterhead: navy logo badge, company name, contact block, ref/date, rule. Returns content start y. */
async function drawLetterhead(
  doc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  ref: string,
  dateStr: string,
): Promise<number> {
  const [W, H] = A4;

  // top accent bar
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: NAVY });
  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 2, color: CYAN });

  let y = H - 46;

  // logo badge (white eagle needs a dark chip to be visible on paper)
  const logoBytes = loadLogoBytes();
  page.drawRectangle({ x: MARGIN, y: y - 34, width: 44, height: 44, color: NAVY });
  if (logoBytes) {
    try {
      const png = await doc.embedPng(logoBytes);
      page.drawImage(png, { x: MARGIN + 2, y: y - 32, width: 40, height: 40 });
    } catch {
      /* logo optional */
    }
  }

  page.drawText("CYBERSAGE", { x: MARGIN + 56, y: y - 8, size: 17, font: fonts.bold, color: NAVY });
  page.drawText("C Y B E R S E C U R I T Y", { x: MARGIN + 56, y: y - 22, size: 6.5, font: fonts.regular, color: GREY });

  // contact block (right aligned)
  const contact = ["Cybersage", "hr@cybersage.uk", "www.cybersage.uk"];
  let cy = y - 2;
  for (const line of contact) {
    const w = fonts.regular.widthOfTextAtSize(line, 8.5);
    page.drawText(line, { x: W - MARGIN - w, y: cy, size: 8.5, font: fonts.regular, color: GREY });
    cy -= 11.5;
  }

  y -= 52;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: W - MARGIN, y }, thickness: 1.6, color: NAVY });
  y -= 22;

  page.drawText(`Ref: ${ref}`, { x: MARGIN, y, size: 9, font: fonts.regular, color: GREY });
  const dateTxt = `Date: ${dateStr}`;
  const dw = fonts.regular.widthOfTextAtSize(dateTxt, 9);
  page.drawText(dateTxt, { x: W - MARGIN - dw, y, size: 9, font: fonts.regular, color: GREY });

  return y - 30;
}

function drawTitle(page: PDFPage, fonts: Fonts, title: string, y: number): number {
  const w = fonts.bold.widthOfTextAtSize(title, 13);
  const x = (A4[0] - w) / 2;
  page.drawText(title, { x, y, size: 13, font: fonts.bold, color: NAVY });
  page.drawLine({ start: { x, y: y - 4 }, end: { x: x + w, y: y - 4 }, thickness: 0.8, color: NAVY });
  return y - 30;
}

/** Key/value panel. */
function drawKV(page: PDFPage, fonts: Fonts, rows: [string, string][], y: number): number {
  const W = A4[0] - MARGIN * 2;
  const rowH = 16;
  const padY = 12;
  const h = rows.length * rowH + padY * 2 - 6;
  page.drawRectangle({ x: MARGIN, y: y - h, width: W, height: h, color: PANEL, borderColor: LIGHT, borderWidth: 1 });
  let ry = y - padY - 8;
  for (const [k, v] of rows) {
    page.drawText(k, { x: MARGIN + 16, y: ry, size: 9.5, font: fonts.regular, color: GREY });
    page.drawText(v, { x: MARGIN + 180, y: ry, size: 9.5, font: fonts.bold, color: INK });
    ry -= rowH;
  }
  return y - h - 18;
}

/** Amber confidentiality clause box. */
function drawClause(page: PDFPage, fonts: Fonts, heading: string, body: string, y: number): number {
  const W = A4[0] - MARGIN * 2;
  const size = 9.5;
  const lines = wrap(body, fonts.regular, size, W - 32);
  const h = 30 + lines.length * (size * 1.5);
  page.drawRectangle({ x: MARGIN, y: y - h, width: W, height: h, color: AMBER_BG, borderColor: AMBER_BD, borderWidth: 1 });
  page.drawRectangle({ x: MARGIN, y: y - h, width: 3.5, height: h, color: AMBER_TX });
  page.drawText(heading, { x: MARGIN + 16, y: y - 18, size: 8.5, font: fonts.bold, color: AMBER_TX });
  let ly = y - 34;
  for (const line of lines) {
    page.drawText(line, { x: MARGIN + 16, y: ly, size, font: fonts.regular, color: INK });
    ly -= size * 1.5;
  }
  return y - h - 18;
}

/** Signature block + footer. Draws the uploaded signature image (if any) above the left line. */
async function drawSignatures(
  doc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  signatory: LetterSignatory,
  right: { name: string; caption: string },
  ref: string,
  footerNote = "Cybersage — Confidential",
) {
  const W = A4[0];
  const colW = (W - MARGIN * 2 - 40) / 2;
  const y = 128;

  const blocks = [
    { name: signatory.name, caption: `${signatory.title} · Cybersage` },
    right,
  ];
  for (const [i, sig] of blocks.entries()) {
    const x = MARGIN + i * (colW + 40);
    page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 1.1, color: INK });
    page.drawText(sig.name, { x, y: y - 14, size: 10, font: fonts.bold, color: INK });
    page.drawText(sig.caption, { x, y: y - 27, size: 8.5, font: fonts.regular, color: GREY });
  }

  // uploaded signature image, sitting on the left line
  if (signatory.signatureBytes && signatory.signatureBytes.byteLength > 0) {
    try {
      const img = signatory.signatureMime === "image/jpeg"
        ? await doc.embedJpg(signatory.signatureBytes)
        : await doc.embedPng(signatory.signatureBytes);
      const maxH = 36;
      const maxW = colW - 20;
      const scale = Math.min(maxH / img.height, maxW / img.width, 1);
      page.drawImage(img, {
        x: MARGIN + 8,
        y: y + 3,
        width: img.width * scale,
        height: img.height * scale,
      });
    } catch {
      /* bad image — leave the line blank for a wet signature */
    }
  }

  // footer
  const fy = 52;
  page.drawLine({ start: { x: MARGIN, y: fy + 12 }, end: { x: W - MARGIN, y: fy + 12 }, thickness: 0.6, color: LIGHT });
  page.drawText(footerNote, { x: MARGIN, y: fy, size: 7.5, font: fonts.regular, color: GREY });
  const pn = `${ref} · page 1 of 1`;
  const pw = fonts.regular.widthOfTextAtSize(pn, 7.5);
  page.drawText(pn, { x: W - MARGIN - pw, y: fy, size: 7.5, font: fonts.regular, color: GREY });
}

/** Official company seal — ALWAYS drawn, hard-coded from public/cybersage-stamp.png. */
async function drawStamp(doc: PDFDocument, page: PDFPage, fonts: Fonts) {
  let bytes: Uint8Array | null = null;
  try {
    bytes = fs.readFileSync(path.join(process.cwd(), "public", "cybersage-stamp.png"));
  } catch {
    bytes = null;
  }
  if (bytes) {
    try {
      const img = await doc.embedPng(bytes);
      const size = 96;
      page.drawImage(img, {
        x: A4[0] - MARGIN - size - 14,
        y: 152,
        width: size,
        height: size,
        rotate: degrees(-12),
        opacity: 0.55,
      });
      return;
    } catch {
      /* fall through to vector fallback */
    }
  }
  // vector fallback if the stamp asset is missing
  const cx = A4[0] - MARGIN - 55;
  const cy = 205;
  const faint = rgb(0.55, 0.62, 0.68);
  page.drawEllipse({ x: cx, y: cy, xScale: 48, yScale: 48, borderColor: faint, borderWidth: 2, opacity: 0 });
  const t1 = "CYBER SAGE";
  const t2 = "OFFICIAL SEAL";
  const w1 = fonts.bold.widthOfTextAtSize(t1, 8);
  const w2 = fonts.regular.widthOfTextAtSize(t2, 6.5);
  page.drawText(t1, { x: cx - w1 / 2, y: cy + 2, size: 8, font: fonts.bold, color: faint });
  page.drawText(t2, { x: cx - w2 / 2, y: cy - 9, size: 6.5, font: fonts.regular, color: faint });
}

async function newLetter(): Promise<{ doc: PDFDocument; page: PDFPage; fonts: Fonts }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  return { doc, page, fonts };
}

function personLine(page: PDFPage, fonts: Fonts, person: LetterPerson, y: number): number {
  page.drawText(person.fullName, { x: MARGIN, y, size: 11, font: fonts.bold, color: INK });
  y -= 14;
  const meta = [person.employeeId ? `Employee ID: ${person.employeeId}` : null, person.email].filter(Boolean).join(" · ");
  page.drawText(meta, { x: MARGIN, y, size: 9, font: fonts.regular, color: GREY });
  return y - 24;
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────

export async function generateOnboardingLetter(o: {
  person: LetterPerson;
  ref: string;
  joiningDate?: Date;
  reportingManager?: string | null;
  signatory: LetterSignatory;
}): Promise<Uint8Array> {
  const { doc, page, fonts } = await newLetter();
  const today = new Date();
  let y = await drawLetterhead(doc, page, fonts, o.ref, fmtDate(today));
  y = drawTitle(page, fonts, "LETTER OF ONBOARDING & APPOINTMENT", y);
  y = personLine(page, fonts, o.person, y);

  y = paragraph(page, `Dear ${o.person.fullName.split(" ")[0]},`, y, fonts);
  y -= 4;
  y = paragraph(
    page,
    "We are pleased to welcome you to Cybersage. This letter confirms your appointment on the terms summarised below and marks the start of your onboarding with the company.",
    y,
    fonts,
  );
  y -= 6;

  y = drawKV(page, fonts, [
    ["Position", o.person.jobTitle || "As per employment contract"],
    ["Department", o.person.department || "—"],
    ["Date of joining", fmtDate(o.joiningDate ?? today)],
    ["Reporting manager", o.reportingManager || "—"],
    ["Work email", o.person.email],
  ], y);

  y = drawClause(
    page,
    fonts,
    "CONFIDENTIALITY & ACCEPTABLE USE",
    "By signing this letter you agree that all product source code, security research, client data, credentials and internal communications are strictly confidential, must not be disclosed during or after your employment, and remain the sole property of Cybersage.",
    y,
  );

  paragraph(
    page,
    "Please sign below and return this letter via the company HR portal (My HR) within 7 days. Your onboarding checklist (accounts, MFA, policies) has been assigned to you and is visible on the same page.",
    y,
    fonts,
  );

  await drawStamp(doc, page, fonts);
  await drawSignatures(
    doc,
    page,
    fonts,
    o.signatory,
    { name: o.person.fullName, caption: "Employee signature & date" },
    o.ref,
  );

  return doc.save();
}

// ─── OFFBOARDING (resignation / termination) ─────────────────────────────────

export async function generateOffboardingLetter(o: {
  person: LetterPerson;
  ref: string;
  type: "RESIGNATION" | "TERMINATION";
  lastWorkingDay: Date;
  reason?: string | null;
  handoverOwner?: string | null;
  signatory: LetterSignatory;
}): Promise<Uint8Array> {
  const { doc, page, fonts } = await newLetter();
  const today = new Date();
  const isResign = o.type === "RESIGNATION";

  let y = await drawLetterhead(doc, page, fonts, o.ref, fmtDate(today));
  y = drawTitle(page, fonts, isResign ? "ACCEPTANCE OF RESIGNATION & EXIT TERMS" : "NOTICE OF TERMINATION OF EMPLOYMENT", y);
  y = personLine(page, fonts, o.person, y);

  y = paragraph(page, `Dear ${o.person.fullName.split(" ")[0]},`, y, fonts);
  y -= 4;
  y = paragraph(
    page,
    isResign
      ? "This letter confirms that Cybersage has accepted your resignation and records the terms of your exit:"
      : "This letter serves as formal notice that your employment with Cybersage is terminated with effect from the date below:",
    y,
    fonts,
  );
  y -= 6;

  const kv: [string, string][] = [
    ["Exit type", isResign ? "Resignation (voluntary)" : "Termination (company-initiated)"],
    [isResign ? "Resignation accepted on" : "Notice issued on", fmtDate(today)],
    ["Last working day", fmtDate(o.lastWorkingDay)],
  ];
  if (isResign && o.handoverOwner) kv.push(["Handover owner", o.handoverOwner]);
  if (!isResign && o.reason) kv.push(["Reason on record", o.reason]);
  y = drawKV(page, fonts, kv, y);

  y = paragraph(
    page,
    isResign
      ? "Before your last working day you must complete the offboarding checklist on the company HR portal (My HR): hand over work in progress, return company equipment, and surrender access credentials."
      : "All system access will be revoked on your last working day. You must return all company equipment and complete the mandatory offboarding checklist before your exit is closed.",
    y,
    fonts,
  );
  y -= 6;

  y = drawClause(
    page,
    fonts,
    isResign ? "CONTINUING CONFIDENTIALITY OBLIGATION" : "BINDING CONFIDENTIALITY NOTICE",
    isResign
      ? "You acknowledge that your confidentiality obligations survive the end of your employment. You must not disclose, use or retain any product details, source code, security research, client information or internal data of Cybersage after your exit."
      : "You remain legally bound by your confidentiality undertakings. Any disclosure, retention or use of Cybersage product details, source code, security research, client data or internal information after termination will result in legal action.",
    y,
  );

  paragraph(
    page,
    isResign
      ? "Please sign and return this letter via the company HR portal (My HR). Your No Objection Certificate (NOC) will be issued once the signed copy is received and your checklist is cleared."
      : "Sign and return this letter via the company HR portal (My HR) to acknowledge receipt. Your No Objection Certificate (NOC) will be issued only after the signed copy is received and exit formalities are complete.",
    y,
    fonts,
  );

  await drawStamp(doc, page, fonts);
  await drawSignatures(
    doc,
    page,
    fonts,
    o.signatory,
    { name: o.person.fullName, caption: "Employee signature & date" },
    o.ref,
  );

  return doc.save();
}

// ─── NOC ──────────────────────────────────────────────────────────────────────

export async function generateNocLetter(o: {
  person: LetterPerson;
  ref: string;
  type: "RESIGNATION" | "TERMINATION";
  joinDate?: Date | null;
  exitDate: Date;
  signedReturnedAt?: Date | null;
  confidentialityAckAt?: Date | null;
  signatory: LetterSignatory;
}): Promise<Uint8Array> {
  const { doc, page, fonts } = await newLetter();
  const today = new Date();
  const isResign = o.type === "RESIGNATION";

  let y = await drawLetterhead(doc, page, fonts, o.ref, fmtDate(today));

  // "exit cleared" badge
  const badge = "EXIT CLEARED — NO DUES";
  const bw = fonts.bold.widthOfTextAtSize(badge, 8.5) + 28;
  const bx = (A4[0] - bw) / 2;
  page.drawRectangle({ x: bx, y: y - 6, width: bw, height: 18, color: GREEN_BG, borderColor: rgb(0.655, 0.953, 0.816), borderWidth: 1 });
  page.drawText(badge, { x: bx + 14, y: y - 1, size: 8.5, font: fonts.bold, color: GREEN_TX });
  y -= 30;

  y = drawTitle(page, fonts, "NO OBJECTION CERTIFICATE", y);

  y = paragraph(page, "TO WHOM IT MAY CONCERN,", y, fonts, { bold: true });
  y -= 4;

  const employment = [
    `This is to certify that ${o.person.fullName}`,
    o.person.employeeId ? `(Employee ID: ${o.person.employeeId})` : null,
    `was employed with Cybersage`,
    o.person.jobTitle ? `as ${o.person.jobTitle}` : null,
    o.joinDate ? `from ${fmtDate(o.joinDate)}` : null,
    `until ${fmtDate(o.exitDate)}, and is no longer associated with the company in any capacity with effect from ${fmtDate(o.exitDate)}.`,
  ].filter(Boolean).join(" ");
  y = paragraph(page, employment, y, fonts);
  y -= 6;

  y = drawKV(page, fonts, [
    ["Exit type", isResign ? "Resignation (voluntary)" : "Termination (company-initiated)"],
    ["Signed exit letter received", o.signedReturnedAt ? `${fmtDate(o.signedReturnedAt)}  ✓` : "Verified by People Operations  ✓"],
    ["Offboarding checklist", "Cleared — equipment & access returned  ✓"],
    ["Dues", "None outstanding"],
  ], y);

  y = paragraph(
    page,
    "The company has no objection to the above-named individual taking up employment or engagement elsewhere.",
    y,
    fonts,
  );
  y -= 6;

  const ackLine = o.confidentialityAckAt
    ? ` Acknowledged electronically via the company HR portal on ${fmtDate(o.confidentialityAckAt)}.`
    : " Acknowledged in the signed exit letter.";
  drawClause(
    page,
    fonts,
    "CONFIDENTIALITY DECLARATION (ACKNOWLEDGED BY EMPLOYEE)",
    "The employee has acknowledged in writing that they shall not leak, disclose, use or retain any product details, source code, security research, client information or internal data belonging to Cybersage, and that this obligation continues indefinitely after exit." + ackLine,
    y,
  );

  await drawStamp(doc, page, fonts);
  await drawSignatures(
    doc,
    page,
    fonts,
    o.signatory,
    { name: "Verification", caption: `Verify via hr@cybersage.uk · ${o.ref}` },
    o.ref,
    "Cybersage",
  );

  return doc.save();
}
