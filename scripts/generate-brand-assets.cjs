/*
 * Derives every Nexus favicon/app-icon/wordmark asset the app references from
 * three clean, pre-cut master files in `logos/` (already transparent — no
 * background removal needed):
 *   - nexus-mark-transparent.png              the icon glyph alone (square-ish)
 *   - nexus-lockup-horizontal-transparent.png icon + "NEXUS" wordmark, side by side
 *   - nexus-lockup-stacked-transparent.png    icon + "NEXUS" wordmark, stacked
 *
 * Run from the repo root: `node scripts/generate-brand-assets.cjs`
 * Re-run whenever the masters in logos/ are replaced with a new brand pass.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const LOGOS = path.join(ROOT, "logos");
const pub = (p) => path.join(ROOT, "public", p);

async function loadRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { buf: data, w: info.width, h: info.height };
}

function bbox({ buf, w, h }) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (buf[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("Empty image — no opaque pixels found.");
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function crop({ buf, w }, box) {
  const out = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const srcStart = ((box.y + y) * w + box.x) * 4;
    buf.copy(out, y * box.width * 4, srcStart, srcStart + box.width * 4);
  }
  return { buf: out, w: box.width, h: box.height };
}

/** Pad to a square canvas, content centered, transparent margin. */
function padSquare({ buf, w, h }, marginPct) {
  const size = Math.round(Math.max(w, h) * (1 + marginPct * 2));
  const out = Buffer.alloc(size * size * 4);
  const offX = Math.round((size - w) / 2), offY = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++) {
    const srcStart = y * w * 4;
    buf.copy(out, ((offY + y) * size + offX) * 4, srcStart, srcStart + w * 4);
  }
  return { buf: out, w: size, h: size };
}

/** Pad on all sides by a percentage of each dimension. */
function padRect({ buf, w, h }, marginPct) {
  const mx = Math.round(w * marginPct), my = Math.round(h * marginPct);
  const W = w + mx * 2, H = h + my * 2;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < h; y++) {
    const srcStart = y * w * 4;
    buf.copy(out, ((my + y) * W + mx) * 4, srcStart, srcStart + w * 4);
  }
  return { buf: out, w: W, h: H };
}

/** Column alpha-energy profile — used to find the icon/wordmark boundary in a horizontal lockup. */
function colProfile({ buf, w, h }) {
  const cols = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y < h; y++) sum += buf[(y * w + x) * 4 + 3];
    cols[x] = sum;
  }
  return cols;
}

/** Longest run of near-empty columns strictly inside the content — the gap between icon and wordmark. */
function longestGap(profile) {
  const peak = Math.max(...profile);
  const isEmpty = (v) => v < peak * 0.01;
  let bestStart = -1, bestLen = 0, runStart = -1;
  for (let i = 0; i <= profile.length; i++) {
    const empty = i < profile.length && isEmpty(profile[i]);
    if (empty) { if (runStart === -1) runStart = i; }
    else if (runStart !== -1) {
      const len = i - runStart;
      if (len > bestLen) { bestLen = len; bestStart = runStart; }
      runStart = -1;
    }
  }
  if (bestStart === -1) throw new Error("Could not find a gap between the icon and the wordmark.");
  return { start: bestStart, end: bestStart + bestLen };
}

/** Recolor everything from `fromCol` onward (the wordmark) to a light tone; icon columns are untouched. */
function recolorFrom({ buf, w, h }, fromCol, color) {
  const out = Buffer.from(buf);
  for (let y = 0; y < h; y++) {
    for (let x = fromCol; x < w; x++) {
      const i = (y * w + x) * 4;
      if (out[i + 3] === 0) continue;
      out[i] = color[0]; out[i + 1] = color[1]; out[i + 2] = color[2];
    }
  }
  return out;
}

function png({ buf, w, h }) {
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png();
}

/** Minimal PNG-in-ICO writer — ICONDIR + one ICONDIRENTRY per size, PNG payloads (Vista+, universally supported). */
function buildIco(pngBuffers, sizes) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngBuffers.length, 4);
  const entries = [];
  let offset = 6 + pngBuffers.length * 16;
  pngBuffers.forEach((buf, i) => {
    const sz = sizes[i];
    const e = Buffer.alloc(16);
    e.writeUInt8(sz >= 256 ? 0 : sz, 0); e.writeUInt8(sz >= 256 ? 0 : sz, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e); offset += buf.length;
  });
  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

async function main() {
  // ── Icon mark: tight-crop, then pad to a clean square ──────────────────
  const markRaw = await loadRaw(path.join(LOGOS, "nexus-mark-transparent.png"));
  const markSq = padSquare(crop(markRaw, bbox(markRaw)), 0.08);
  const markPng = await png(markSq).toBuffer();

  fs.mkdirSync(pub("icons"), { recursive: true });
  await sharp(markPng).resize(64, 64).toFile(pub("nexus.png"));
  await sharp(markPng).resize(64, 64).toFile(pub("nexus-64.png"));
  await sharp(markPng).resize(512, 512).toFile(pub("icon-512.png"));
  await sharp(markPng).resize(192, 192).toFile(pub("icon-192.png"));
  await sharp(markPng).resize(32, 32).toFile(pub("icon-32.png"));
  await sharp(markPng).resize(512, 512).toFile(pub("icons/icon-512.png"));
  await sharp(markPng).resize(512, 512).toFile(pub("icons/tray-icon.png"));

  const icoSizes = [16, 32, 48, 256];
  const icoPngs = [];
  for (const s of icoSizes) icoPngs.push(await sharp(markPng).resize(s, s).png().toBuffer());
  fs.writeFileSync(path.join(ROOT, "src/app/favicon.ico"), buildIco(icoPngs, icoSizes));

  // ── Horizontal wordmark lockup: light-bg (as supplied) + recolored dark-bg variant ──
  const lockupRaw = await loadRaw(path.join(LOGOS, "nexus-lockup-horizontal-transparent.png"));
  const lockupPadded = padRect(lockupRaw, 0.035);
  const gap = longestGap(colProfile(lockupRaw));
  const marginCols = Math.round(lockupRaw.w * 0.035);
  const wordmarkStart = gap.end + marginCols; // shift into the padded buffer's coordinate space
  const lockupLightBuf = recolorFrom(lockupPadded, wordmarkStart, [240, 242, 246]);

  const lockupW = 1200; // upscaled modestly from the 806px source for a bit of retina headroom
  const darkPipe = () => sharp(lockupPadded.buf, { raw: { width: lockupPadded.w, height: lockupPadded.h, channels: 4 } }).resize(lockupW, null).png();
  const lightPipe = () => sharp(lockupLightBuf, { raw: { width: lockupPadded.w, height: lockupPadded.h, channels: 4 } }).resize(lockupW, null).png();
  await darkPipe().toFile(pub("nexusLogo.png"));
  await darkPipe().toFile(pub("nexus-logo-2x.png"));
  await lightPipe().toFile(pub("nexusLogo-dark.png"));

  // ── OG / social share card (1200x630): stacked lockup on a soft brand canvas ──
  const OGW = 1200, OGH = 630;
  const stackedRaw = await loadRaw(path.join(LOGOS, "nexus-lockup-stacked-transparent.png"));
  const stackedPng = await png(padRect(stackedRaw, 0.02)).resize(760, null).png().toBuffer();
  const meta = await sharp(stackedPng).metadata();
  const glowSvg = Buffer.from(
    `<svg width="${OGW}" height="${OGH}" xmlns="http://www.w3.org/2000/svg">
       <defs><radialGradient id="g" cx="50%" cy="42%" r="55%">
         <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.16"/>
         <stop offset="100%" stop-color="#4f46e5" stop-opacity="0"/>
       </radialGradient></defs>
       <rect width="${OGW}" height="${OGH}" fill="#f0efec"/>
       <rect width="${OGW}" height="${OGH}" fill="url(#g)"/>
       <rect x="0" y="${OGH - 10}" width="${OGW}" height="10" fill="#4f46e5"/>
     </svg>`,
  );
  await sharp(glowSvg)
    .composite([{ input: stackedPng, left: Math.round((OGW - meta.width) / 2), top: Math.round((OGH - meta.height) / 2) - 14 }])
    .png()
    .toFile(pub("og-image.png"));

  console.log("Brand assets regenerated.", { markBox: bbox(markRaw), wordmarkGapCols: gap });
}

main().catch((e) => { console.error(e); process.exit(1); });
