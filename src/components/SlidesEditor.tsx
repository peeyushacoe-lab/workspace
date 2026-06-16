/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * Nexus Slides — Google Slides + PowerPoint competitor
 * Features: themes, templates, drag-and-drop canvas, text/shape/image/chart/table/code,
 * layer ordering, alignment, presenter mode, speaker notes, AI generation, export, share
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus, Trash2, Download, Upload, X, Loader2, Share2, Copy,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  ChevronUp, ChevronDown, Type, Square, Circle,   BarChart3, Table, Code2, Image as ImageIcon,   Play, ChevronLeft, ChevronRight, FileText,
  Sparkles, Layers, Grid3x3, LayoutGrid,   Undo2, Redo2, ZoomIn, ZoomOut,
  LayoutTemplate, Eye, EyeOff, FolderPlus, ChevronRight as ChevronRightIcon, Images,
  Triangle, Star, MoveRight, Minus, Grid, Timer, RotateCcw,
  Search, Replace, Video, Hash, Lock, Unlock, Music, Volume2, Printer,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell as PieCell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { DocShareModal } from "./DocShareModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type ElementStyle = {
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  bg?: string;
  bg2?: string;
  gradient?: boolean;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  shadow?: boolean;
  rotation?: number;
};

const VALIGN_JUSTIFY: Record<string, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };

// SmartArt (v1): preset diagrams built from shape + text element groups.
type SmartArtKind = "list" | "process" | "cycle" | "hierarchy";
function buildSmartArt(kind: SmartArtKind, acc: string, textColor: string): Omit<SlideElement, "id">[] {
  const box = (x: number, y: number, w: number, h: number, label: string): Omit<SlideElement, "id">[] => ([
    { type: "shape", x, y, w, h, shapeType: "rect", style: { bg: acc + "22", borderColor: acc, borderWidth: 2, borderRadius: 12 } },
    { type: "text", x: x + 8, y, w: w - 16, h, content: label, style: { fontSize: 18, color: textColor, align: "center", valign: "middle" } },
  ]);
  const out: Omit<SlideElement, "id">[] = [];
  if (kind === "list") {
    for (let i = 0; i < 4; i++) out.push(...box(200, 70 + i * 105, 560, 80, "Item " + (i + 1)));
  } else if (kind === "process") {
    const w = 200, gap = 28; let x = 50;
    for (let i = 0; i < 4; i++) { out.push(...box(x, 230, w, 110, "Step " + (i + 1))); if (i < 3) out.push({ type: "text", x: x + w, y: 230, w: gap, h: 110, content: "›", style: { fontSize: 30, color: acc, align: "center", valign: "middle" } }); x += w + gap; }
  } else if (kind === "cycle") {
    const pos = [[380, 70], [700, 225], [380, 380], [140, 225]];
    pos.forEach((p, i) => out.push(...box(p[0], p[1], 200, 90, "Phase " + (i + 1))));
  } else {
    out.push(...box(380, 70, 200, 90, "Top"));
    for (let i = 0; i < 3; i++) out.push(...box(140 + i * 240, 290, 200, 90, "Child " + (i + 1)));
  }
  return out;
}

type SlideElement = {
  id: string;
  type: "text" | "shape" | "image" | "chart" | "table" | "code" | "video" | "audio";
  x: number; y: number; w: number; h: number;
  content?: string;
  src?: string;
  shapeType?: "rect" | "circle" | "triangle" | "arrow" | "star" | "line";
  chartType?: "bar" | "line" | "pie";
  chartData?: { name: string; value: number }[];
  tableRows?: string[][];
  style?: ElementStyle;
  locked?: boolean;
  zIndex?: number;
  animIn?: "none" | "fade" | "slide-left" | "slide-right" | "slide-up" | "zoom" | "wipe" | "bounce";
};

type Slide = {
  id: string;
  background: string;
  backgroundImage?: string;
  elements: SlideElement[];
  notes: string;
  transition?: "none" | "fade" | "slide" | "zoom" | "cover" | "morph";
  section?: string;
  hidden?: boolean;
};

// ─── Layout presets (Feature 1) ─────────────────────────────────────────────
// Each returns a fresh set of elements (without ids) arranged in CANVAS coords.
const LAYOUT_PRESETS: { name: string; build: () => Omit<SlideElement, "id">[] }[] = [
  {
    name: "Title",
    build: () => [
      { type: "text", x: 80, y: 200, w: 800, h: 80, content: "Presentation Title", style: { fontSize: 48, bold: true, align: "center", color: "#202124" } },
      { type: "text", x: 200, y: 300, w: 560, h: 40, content: "Subtitle or presenter name", style: { fontSize: 22, align: "center", color: "#5f6368" } },
    ],
  },
  {
    name: "Title + Content",
    build: () => [
      { type: "text", x: 48, y: 40, w: 864, h: 60, content: "Slide Title", style: { fontSize: 34, bold: true, color: "#202124" } },
      { type: "text", x: 48, y: 120, w: 864, h: 360, content: "• Add your first bullet point\n• Second key idea\n• Supporting detail", style: { fontSize: 20, color: "#5f6368" } },
    ],
  },
  {
    name: "Two Content",
    build: () => [
      { type: "text", x: 48, y: 40, w: 864, h: 60, content: "Slide Title", style: { fontSize: 34, bold: true, color: "#202124" } },
      { type: "text", x: 48, y: 120, w: 420, h: 360, content: "• Left column point\n• Another idea\n• Detail", style: { fontSize: 20, color: "#5f6368" } },
      { type: "text", x: 492, y: 120, w: 420, h: 360, content: "• Right column point\n• Another idea\n• Detail", style: { fontSize: 20, color: "#5f6368" } },
    ],
  },
  {
    name: "Section Header",
    build: () => [
      { type: "text", x: 64, y: 220, w: 832, h: 80, content: "Section Title", style: { fontSize: 44, bold: true, align: "left", color: "#202124" } },
      { type: "text", x: 64, y: 312, w: 832, h: 40, content: "Brief description of this section", style: { fontSize: 22, align: "left", color: "#5f6368" } },
    ],
  },
  {
    name: "Blank",
    build: () => [],
  },
];

// animIn value → CSS keyframe name (see globals.css)
const ANIM_KEYFRAME: Record<string, string> = {
  fade: "nx-fade", "slide-left": "nx-fly-left", "slide-right": "nx-fly-right",
  "slide-up": "nx-fly-up", zoom: "nx-zoom", wipe: "nx-wipe", bounce: "nx-bounce",
};
const ANIM_LABELS: { value: NonNullable<SlideElement["animIn"]>; label: string }[] = [
  { value: "none", label: "None" }, { value: "fade", label: "Fade in" },
  { value: "slide-left", label: "Fly in ←" }, { value: "slide-right", label: "Fly in →" },
  { value: "slide-up", label: "Fly in ↑" }, { value: "zoom", label: "Zoom in" },
  { value: "wipe", label: "Wipe" }, { value: "bounce", label: "Bounce" },
];
// slide transition → CSS keyframe name
const TRANSITION_KEYFRAME: Record<string, string> = {
  fade: "nx-slide-fade", slide: "nx-slide-push", zoom: "nx-slide-zoom",
  cover: "nx-slide-cover", morph: "nx-slide-morph",
};

type Theme = {
  id: string;
  name: string;
  bg: string;
  accent: string;
  text: string;
  secondary: string;
};

const THEMES: Theme[] = [
  { id: "light",    name: "Clean Light", bg: "#ffffff", accent: "#1a56db", text: "#202124", secondary: "#5f6368" },
  { id: "dark",     name: "Dark Pro",    bg: "#1a1a2e", accent: "#6c63ff", text: "#e0e0e0", secondary: "#9a9ab0" },
  { id: "blue",     name: "Ocean Blue",  bg: "#0f3460", accent: "#e94560", text: "#ffffff", secondary: "#a8dadc" },
  { id: "minimal",  name: "Minimal",     bg: "#fafafa", accent: "#000000", text: "#111111", secondary: "#666666" },
  { id: "gradient", name: "Gradient",    bg: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)", accent: "#ffde59", text: "#ffffff", secondary: "#e0e0e0" },
  { id: "forest",   name: "Forest",      bg: "#2d6a4f", accent: "#95d5b2", text: "#ffffff", secondary: "#b7e4c7" },
];

const SLIDE_TEMPLATES: { name: string; elements: Omit<SlideElement, "id">[] }[] = [
  {
    name: "Title slide",
    elements: [
      { type: "text", x: 80, y: 180, w: 800, h: 80, content: "Presentation Title", style: { fontSize: 48, bold: true, align: "center", color: "#202124" } },
      { type: "text", x: 200, y: 290, w: 560, h: 40, content: "Subtitle or presenter name", style: { fontSize: 22, align: "center", color: "#5f6368" } },
    ],
  },
  {
    name: "Title + content",
    elements: [
      { type: "text", x: 48, y: 40, w: 864, h: 60, content: "Slide Title", style: { fontSize: 34, bold: true, color: "#202124" } },
      { type: "text", x: 48, y: 120, w: 864, h: 360, content: "• Add your first bullet point\n• Second key idea\n• Supporting detail", style: { fontSize: 20, color: "#5f6368" } },
    ],
  },
  {
    name: "Two columns",
    elements: [
      { type: "text", x: 48, y: 40, w: 864, h: 60, content: "Comparison Slide", style: { fontSize: 34, bold: true, color: "#202124" } },
      { type: "shape", x: 48, y: 120, w: 416, h: 360, shapeType: "rect", style: { bg: "#f8f9fa", borderColor: "#e8eaed", borderWidth: 1 } },
      { type: "shape", x: 496, y: 120, w: 416, h: 360, shapeType: "rect", style: { bg: "#f8f9fa", borderColor: "#e8eaed", borderWidth: 1 } },
      { type: "text", x: 68, y: 140, w: 376, h: 320, content: "Column A\n\n• Point 1\n• Point 2\n• Point 3", style: { fontSize: 16, color: "#202124" } },
      { type: "text", x: 516, y: 140, w: 376, h: 320, content: "Column B\n\n• Point 1\n• Point 2\n• Point 3", style: { fontSize: 16, color: "#202124" } },
    ],
  },
  {
    name: "Image + text",
    elements: [
      { type: "text", x: 48, y: 40, w: 864, h: 60, content: "Slide Title", style: { fontSize: 34, bold: true, color: "#202124" } },
      { type: "shape", x: 48, y: 120, w: 440, h: 360, shapeType: "rect", style: { bg: "#e8f0fe", borderColor: "#1a56db", borderWidth: 1 } },
      { type: "text", x: 520, y: 140, w: 392, h: 320, content: "Key Points\n\n• Add supporting text here\n• Another key message\n• Important insight", style: { fontSize: 18, color: "#202124" } },
    ],
  },
];

const CANVAS_W = 960;
const CANVAS_H = 540;

// ─── Collab hook ──────────────────────────────────────────────────────────────

function useSlidesCollab(presId: string | null, onRemote: (data: unknown) => void) {
  const [collaborators, setCollaborators] = useState<{ userId: string; name: string }[]>([]);
  useEffect(() => {
    if (!presId) return;
    const es = new EventSource(`/api/slides/${presId}/collab`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; userId?: string; name?: string; data?: unknown };
        if (msg.type === "SLIDE_UPDATE" && msg.data) onRemote(msg.data);
        else if (msg.type === "PRESENCE" && msg.userId) {
          setCollaborators(prev => [...prev.filter(c => c.userId !== msg.userId!), { userId: msg.userId!, name: msg.name ?? "User" }]);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [presId, onRemote]);
  return { collaborators };
}

// ─── PPTX import/export helpers ───────────────────────────────────────────────

async function exportPPTX(slides: Slide[], title: string) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  for (const slide of slides) {
    const s = pptx.addSlide();
    if (!slide.background.includes("gradient")) s.background = { color: slide.background.replace("#", "") };
    for (const el of slide.elements) {
      const pctX = el.x / CANVAS_W, pctY = el.y / CANVAS_H;
      const pctW = el.w / CANVAS_W, pctH = el.h / CANVAS_H;
      const pW = pctW * 10, pH = pctH * 5.625, pX = pctX * 10, pY = pctY * 5.625;
      if (el.type === "text") {
        s.addText(el.content ?? "", { x: pX, y: pY, w: pW, h: pH, fontSize: el.style?.fontSize ?? 18, bold: el.style?.bold, italic: el.style?.italic, color: (el.style?.color ?? "#202124").replace("#", ""), align: el.style?.align ?? "left" });
      } else if (el.type === "shape") {
        s.addShape(pptx.ShapeType.rect, { x: pX, y: pY, w: pW, h: pH, fill: { color: (el.style?.bg ?? "#e8eaed").replace("#", "") } });
      } else if (el.type === "image" && el.src) {
        s.addImage({ path: el.src, x: pX, y: pY, w: pW, h: pH });
      }
    }
    if (slide.notes) s.addNotes(slide.notes);
  }
  await pptx.writeFile({ fileName: `${title}.pptx` });
}

// ─── Slide canvas element ─────────────────────────────────────────────────────

function _SlideCanvas({ slide, selected, onSelect, theme, zoom = 1 }: {
  slide: Slide; selected: boolean; onSelect: () => void; theme: Theme; zoom?: number;
}) {
  const isGradient = slide.background.includes("gradient");
  return (
    <div
      className={`relative flex-shrink-0 cursor-pointer border-2 rounded overflow-hidden transition-all ${selected ? "border-[#1a56db] shadow-md" : "border-transparent hover:border-[#d0d5dd]"}`}
      style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, background: isGradient ? slide.background : slide.background }}
      onClick={onSelect}
    >
      {slide.elements.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(el => (
        <SlideElementView key={el.id} el={el} zoom={zoom} theme={theme} />
      ))}
    </div>
  );
}

// Convert a YouTube / Vimeo watch URL into an embeddable iframe URL.
// Returns null if the URL isn't a recognised embeddable provider.
function videoEmbedUrl(raw: string): string | null {
  if (!raw) return null;
  const url = raw.trim();
  // YouTube — youtu.be/ID, youtube.com/watch?v=ID, youtube.com/embed/ID
  const ytShort = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (ytShort) return "https://www.youtube.com/embed/" + ytShort[1];
  const ytWatch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (ytWatch && /youtube\.com/.test(url)) return "https://www.youtube.com/embed/" + ytWatch[1];
  const ytEmbed = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (ytEmbed) return "https://www.youtube.com/embed/" + ytEmbed[1];
  // Vimeo — vimeo.com/ID
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d{4,})/);
  if (vimeo) return "https://player.vimeo.com/video/" + vimeo[1];
  return null;
}

function SlideElementView({ el, zoom, theme, anim, animDelay = 0, editMode = false }: { el: SlideElement; zoom: number; theme: Theme; anim?: boolean; animDelay?: number; editMode?: boolean }) {
  const s = el.style ?? {};
  const kf = anim && el.animIn && el.animIn !== "none" ? ANIM_KEYFRAME[el.animIn] : null;
  const base: React.CSSProperties = {
    position: "absolute",
    left: el.x * zoom, top: el.y * zoom,
    width: el.w * zoom, height: el.h * zoom,
    opacity: s.opacity ?? 1,
    zIndex: el.zIndex ?? 1,
    ...(s.rotation ? { transform: "rotate(" + s.rotation + "deg)" } : {}),
    ...(kf ? { animation: `${kf} 0.6s ease both`, animationDelay: `${animDelay}ms` } : {}),
  };

  if (el.type === "text") {
    return (
      <div style={{ ...base, display: "flex", flexDirection: "column", justifyContent: VALIGN_JUSTIFY[s.valign ?? "top"], fontSize: (s.fontSize ?? 18) * zoom, fontWeight: s.bold ? "bold" : "normal", fontStyle: s.italic ? "italic" : "normal", textDecoration: s.underline ? "underline" : "none", color: s.color ?? theme.text, textAlign: s.align ?? "left", whiteSpace: "pre-wrap", lineHeight: 1.4, overflow: "hidden" }}>
        {el.content}
      </div>
    );
  }
  if (el.type === "shape") {
    const solid = s.bg ?? theme.secondary + "40";
    const fill = s.gradient && s.bg2
      ? "linear-gradient(135deg, " + (s.bg ?? theme.secondary) + ", " + s.bg2 + ")"
      : solid;
    const stroke = s.borderColor ?? "transparent";
    const strokeW = s.borderWidth ?? 0;
    const st = el.shapeType ?? "rect";
    // Line: a thin coloured bar spanning the element's width, vertically centred.
    if (st === "line") {
      const lineColor = s.borderColor ?? s.bg ?? theme.secondary;
      const thickness = Math.max(2, strokeW || 3) * zoom;
      return (
        <div style={{ ...base, display: "flex", alignItems: "center" }}>
          <div style={{ width: "100%", height: thickness, background: lineColor, borderRadius: thickness }} />
        </div>
      );
    }
    // Triangle / arrow / star via CSS clip-path polygons.
    const clip =
      st === "triangle" ? "polygon(50% 0%, 0% 100%, 100% 100%)"
      : st === "arrow" ? "polygon(0% 30%, 60% 30%, 60% 10%, 100% 50%, 60% 90%, 60% 70%, 0% 70%)"
      : st === "star" ? "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)"
      : null;
    if (clip) {
      return <div style={{ ...base, background: fill, clipPath: clip, WebkitClipPath: clip }} />;
    }
    // rect / circle
    const shapeStyle: React.CSSProperties = { ...base, background: fill, border: strokeW + "px solid " + stroke, borderRadius: st === "circle" ? "50%" : s.borderRadius ?? 0 };
    return <div style={shapeStyle} />;
  }
  if (el.type === "image" && el.src) {
    return <img src={el.src} alt="" style={{ ...base, objectFit: "cover" }} />;
  }
  if (el.type === "chart" && el.chartData) {
    const data = el.chartData;
    return (
      <div style={base}>
        <ResponsiveContainer width="100%" height="100%">
          {el.chartType === "pie" ? (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={el.h * zoom * 0.4}>
                {data.map((_, i) => <PieCell key={i} fill={["#1a56db","#0f9d58","#f4b400","#ea4335"][i % 4]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          ) : el.chartType === "line" ? (
            <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 * zoom }} /><YAxis tick={{ fontSize: 10 * zoom }} /><Tooltip /><Line type="monotone" dataKey="value" stroke={theme.accent} dot={false} /></LineChart>
          ) : (
            <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 * zoom }} /><YAxis tick={{ fontSize: 10 * zoom }} /><Tooltip /><Bar dataKey="value" fill={theme.accent} /></BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }
  if (el.type === "table" && el.tableRows) {
    return (
      <div style={{ ...base, overflow: "hidden" }}>
        <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", fontSize: (s.fontSize ?? 14) * zoom }}>
          {el.tableRows.map((row, ri) => (
            <tr key={ri} style={{ background: ri === 0 ? (s.bg ?? theme.accent) : "transparent" }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ border: `1px solid ${s.borderColor ?? "#e8eaed"}`, padding: 4 * zoom, color: ri === 0 ? "#fff" : (s.color ?? theme.text), fontWeight: ri === 0 ? "bold" : "normal" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </table>
      </div>
    );
  }
  if (el.type === "code") {
    return (
      <div style={{ ...base, background: "#1e1e2e", color: "#cdd6f4", fontFamily: "monospace", fontSize: (s.fontSize ?? 13) * zoom, padding: 12 * zoom, borderRadius: 6 * zoom, overflow: "hidden", whiteSpace: "pre" }}>
        {el.content}
      </div>
    );
  }
  if (el.type === "video") {
    const embed = videoEmbedUrl(el.src ?? "");
    // In edit mode, render a non-interactive poster so the element can be selected / dragged.
    if (editMode) {
      return (
        <div style={{ ...base, background: "#0f1115", borderRadius: 6 * zoom, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#cdd6f4", pointerEvents: "none" }}>
          <Play style={{ width: 28 * zoom, height: 28 * zoom }} fill="currentColor" />
          <span style={{ fontSize: 11 * zoom, marginTop: 6 * zoom, opacity: 0.7, maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {embed ? "Embedded video" : (el.src ? "Video file" : "No video URL")}
          </span>
        </div>
      );
    }
    // Presenter / playable mode.
    if (embed) {
      return (
        <iframe
          src={embed}
          style={{ ...base, border: "none", borderRadius: 6 * zoom }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    if (el.src) {
      return (
        <video
          src={el.src}
          controls
          style={{ ...base, background: "#000", borderRadius: 6 * zoom, objectFit: "contain" }}
        />
      );
    }
    return (
      <div style={{ ...base, background: "#0f1115", borderRadius: 6 * zoom, display: "flex", alignItems: "center", justifyContent: "center", color: "#80868b", fontSize: 12 * zoom }}>
        No video URL
      </div>
    );
  }
  if (el.type === "audio") {
    // Edit mode: a non-interactive speaker poster so the element can be selected / dragged.
    if (editMode) {
      return (
        <div style={{ ...base, background: "#e8f0fe", border: "1px solid #1a56db", borderRadius: 8 * zoom, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#1a56db", pointerEvents: "none" }}>
          <Volume2 style={{ width: 24 * zoom, height: 24 * zoom }} />
          <span style={{ fontSize: 10 * zoom, marginTop: 4 * zoom, opacity: 0.8, maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {el.src ? "Audio clip" : "No audio URL"}
          </span>
        </div>
      );
    }
    if (el.src) {
      return (
        <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 * zoom }}>
          <audio controls src={el.src} style={{ width: "100%" }} />
        </div>
      );
    }
    return (
      <div style={{ ...base, background: "#f1f3f4", borderRadius: 8 * zoom, display: "flex", alignItems: "center", justifyContent: "center", color: "#80868b", fontSize: 12 * zoom }}>
        No audio URL
      </div>
    );
  }
  return null;
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function SlidesEditor({ presId }: { presId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("Untitled Presentation");
  const [slides, setSlides] = useState<Slide[]>([{
    id: "s1", background: "#ffffff", elements: [], notes: "", transition: "fade"
  }]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(0.6);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const GRID = 10; // grid size in canvas units

  // Panels
  const [showNotes, setShowNotes] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const [presenterSlide, setPresenterSlide] = useState(0);
  const [elapsed, setElapsed] = useState(0); // presenter elapsed seconds
  const [showAI, setShowAI] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Slide sorter / grid overview
  const [sorterView, setSorterView] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // Deck-level footer / slide-number settings (Feature 2)
  const [showNumbers, setShowNumbers] = useState(false);
  const [showFooter, setShowFooter] = useState(false);
  const [footerText, setFooterText] = useState("");
  const [masterLogo, setMasterLogo] = useState("");
  const [showDeckSettings, setShowDeckSettings] = useState(false);

  // Find & Replace (Feature 1)
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const findCursor = useRef<{ slide: number; el: number; occ: number }>({ slide: 0, el: -1, occ: -1 });

  // Print / Export PDF
  const [printing, setPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Presenter mode live clock
  const [presenterTime, setPresenterTime] = useState(() => new Date().toLocaleTimeString());

  // AI
  const [aiPrompt, setAIPrompt] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [aiMode, setAIMode] = useState<"generate" | "rewrite" | "notes" | "design">("generate");

  // History
  const history = useRef<Slide[][]>([]);
  const historyIdx = useRef(-1);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { collaborators } = useSlidesCollab(presId, () => {});

  const activeSlide = slides[activeIdx] ?? slides[0];
  const selectedEl = activeSlide?.elements.find(e => e.id === selectedElId);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/slides/${presId}`)
      .then(r => r.json())
      .then((d: { title?: string; content?: string }) => {
        if (d.title) setTitle(d.title);
        if (d.content) {
          try {
            const parsed = JSON.parse(d.content) as { slides?: Slide[]; themeId?: string; deck?: { showNumbers?: boolean; showFooter?: boolean; footerText?: string; masterLogo?: string } };
            if (parsed.slides?.length) setSlides(parsed.slides);
            if (parsed.themeId) setTheme(THEMES.find(t => t.id === parsed.themeId) ?? THEMES[0]);
            if (parsed.deck) {
              if (typeof parsed.deck.showNumbers === "boolean") setShowNumbers(parsed.deck.showNumbers);
              if (typeof parsed.deck.showFooter === "boolean") setShowFooter(parsed.deck.showFooter);
              if (typeof parsed.deck.footerText === "string") setFooterText(parsed.deck.footerText);
              if (typeof parsed.deck.masterLogo === "string") setMasterLogo(parsed.deck.masterLogo);
            }
          } catch { /* fresh */ }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [presId]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((s: Slide[], t: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/slides/${presId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: t, content: JSON.stringify({ slides: s, themeId: theme.id, deck: { showNumbers, showFooter, footerText, masterLogo } }) }),
        });
      } finally { setSaving(false); }
    }, 1500);
  }, [presId, theme.id, showNumbers, showFooter, footerText, masterLogo]);

  // ── History ───────────────────────────────────────────────────────────────
  const pushHistory = useCallback((s: Slide[]) => {
    history.current = history.current.slice(0, historyIdx.current + 1);
    history.current.push(s.map(sl => ({ ...sl, elements: [...sl.elements] })));
    historyIdx.current = history.current.length - 1;
  }, []);

  const undo = () => { if (historyIdx.current > 0) { historyIdx.current--; setSlides(history.current[historyIdx.current]); } };
  const redo = () => { if (historyIdx.current < history.current.length - 1) { historyIdx.current++; setSlides(history.current[historyIdx.current]); } };

  // ── Slide mutations ───────────────────────────────────────────────────────
  const updateSlide = useCallback((patch: Partial<Slide>) => {
    setSlides(prev => {
      const next = prev.map((s, i) => i === activeIdx ? { ...s, ...patch } : s);
      pushHistory(next); scheduleSave(next, title);
      return next;
    });
  }, [activeIdx, pushHistory, scheduleSave, title]);

  const updateElement = useCallback((id: string, patch: Partial<SlideElement>) => {
    setSlides(prev => {
      const next = prev.map((s, i) => i === activeIdx ? { ...s, elements: s.elements.map(e => e.id === id ? { ...e, ...patch } : e) } : s);
      pushHistory(next); scheduleSave(next, title);
      return next;
    });
  }, [activeIdx, pushHistory, scheduleSave, title]);

  const addElement = useCallback((el: Omit<SlideElement, "id">) => {
    const newEl: SlideElement = { ...el, id: `el_${Date.now()}`, zIndex: activeSlide.elements.length + 1 };
    updateSlide({ elements: [...activeSlide.elements, newEl] });
    setSelectedElId(newEl.id);
  }, [activeSlide, updateSlide]);

  const addElements = useCallback((els: Omit<SlideElement, "id">[]) => {
    const baseZ = activeSlide.elements.length + 1;
    const withIds: SlideElement[] = els.map((el, i) => ({ ...el, id: "el_" + Date.now() + "_" + i, zIndex: baseZ + i }));
    updateSlide({ elements: [...activeSlide.elements, ...withIds] });
    setSelectedElId(null);
  }, [activeSlide, updateSlide]);

  const deleteElement = useCallback((id: string) => {
    updateSlide({ elements: activeSlide.elements.filter(e => e.id !== id) });
    setSelectedElId(null);
  }, [activeSlide, updateSlide]);

  const duplicateElement = useCallback((id: string) => {
    const el = activeSlide.elements.find(e => e.id === id);
    if (!el) return;
    addElement({ ...el, x: el.x + 20, y: el.y + 20 });
  }, [activeSlide, addElement]);

  // ── Slide management ──────────────────────────────────────────────────────
  const addSlide = (template?: typeof SLIDE_TEMPLATES[0]) => {
    const newSlide: Slide = {
      id: `s_${Date.now()}`,
      background: theme.bg.includes("gradient") ? "#ffffff" : theme.bg,
      elements: template ? template.elements.map((el, i) => ({ ...el, id: `el_${Date.now()}_${i}` })) : [],
      notes: "",
      transition: "fade",
    };
    setSlides(prev => {
      const next = [...prev.slice(0, activeIdx + 1), newSlide, ...prev.slice(activeIdx + 1)];
      scheduleSave(next, title);
      return next;
    });
    setActiveIdx(activeIdx + 1);
    setSelectedElId(null);
  };

  const deleteSlide = (idx: number) => {
    if (slides.length === 1) return toast.error("Can't delete the only slide");
    setSlides(prev => {
      const next = prev.filter((_, i) => i !== idx);
      scheduleSave(next, title);
      return next;
    });
    setActiveIdx(Math.min(activeIdx, slides.length - 2));
  };

  const duplicateSlide = (idx: number) => {
    const copy: Slide = { ...slides[idx], id: `s_${Date.now()}`, elements: slides[idx].elements.map(e => ({ ...e, id: `el_${Date.now()}_${Math.random()}` })) };
    setSlides(prev => {
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      scheduleSave(next, title);
      return next;
    });
    setActiveIdx(idx + 1);
  };

  const moveSlide = (idx: number, dir: "up" | "down") => {
    const to = dir === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= slides.length) return;
    setSlides(prev => {
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      scheduleSave(next, title);
      return next;
    });
    setActiveIdx(to);
  };

  // Reorder a slide from `from` to land at visual position `to` (drop index).
  // `to` is the gap index in [0, slides.length]; the dragged slide is removed
  // first, then inserted so it lands at the intended slot.
  const reorderSlide = (from: number, to: number) => {
    if (from < 0 || from >= slides.length) return;
    let target = to;
    if (target > from) target -= 1; // account for removal of the dragged item
    if (target === from) { setActiveIdx(from); return; }
    setSlides(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      const clamped = Math.max(0, Math.min(target, next.length));
      next.splice(clamped, 0, moved);
      pushHistory(next); scheduleSave(next, title);
      setActiveIdx(clamped);
      return next;
    });
  };

  // ── Drag to move elements ─────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizing = useRef<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);

  const onElMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const el = activeSlide.elements.find(el => el.id === id);
    if (!el || el.locked) return;
    setSelectedElId(id);
    dragging.current = { id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
    const snap = (n: number) => snapToGrid ? Math.round(n / GRID) * GRID : n;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      updateElement(id, {
        x: snap(Math.max(0, dragging.current.origX + (ev.clientX - dragging.current.startX) / zoom)),
        y: snap(Math.max(0, dragging.current.origY + (ev.clientY - dragging.current.startY) / zoom)),
      });
    };
    const onUp = () => { dragging.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const el = activeSlide.elements.find(el => el.id === id);
    if (!el || el.locked) return;
    resizing.current = { id, startX: e.clientX, startY: e.clientY, origW: el.w, origH: el.h };
    const snap = (n: number) => snapToGrid ? Math.round(n / GRID) * GRID : n;
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      updateElement(id, {
        w: snap(Math.max(40, resizing.current.origW + (ev.clientX - resizing.current.startX) / zoom)),
        h: snap(Math.max(20, resizing.current.origH + (ev.clientY - resizing.current.startY) / zoom)),
      });
    };
    const onUp = () => { resizing.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Import PPTX ───────────────────────────────────────────────────────────
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // For now just create a slide with a message — full PPTX parse requires additional deps
    toast.info("Import detected — creating placeholder slide");
    addSlide();
  };

  // ── Apply theme ───────────────────────────────────────────────────────────
  const applyTheme = (t: Theme) => {
    setTheme(t);
    setSlides(prev => {
      const next = prev.map(s => ({ ...s, background: t.bg.includes("gradient") ? "#1a1a2e" : t.bg }));
      scheduleSave(next, title);
      return next;
    });
    setShowThemes(false);
    toast.success(`Theme: ${t.name}`);
  };

  // ── Layout presets (Feature 1) ─────────────────────────────────────────────
  const applyLayout = (preset: typeof LAYOUT_PRESETS[0]) => {
    const els = preset.build().map((el, i) => ({ ...el, id: `el_${Date.now()}_${i}`, zIndex: i + 1 }) as SlideElement);
    updateSlide({ elements: els });
    setSelectedElId(null);
    setShowLayout(false);
    toast.success(`Layout: ${preset.name}`);
  };

  // ── Master background: apply current slide's background to all (Feature 1) ──
  const applyBackgroundToAll = () => {
    const bg = activeSlide.background;
    const bgImage = activeSlide.backgroundImage;
    setSlides(prev => {
      const next = prev.map(s => ({ ...s, background: bg, backgroundImage: bgImage }));
      pushHistory(next); scheduleSave(next, title);
      return next;
    });
    setShowLayout(false);
    toast.success("Background applied to all slides");
  };

  // ── Sections (Feature 2) ───────────────────────────────────────────────────
  const setSlideSection = (idx: number, name: string | undefined) => {
    setSlides(prev => {
      const next = prev.map((s, i) => i === idx ? { ...s, section: name && name.trim() ? name.trim() : undefined } : s);
      pushHistory(next); scheduleSave(next, title);
      return next;
    });
  };

  const promptSection = (idx: number) => {
    const current = slides[idx].section ?? "";
    const name = prompt("Section name (blank to remove):", current);
    if (name === null) return;
    setSlideSection(idx, name);
  };

  const toggleSection = (name: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // ── Hide / show slide (Feature 3) ──────────────────────────────────────────
  const toggleHidden = (idx: number) => {
    setSlides(prev => {
      const next = prev.map((s, i) => i === idx ? { ...s, hidden: !s.hidden } : s);
      pushHistory(next); scheduleSave(next, title);
      return next;
    });
  };

  // Compute the active section a slide falls under (the nearest preceding section)
  const sectionForIndex = (idx: number): string | undefined => {
    for (let i = idx; i >= 0; i--) {
      if (slides[i].section) return slides[i].section;
    }
    return undefined;
  };

  // Next / previous non-hidden slide index for presenter navigation
  const nextVisibleIndex = (from: number): number => {
    for (let i = from + 1; i < slides.length; i++) if (!slides[i].hidden) return i;
    return from;
  };
  const prevVisibleIndex = (from: number): number => {
    for (let i = from - 1; i >= 0; i--) if (!slides[i].hidden) return i;
    return from;
  };

  // ── Presenter elapsed-time timer (Feature 3) ───────────────────────────────
  useEffect(() => {
    if (!presenterMode) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [presenterMode]);

  // ── Presenter live clock ───────────────────────────────────────────────────
  useEffect(() => {
    if (!presenterMode) return;
    setPresenterTime(new Date().toLocaleTimeString());
    const t = setInterval(() => setPresenterTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, [presenterMode]);

  // Ctrl/Cmd+F opens Find & Replace (Feature 1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmtTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  };
  // Count of visible slides + the position of the current presenter slide within them.
  const visibleSlideCount = slides.filter(s => !s.hidden).length;
  const visiblePositionOf = (idx: number): number => {
    let pos = 0;
    for (let i = 0; i <= idx && i < slides.length; i++) if (!slides[i].hidden) pos++;
    return pos;
  };

  // ── Apply layer operations ────────────────────────────────────────────────
  const layerOp = (id: string, op: "front" | "back" | "forward" | "backward") => {
    const el = activeSlide.elements.find(e => e.id === id);
    if (!el) return;
    const maxZ = Math.max(...activeSlide.elements.map(e => e.zIndex ?? 1));
    const minZ = Math.min(...activeSlide.elements.map(e => e.zIndex ?? 1));
    const z = el.zIndex ?? 1;
    updateElement(id, {
      zIndex: op === "front" ? maxZ + 1 : op === "back" ? Math.max(0, minZ - 1) : op === "forward" ? z + 1 : Math.max(0, z - 1)
    });
  };

  // ── AI generation ─────────────────────────────────────────────────────────
  const runAI = async () => {
    setAILoading(true);
    try {
      const prompt = aiMode === "generate"
        ? `Create a ${slides.length}-slide presentation outline about: "${aiPrompt}". For each slide, provide: title and 3-4 bullet points. Format as JSON array: [{"title": "...", "bullets": ["...", "..."]}]`
        : aiMode === "rewrite"
        ? `Rewrite this slide content to be more engaging and professional. Slide title: "${activeSlide.elements.find(e => e.type === "text")?.content ?? ""}". Return improved text only.`
        : aiMode === "notes"
        ? `Generate detailed speaker notes for a slide titled: "${activeSlide.elements.find(e => e.type === "text")?.content ?? ""}". Notes should be 3-4 sentences.`
        : `Suggest a better design layout for a slide about: "${aiPrompt}". Keep it concise.`;

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json() as { reply?: string; message?: string };
      const text = d.reply ?? d.message ?? "";

      if (aiMode === "generate") {
        // Try to parse JSON outline
        try {
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const outline = JSON.parse(jsonMatch[0]) as { title: string; bullets: string[] }[];
            const newSlides: Slide[] = outline.map((item, i) => ({
              id: `ai_s_${Date.now()}_${i}`,
              background: theme.bg.includes("gradient") ? "#ffffff" : theme.bg,
              notes: "",
              transition: "fade",
              elements: [
                { id: `el_t_${i}`, type: "text", x: 48, y: 40, w: 864, h: 70, content: item.title, style: { fontSize: 34, bold: true, color: theme.text }, zIndex: 2 },
                { id: `el_b_${i}`, type: "text", x: 48, y: 130, w: 864, h: 360, content: item.bullets.map(b => `• ${b}`).join("\n"), style: { fontSize: 20, color: theme.secondary }, zIndex: 1 },
              ] as SlideElement[],
            }));
            setSlides(newSlides);
            setActiveIdx(0);
            scheduleSave(newSlides, title);
            toast.success(`Generated ${newSlides.length} slides`);
          }
        } catch {
          toast.error("Could not parse AI outline — raw text returned");
        }
      } else if (aiMode === "notes") {
        updateSlide({ notes: text });
        setShowNotes(true);
        toast.success("Speaker notes generated");
      } else {
        toast.info(text.slice(0, 100));
      }
    } catch { toast.error("AI failed"); }
    finally { setAILoading(false); setShowAI(false); }
  };

  // ── Find & Replace across all slides (Feature 1) ───────────────────────────
  // Returns the searchable text of a text-bearing element, or null if not searchable.
  const elementSearchText = (el: SlideElement): string | null => {
    if (el.type === "text" || el.type === "code") return el.content ?? "";
    if (el.type === "table" && el.tableRows) return el.tableRows.map(r => r.join("\t")).join("\n");
    return null;
  };

  const countOccurrences = (haystack: string, needle: string): number => {
    if (!needle) return 0;
    const h = matchCase ? haystack : haystack.toLowerCase();
    const n = matchCase ? needle : needle.toLowerCase();
    let count = 0, from = 0, idx;
    while ((idx = h.indexOf(n, from)) !== -1) { count++; from = idx + n.length; }
    return count;
  };

  // Move selection to the next match after the current cursor position. Wraps around.
  const findNext = () => {
    const needle = findText;
    if (!needle) { toast.info("Enter text to find"); return; }
    const cur = findCursor.current;
    const total = slides.length;
    // Walk slides/elements starting just after the current cursor.
    for (let step = 0; step <= total; step++) {
      const si = (cur.slide + step) % total;
      const sl = slides[si];
      const startEl = step === 0 ? cur.el : -1;
      for (let ei = startEl + 1; ei < sl.elements.length; ei++) {
        const txt = elementSearchText(sl.elements[ei]);
        if (txt && countOccurrences(txt, needle) > 0) {
          findCursor.current = { slide: si, el: ei, occ: 0 };
          setActiveIdx(si);
          setSelectedElId(sl.elements[ei].id);
          return;
        }
      }
    }
    // Restart from the very beginning if cursor was mid-deck and nothing found ahead.
    for (let si = 0; si < total; si++) {
      const sl = slides[si];
      for (let ei = 0; ei < sl.elements.length; ei++) {
        const txt = elementSearchText(sl.elements[ei]);
        if (txt && countOccurrences(txt, needle) > 0) {
          findCursor.current = { slide: si, el: ei, occ: 0 };
          setActiveIdx(si);
          setSelectedElId(sl.elements[ei].id);
          return;
        }
      }
    }
    toast.info("No matches found");
  };

  // Replace text in a single string (case-sensitive or insensitive).
  const replaceInString = (haystack: string, needle: string, repl: string): { out: string; count: number } => {
    if (!needle) return { out: haystack, count: 0 };
    if (matchCase) {
      let count = 0, out = "", from = 0, idx;
      while ((idx = haystack.indexOf(needle, from)) !== -1) {
        out += haystack.slice(from, idx) + repl;
        from = idx + needle.length;
        count++;
      }
      out += haystack.slice(from);
      return { out, count };
    }
    const lower = haystack.toLowerCase();
    const nLower = needle.toLowerCase();
    let count = 0, out = "", from = 0, idx;
    while ((idx = lower.indexOf(nLower, from)) !== -1) {
      out += haystack.slice(from, idx) + repl;
      from = idx + needle.length;
      count++;
    }
    out += haystack.slice(from);
    return { out, count };
  };

  // Apply replacement to a single element, returning the patched element + count.
  const replaceInElement = (el: SlideElement, needle: string, repl: string): { el: SlideElement; count: number } => {
    if (el.type === "text" || el.type === "code") {
      const r = replaceInString(el.content ?? "", needle, repl);
      return { el: r.count ? { ...el, content: r.out } : el, count: r.count };
    }
    if (el.type === "table" && el.tableRows) {
      let count = 0;
      const rows = el.tableRows.map(row => row.map(cell => {
        const r = replaceInString(cell, needle, repl);
        count += r.count;
        return r.out;
      }));
      return { el: count ? { ...el, tableRows: rows } : el, count };
    }
    return { el, count: 0 };
  };

  // Replace only the currently selected match's element (single element scope).
  const replaceCurrent = () => {
    if (!findText) { toast.info("Enter text to find"); return; }
    if (!selectedElId) { findNext(); return; }
    let replaced = 0;
    setSlides(prev => {
      const next = prev.map(sl => ({
        ...sl,
        elements: sl.elements.map(e => {
          if (e.id !== selectedElId) return e;
          const r = replaceInElement(e, findText, replaceText);
          replaced += r.count;
          return r.el;
        }),
      }));
      if (replaced) { pushHistory(next); scheduleSave(next, title); }
      return next;
    });
    if (replaced) toast.success("Replaced " + replaced + " in this element");
    else toast.info("No match in the selected element");
    // Advance to the next match after replacing.
    setTimeout(findNext, 0);
  };

  const replaceAll = () => {
    if (!findText) { toast.info("Enter text to find"); return; }
    let total = 0;
    setSlides(prev => {
      const next = prev.map(sl => ({
        ...sl,
        elements: sl.elements.map(e => {
          const r = replaceInElement(e, findText, replaceText);
          total += r.count;
          return r.el;
        }),
      }));
      if (total) { pushHistory(next); scheduleSave(next, title); }
      return next;
    });
    if (total) toast.success("Replaced " + total + " occurrence" + (total === 1 ? "" : "s"));
    else toast.info("No matches found");
  };

  // ── Print / Export PDF ────────────────────────────────────────────────────
  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(false), 500);
    }, 100);
  };

  // ── Presenter mode ────────────────────────────────────────────────────────
  if (presenterMode) {
    const ps = slides[presenterSlide] ?? slides[0];
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        {/* Top row: slide + next-slide preview */}
        <div className="flex flex-1 min-h-0">
          {/* Main slide */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 pt-6">
            <div
              key={presenterSlide}
              style={{
                width: "80vw", aspectRatio: "16/9", position: "relative", background: ps.background, overflow: "hidden",
                ...(ps.transition && ps.transition !== "none" && TRANSITION_KEYFRAME[ps.transition]
                  ? { animation: `${TRANSITION_KEYFRAME[ps.transition]} 0.5s ease both` } : {}),
              }}
            >
              {ps.elements.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map((el, i) => (
                <SlideElementView key={el.id} el={el} zoom={window.innerWidth * 0.8 / CANVAS_W} theme={theme} anim animDelay={150 + i * 120} />
              ))}
              {masterLogo && (
                <img src={masterLogo} alt="" className="absolute top-3 right-4 pointer-events-none select-none" style={{ maxHeight: "12%", maxWidth: "22%", objectFit: "contain" }} />
              )}
              {showFooter && footerText.trim() && (
                <div className="absolute bottom-3 left-5 right-24 text-sm font-medium select-none pointer-events-none truncate" style={{ color: theme.secondary }}>
                  {footerText}
                </div>
              )}
              {showNumbers && (
                <div className="absolute bottom-3 right-5 text-sm font-medium select-none pointer-events-none" style={{ color: theme.secondary }}>
                  {visiblePositionOf(presenterSlide) + " / " + visibleSlideCount}
                </div>
              )}
            </div>
            {/* Controls */}
            <div className="flex items-center gap-6 mt-4 pb-2">
              <button disabled={prevVisibleIndex(presenterSlide) === presenterSlide} onClick={() => setPresenterSlide(p => prevVisibleIndex(p))} className="text-white/70 hover:text-white disabled:opacity-30">
                <ChevronLeft className="h-8 w-8" />
              </button>
              <span className="text-white text-base font-semibold tabular-nums">
                {"Slide " + visiblePositionOf(presenterSlide) + " of " + visibleSlideCount}
              </span>
              <button disabled={nextVisibleIndex(presenterSlide) === presenterSlide} onClick={() => setPresenterSlide(p => nextVisibleIndex(p))} className="text-white/70 hover:text-white disabled:opacity-30">
                <ChevronRight className="h-8 w-8" />
              </button>
              <div className="flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded-lg bg-white/10 text-white/90 text-sm font-medium tabular-nums">
                <Timer className="h-4 w-4 text-white/70" />
                {fmtTime(elapsed)}
                <button onClick={() => setElapsed(0)} title="Reset timer" className="ml-1 text-white/50 hover:text-white">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
              <button onClick={() => setPresenterMode(false)} className="text-white/70 hover:text-white ml-4" title="Exit presenter">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Right sidebar: next slide */}
          <div className="w-64 border-l border-white/10 p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
            <div>
              <p className="text-white/50 text-xs font-semibold uppercase mb-2">Next slide</p>
              {(() => {
                const ni = nextVisibleIndex(presenterSlide);
                if (ni === presenterSlide) return <p className="text-white/40 text-sm">End of presentation</p>;
                const nx = slides[ni];
                const z = 224 / CANVAS_W;
                return (
                  <div className="rounded overflow-hidden border border-white/15" style={{ width: 224, aspectRatio: "16/9", position: "relative", background: nx.background }}>
                    {nx.elements.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(el => (
                      <SlideElementView key={el.id} el={el} zoom={z} theme={theme} editMode />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Bottom notes panel */}
        <div style={{ background: "#1e1e1e", borderTop: "1px solid rgba(255,255,255,0.1)", minHeight: 140, maxHeight: 200 }} className="flex-shrink-0 px-6 py-4 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-white/50 text-xs font-semibold uppercase">Speaker notes</p>
            <div className="flex items-center gap-4 text-xs text-white/50 tabular-nums">
              <span>{"Slide " + visiblePositionOf(presenterSlide) + " of " + visibleSlideCount}</span>
              <span>{presenterTime}</span>
            </div>
          </div>
          <p className="text-white/85 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto">
            {ps.notes || "No speaker notes for this slide."}
          </p>
        </div>
      </div>
    );
  }

  if (!loaded) return <div className="flex items-center justify-center h-screen bg-white"><Loader2 className="h-6 w-6 animate-spin text-[#1a56db]" /></div>;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden text-[#202124]">

      {/* ── Title bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8eaed] bg-white z-20">
        <button
          onClick={() => router.push("/apps/slides")}
          title="Back to presentations"
          className="flex items-center justify-center h-8 w-8 rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          className="text-sm font-semibold text-[#202124] bg-transparent border-none outline-none focus:bg-[#f1f3f4] rounded px-1 min-w-0 w-52"
          value={title}
          onChange={e => { setTitle(e.target.value); scheduleSave(slides, e.target.value); }}
        />

        {/* Collab */}
        {collaborators.slice(0, 3).map(c => (
          <div key={c.userId} title={c.name} className="h-6 w-6 rounded-full bg-[#1a56db] text-white text-[9px] font-bold flex items-center justify-center">{c.name[0]?.toUpperCase()}</div>
        ))}

        <div className="text-[11px] text-[#80868b]">{saving ? "Saving…" : <span className="text-[#0f9d58]">Saved</span>}</div>

        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setShowAI(v => !v)} className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${showAI ? "bg-purple-100 text-purple-700" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
            <Sparkles className="h-3.5 w-3.5" /> AI
          </button>
          <button onClick={() => setShowFindReplace(true)} title="Find & replace (Ctrl/Cmd+F)" className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">
            <Search className="h-3.5 w-3.5" /> Find
          </button>
          <button onClick={() => setShowDeckSettings(true)} title="Slide numbers & footer" className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">
            <Hash className="h-3.5 w-3.5" /> Footer
          </button>
          <button onClick={() => setShowThemes(v => !v)} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">
            <Layers className="h-3.5 w-3.5" /> Theme
          </button>
          <button onClick={() => setShowLayout(v => !v)} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">
            <LayoutTemplate className="h-3.5 w-3.5" /> Layout
          </button>
          <button onClick={() => setShowTemplates(v => !v)} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">
            <Grid3x3 className="h-3.5 w-3.5" /> Templates
          </button>
          <button onClick={() => { setSorterView(v => !v); setSelectedElId(null); }} title="Slide sorter — grid overview of all slides" className={"flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors " + (sorterView ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]")}>
            <LayoutGrid className="h-3.5 w-3.5" /> Sorter
          </button>
          <button onClick={() => {
            let start = activeIdx;
            if (slides[start]?.hidden) {
              const fwd = nextVisibleIndex(start);
              start = fwd !== start ? fwd : prevVisibleIndex(start);
            }
            setPresenterSlide(start); setPresenterMode(true);
          }} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">
            <Play className="h-3.5 w-3.5" /> Present
          </button>
          <button onClick={() => void exportPPTX(slides, title)} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-[#e8eaed] bg-white z-10">
        <ToolBtn icon={<Undo2 className="h-3.5 w-3.5" />} title="Undo" onClick={undo} />
        <ToolBtn icon={<Redo2 className="h-3.5 w-3.5" />} title="Redo" onClick={redo} />
        <Sep />

        {/* Insert */}
        <ToolBtn icon={<Type className="h-3.5 w-3.5" />} title="Text box" onClick={() => addElement({ type: "text", x: 100, y: 100, w: 400, h: 60, content: "Click to edit text", style: { fontSize: 24, color: theme.text } })} />
        <ToolBtn icon={<Square className="h-3.5 w-3.5" />} title="Rectangle" onClick={() => addElement({ type: "shape", x: 100, y: 100, w: 200, h: 120, shapeType: "rect", style: { bg: theme.accent + "20", borderColor: theme.accent, borderWidth: 2 } })} />
        <ToolBtn icon={<Circle className="h-3.5 w-3.5" />} title="Circle" onClick={() => addElement({ type: "shape", x: 100, y: 100, w: 120, h: 120, shapeType: "circle", style: { bg: theme.accent + "30", borderColor: theme.accent, borderWidth: 2 } })} />
        <ToolBtn icon={<Triangle className="h-3.5 w-3.5" />} title="Triangle" onClick={() => addElement({ type: "shape", x: 100, y: 100, w: 140, h: 130, shapeType: "triangle", style: { bg: theme.accent + "40" } })} />
        <ToolBtn icon={<MoveRight className="h-3.5 w-3.5" />} title="Arrow" onClick={() => addElement({ type: "shape", x: 100, y: 120, w: 200, h: 100, shapeType: "arrow", style: { bg: theme.accent + "40" } })} />
        <ToolBtn icon={<Minus className="h-3.5 w-3.5" />} title="Line" onClick={() => addElement({ type: "shape", x: 100, y: 160, w: 240, h: 12, shapeType: "line", style: { borderColor: theme.accent, borderWidth: 3 } })} />
        <ToolBtn icon={<MoveRight className="h-3.5 w-3.5 -rotate-45" />} title="Connector (diagonal line)" onClick={() => addElement({ type: "shape", x: 140, y: 140, w: 240, h: 12, shapeType: "line", style: { borderColor: theme.accent, borderWidth: 3, rotation: -30 } })} />
        <ToolBtn icon={<Star className="h-3.5 w-3.5" />} title="Star" onClick={() => addElement({ type: "shape", x: 100, y: 100, w: 140, h: 140, shapeType: "star", style: { bg: theme.accent + "40" } })} />
        <label title="Insert image (upload)" className="flex items-center justify-center h-7 w-7 rounded text-sm text-[#5f6368] hover:bg-[#f1f3f4] cursor-pointer transition-colors">
          <ImageIcon className="h-3.5 w-3.5" />
          <input type="file" accept="image/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5MB)"); return; }
            const reader = new FileReader();
            reader.onload = () => addElement({ type: "image", x: 100, y: 100, w: 320, h: 220, src: String(reader.result) });
            reader.readAsDataURL(f);
            e.currentTarget.value = "";
          }} />
        </label>
        <ToolBtn icon={<BarChart3 className="h-3.5 w-3.5" />} title="Bar chart" onClick={() => addElement({ type: "chart", x: 200, y: 120, w: 400, h: 300, chartType: "bar", chartData: [{ name: "Q1", value: 40 }, { name: "Q2", value: 65 }, { name: "Q3", value: 50 }, { name: "Q4", value: 80 }] })} />
        <ToolBtn icon={<Table className="h-3.5 w-3.5" />} title="Table" onClick={() => addElement({ type: "table", x: 100, y: 120, w: 500, h: 200, tableRows: [["Header 1", "Header 2", "Header 3"], ["Row 1 A", "Row 1 B", "Row 1 C"], ["Row 2 A", "Row 2 B", "Row 2 C"]] })} />
        <ToolBtn icon={<Code2 className="h-3.5 w-3.5" />} title="Code block" onClick={() => addElement({ type: "code", x: 100, y: 120, w: 600, h: 200, content: "// Your code here\nconst hello = 'world';\nconsole.log(hello);" })} />
        <select title="Insert SmartArt diagram" className="text-xs border border-[#e8eaed] rounded px-1 py-0.5 h-7 bg-white text-[#5f6368] cursor-pointer"
          value=""
          onChange={e => { const k = e.target.value as SmartArtKind; if (k) addElements(buildSmartArt(k, theme.accent, theme.text)); }}>
          <option value="">SmartArt ▾</option>
          <option value="list">List</option>
          <option value="process">Process</option>
          <option value="cycle">Cycle</option>
          <option value="hierarchy">Hierarchy</option>
        </select>
        <ToolBtn icon={<Video className="h-3.5 w-3.5" />} title="Embed video (YouTube/Vimeo/MP4 URL)" onClick={() => { const u = prompt("Video URL (YouTube, Vimeo, or direct .mp4):"); if (u && u.trim()) addElement({ type: "video", x: 180, y: 120, w: 480, h: 270, src: u.trim() }); }} />
        <ToolBtn icon={<Music className="h-3.5 w-3.5" />} title="Embed audio (direct .mp3/.wav/.ogg URL)" onClick={() => { const u = prompt("Audio URL (direct .mp3, .wav or .ogg):"); if (u && u.trim()) addElement({ type: "audio", x: 200, y: 180, w: 360, h: 64, src: u.trim() }); }} />
        <Sep />

        {/* Element style (when selected) */}
        {selectedEl && selectedEl.type === "text" && (
          <>
            <ToolBtn icon={<Bold className="h-3.5 w-3.5" />} title="Bold" active={selectedEl.style?.bold} onClick={() => updateElement(selectedEl.id, { style: { ...selectedEl.style, bold: !selectedEl.style?.bold } })} />
            <ToolBtn icon={<Italic className="h-3.5 w-3.5" />} title="Italic" active={selectedEl.style?.italic} onClick={() => updateElement(selectedEl.id, { style: { ...selectedEl.style, italic: !selectedEl.style?.italic } })} />
            <ToolBtn icon={<Underline className="h-3.5 w-3.5" />} title="Underline" active={selectedEl.style?.underline} onClick={() => updateElement(selectedEl.id, { style: { ...selectedEl.style, underline: !selectedEl.style?.underline } })} />
            <ToolBtn icon={<AlignLeft className="h-3.5 w-3.5" />} title="Left" active={selectedEl.style?.align === "left"} onClick={() => updateElement(selectedEl.id, { style: { ...selectedEl.style, align: "left" } })} />
            <ToolBtn icon={<AlignCenter className="h-3.5 w-3.5" />} title="Center" active={selectedEl.style?.align === "center"} onClick={() => updateElement(selectedEl.id, { style: { ...selectedEl.style, align: "center" } })} />
            <ToolBtn icon={<AlignRight className="h-3.5 w-3.5" />} title="Right" active={selectedEl.style?.align === "right"} onClick={() => updateElement(selectedEl.id, { style: { ...selectedEl.style, align: "right" } })} />
            <select title="Vertical align" className="text-xs border border-[#e8eaed] rounded px-1 py-0.5 h-7 bg-white text-[#5f6368]"
              value={selectedEl.style?.valign ?? "top"}
              onChange={e => updateElement(selectedEl.id, { style: { ...selectedEl.style, valign: e.target.value as ElementStyle["valign"] } })}>
              <option value="top">⊤ Top</option>
              <option value="middle">⊟ Middle</option>
              <option value="bottom">⊥ Bottom</option>
            </select>
            <Sep />
            <select className="text-xs border border-[#e8eaed] rounded px-1 py-0.5 h-7 bg-white" value={selectedEl.style?.fontSize ?? 18} onChange={e => updateElement(selectedEl.id, { style: { ...selectedEl.style, fontSize: Number(e.target.value) } })}>
              {[12,14,16,18,20,24,28,32,36,40,48,56,64,72].map(s => <option key={s}>{s}</option>)}
            </select>
            <input type="color" title="Text color" className="h-7 w-7 cursor-pointer border border-[#e8eaed] rounded" value={selectedEl.style?.color ?? "#202124"} onChange={e => updateElement(selectedEl.id, { style: { ...selectedEl.style, color: e.target.value } })} />
            <Sep />
          </>
        )}

        {/* Shape fill controls — solid + gradient (Feature 2) */}
        {selectedEl && selectedEl.type === "shape" && (
          <>
            <span className="text-[11px] text-[#80868b] flex items-center gap-1">Fill</span>
            <input type="color" title="Fill color" className="h-7 w-7 cursor-pointer border border-[#e8eaed] rounded" value={selectedEl.style?.bg ?? "#1a56db"} onChange={e => updateElement(selectedEl.id, { style: { ...selectedEl.style, bg: e.target.value } })} />
            <ToolBtn
              icon={<Layers className="h-3.5 w-3.5" />}
              title={selectedEl.style?.gradient ? "Gradient fill: on" : "Gradient fill: off"}
              active={selectedEl.style?.gradient}
              onClick={() => updateElement(selectedEl.id, { style: { ...selectedEl.style, gradient: !selectedEl.style?.gradient, bg2: selectedEl.style?.bg2 ?? "#7c3aed" } })}
            />
            {selectedEl.style?.gradient && (
              <input type="color" title="Gradient second color" className="h-7 w-7 cursor-pointer border border-[#e8eaed] rounded" value={selectedEl.style?.bg2 ?? "#7c3aed"} onChange={e => updateElement(selectedEl.id, { style: { ...selectedEl.style, bg2: e.target.value } })} />
            )}
            <Sep />
          </>
        )}

        {selectedEl && (
          <>
            <ToolBtn icon={<Copy className="h-3.5 w-3.5" />} title="Duplicate" onClick={() => duplicateElement(selectedEl.id)} />
            <ToolBtn icon={selectedEl.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} title={selectedEl.locked ? "Unlock element" : "Lock element"} active={selectedEl.locked} onClick={() => updateElement(selectedEl.id, { locked: !selectedEl.locked })} />
            <ToolBtn icon={<Trash2 className="h-3.5 w-3.5" />} title="Delete" onClick={() => { if (!selectedEl.locked) deleteElement(selectedEl.id); }} />
            <Sep />
            <ToolBtn icon={<ChevronUp className="h-3.5 w-3.5" />} title="Bring forward" onClick={() => layerOp(selectedEl.id, "forward")} />
            <ToolBtn icon={<ChevronDown className="h-3.5 w-3.5" />} title="Send back" onClick={() => layerOp(selectedEl.id, "backward")} />
            <Sep />
            <select
              title="Align element on the slide"
              className="text-xs border border-[#e8eaed] rounded px-1 py-0.5 h-7 bg-white text-[#5f6368]"
              value=""
              onChange={e => {
                const v = e.target.value; const el = selectedEl;
                if (v === "left") updateElement(el.id, { x: 0 });
                else if (v === "hcenter") updateElement(el.id, { x: Math.round((CANVAS_W - el.w) / 2) });
                else if (v === "right") updateElement(el.id, { x: CANVAS_W - el.w });
                else if (v === "top") updateElement(el.id, { y: 0 });
                else if (v === "vcenter") updateElement(el.id, { y: Math.round((CANVAS_H - el.h) / 2) });
                else if (v === "bottom") updateElement(el.id, { y: CANVAS_H - el.h });
              }}
            >
              <option value="">Align ▾</option>
              <option value="left">Left edge</option>
              <option value="hcenter">Center (horizontal)</option>
              <option value="right">Right edge</option>
              <option value="top">Top edge</option>
              <option value="vcenter">Middle (vertical)</option>
              <option value="bottom">Bottom edge</option>
            </select>
            <ToolBtn
              icon={<Grid3x3 className="h-3.5 w-3.5" />}
              title="Center on slide (both axes)"
              onClick={() => updateElement(selectedEl.id, { x: Math.round((CANVAS_W - selectedEl.w) / 2), y: Math.round((CANVAS_H - selectedEl.h) / 2) })}
            />
            <Sep />
            <span className="text-[11px] text-[#80868b] flex items-center gap-1"><RotateCcw className="h-3 w-3" /></span>
            <input
              type="number" title="Rotation (degrees)" step={15}
              className="w-14 text-xs border border-[#e8eaed] rounded px-1 py-0.5 h-7 bg-white"
              value={selectedEl.style?.rotation ?? 0}
              onChange={e => updateElement(selectedEl.id, { style: { ...selectedEl.style, rotation: Number(e.target.value) || 0 } })}
            />
            <span className="text-[11px] text-[#80868b]">°</span>
            <Sep />
            <span className="text-[11px] text-[#80868b] flex items-center gap-1"><Sparkles className="h-3 w-3" />Animate</span>
            <select
              title="Entrance animation (plays in Present mode)"
              className="text-xs border border-[#e8eaed] rounded px-1 py-0.5 h-7 bg-white"
              value={selectedEl.animIn ?? "none"}
              onChange={e => updateElement(selectedEl.id, { animIn: e.target.value as SlideElement["animIn"] })}
            >
              {ANIM_LABELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ToolBtn icon={<Grid className="h-3.5 w-3.5" />} title={snapToGrid ? "Snap to grid: on" : "Snap to grid: off"} active={snapToGrid} onClick={() => setSnapToGrid(v => !v)} />
          <Sep />
          <ToolBtn icon={<ZoomOut className="h-3.5 w-3.5" />} title="Zoom out" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} />
          <span className="text-xs text-[#5f6368] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <ToolBtn icon={<ZoomIn className="h-3.5 w-3.5" />} title="Zoom in" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} />
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {sorterView ? (
          /* ── Slide sorter / grid overview ── */
          <div className="flex-1 overflow-auto bg-[#f4f6f8] p-6">
            <div className="flex items-center gap-2 mb-4">
              <LayoutGrid className="h-4 w-4 text-[#1a56db]" />
              <span className="text-sm font-semibold text-[#202124] tracking-tight">Slide sorter</span>
              <span className="text-xs text-[#80868b]">{slides.length + " slide" + (slides.length !== 1 ? "s" : "") + " · drag to reorder · double-click to edit"}</span>
              <button onClick={() => addSlide()} className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] transition-colors">
                <Plus className="h-3.5 w-3.5" /> New slide
              </button>
              <button onClick={() => setSorterView(false)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors">
                Done
              </button>
            </div>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragIdx !== null && dropIdx !== null) reorderSlide(dragIdx, dropIdx); setDragIdx(null); setDropIdx(null); }}
            >
              {slides.map((slide, idx) => {
                const isActive = idx === activeIdx;
                const sect = sectionForIndex(idx);
                const showDropBefore = dropIdx === idx && dragIdx !== null && dragIdx !== idx;
                const showDropAfter = dropIdx === slides.length && idx === slides.length - 1 && dragIdx !== null;
                return (
                  <div key={"sort_" + slide.id} className="relative flex items-stretch gap-1">
                    {/* Drop indicator before this card */}
                    <div className={"w-1 self-stretch rounded-full transition-colors " + (showDropBefore ? "bg-[#1a56db]" : "bg-transparent")} />
                    <div
                      draggable
                      onDragStart={() => { setDragIdx(idx); setSelectedElId(null); }}
                      onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                      onDragOver={e => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2; setDropIdx(after ? idx + 1 : idx); }}
                      onClick={() => { setActiveIdx(idx); setSelectedElId(null); }}
                      onDoubleClick={() => { setActiveIdx(idx); setSelectedElId(null); setSorterView(false); }}
                      className={"group relative flex-1 min-w-0 rounded-xl bg-white border transition-all cursor-grab active:cursor-grabbing " + (isActive ? "border-[#1a56db] ring-2 ring-[#1a56db]/30 shadow-md" : "border-[#e8eaed] hover:border-[#d0d5dd] hover:shadow") + (slide.hidden ? " opacity-60" : "") + (dragIdx === idx ? " opacity-40" : "")}
                    >
                      {/* Number + section label */}
                      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
                        <span className={"inline-flex items-center justify-center h-5 min-w-5 px-1 rounded text-[10px] font-bold " + (isActive ? "bg-[#1a56db] text-white" : "bg-[#f1f3f4] text-[#5f6368]")}>{idx + 1}</span>
                        {sect && <span className="text-[10px] font-medium text-[#5f6368] truncate">{sect}</span>}
                        {slide.hidden && <span className="ml-auto px-1.5 py-0.5 rounded bg-[#5f6368] text-white text-[8px] font-semibold leading-none">Hidden</span>}
                      </div>
                      {/* 16:9 framed thumbnail */}
                      <div className="mx-2.5 mb-2.5 rounded-lg overflow-hidden border border-[#e8eaed]" style={{ aspectRatio: "16/9", position: "relative", background: slide.background }}>
                        {slide.elements.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(el => (
                          <SlideElementView key={el.id} el={el} zoom={210 / CANVAS_W} theme={theme} editMode />
                        ))}
                      </div>
                      {/* Hover actions */}
                      <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); toggleHidden(idx); }} title={slide.hidden ? "Show slide" : "Hide slide"} className="p-1 rounded bg-white border border-[#e8eaed] text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] shadow-sm">
                          {slide.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                        <button onClick={e => { e.stopPropagation(); duplicateSlide(idx); }} title="Duplicate" className="p-1 rounded bg-white border border-[#e8eaed] text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] shadow-sm">
                          <Copy className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteSlide(idx); }} title="Delete" className="p-1 rounded bg-white border border-[#e8eaed] text-[#ea4335] hover:bg-[#fce8e6] shadow-sm">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {/* Drop indicator at the very end */}
                    {showDropAfter && <div className="w-1 self-stretch rounded-full bg-[#1a56db]" />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
        <>
        {/* Slide panel */}
        <div className="w-44 border-r border-[#e8eaed] bg-[#f8f9fa] overflow-y-auto flex-shrink-0 py-2">
          {slides.map((slide, idx) => {
            // Section header rendered above the slide that starts a section
            const sectionHeader = slide.section ? (
              <div key={"sec_" + slide.id} className="flex items-center gap-1 mx-2 mt-2 mb-1 group/sec">
                <button onClick={() => toggleSection(slide.section!)} className="flex items-center gap-1 flex-1 min-w-0 text-left">
                  <ChevronRightIcon className={"h-3 w-3 text-[#80868b] transition-transform " + (collapsedSections.has(slide.section!) ? "" : "rotate-90")} />
                  <span className="text-[10px] font-semibold text-[#5f6368] truncate uppercase tracking-tight">{slide.section}</span>
                </button>
                <button onClick={() => promptSection(idx)} title="Rename section" className="opacity-0 group-hover/sec:opacity-100 text-[#80868b] hover:text-[#202124]">
                  <FolderPlus className="h-3 w-3" />
                </button>
              </div>
            ) : null;

            // If this slide is under a collapsed section, hide its thumbnail (but still show the header)
            const owningSection = sectionForIndex(idx);
            const collapsed = owningSection ? collapsedSections.has(owningSection) : false;

            const thumb = collapsed ? null : (
              <div key={slide.id} className={"group relative mx-2 mb-2 rounded cursor-pointer border-2 " + (idx === activeIdx ? "border-[#1a56db]" : "border-transparent hover:border-[#d0d5dd]") + (slide.hidden ? " opacity-50" : "")}
                onClick={() => { setActiveIdx(idx); setSelectedElId(null); }}>
                <div className="overflow-hidden rounded" style={{ width: "100%", aspectRatio: "16/9", position: "relative", background: slide.background, minHeight: 72 }}>
                  {slide.elements.map(el => (
                    <SlideElementView key={el.id} el={el} zoom={140 / CANVAS_W} theme={theme} editMode />
                  ))}
                  {slide.hidden && (
                    <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-[#5f6368] text-white text-[8px] font-semibold leading-none">Hidden</span>
                  )}
                </div>
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1 opacity-0 group-hover:opacity-100 bg-black/20 rounded-t">
                  <span className="text-[9px] text-white font-bold">{idx + 1}</span>
                  <div className="flex gap-0.5">
                    <button onClick={e => { e.stopPropagation(); toggleHidden(idx); }} title={slide.hidden ? "Show slide" : "Hide slide"} className="p-0.5 rounded bg-white/80 text-[#202124]">
                      {slide.hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); promptSection(idx); }} title="Add / rename section" className="p-0.5 rounded bg-white/80 text-[#202124]"><FolderPlus className="h-2.5 w-2.5" /></button>
                    <button onClick={e => { e.stopPropagation(); duplicateSlide(idx); }} title="Duplicate" className="p-0.5 rounded bg-white/80 text-[#202124]"><Copy className="h-2.5 w-2.5" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteSlide(idx); }} title="Delete" className="p-0.5 rounded bg-white/80 text-[#ea4335]"><Trash2 className="h-2.5 w-2.5" /></button>
                  </div>
                </div>
                {idx === activeIdx && (
                  <div className="flex justify-between px-1 mt-0.5">
                    <button onClick={e => { e.stopPropagation(); moveSlide(idx, "up"); }} disabled={idx === 0} className="text-[#80868b] disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button onClick={e => { e.stopPropagation(); moveSlide(idx, "down"); }} disabled={idx === slides.length - 1} className="text-[#80868b] disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
            );

            return (
              <div key={"wrap_" + slide.id}>
                {sectionHeader}
                {thumb}
              </div>
            );
          })}
          <button onClick={() => addSlide()} className="w-full mx-auto flex items-center justify-center gap-1 py-2 text-xs text-[#5f6368] hover:text-[#1a56db] hover:bg-[#e8f0fe] rounded-lg transition-colors">
            <Plus className="h-3.5 w-3.5" /> New slide
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-[#f4f6f8] flex flex-col items-center justify-start py-8" onClick={() => setSelectedElId(null)}>
          <div ref={canvasRef} className="relative shadow-lg"
            style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, background: activeSlide.background, flexShrink: 0,
              ...(snapToGrid ? {
                backgroundImage: "linear-gradient(to right, rgba(26,86,219,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,86,219,0.08) 1px, transparent 1px)",
                backgroundSize: (GRID * zoom) + "px " + (GRID * zoom) + "px",
              } : {}),
            }}>

            {activeSlide.elements.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(el => {
              const isSelected = el.id === selectedElId;
              const s = el.style ?? {};
              const base: React.CSSProperties = {
                position: "absolute",
                left: el.x * zoom, top: el.y * zoom,
                width: el.w * zoom, height: el.h * zoom,
                opacity: s.opacity ?? 1,
                zIndex: el.zIndex ?? 1,
                ...(s.rotation ? { transform: "rotate(" + s.rotation + "deg)" } : {}),
                outline: isSelected ? "2px solid #1a56db" : "none",
                cursor: el.locked ? "default" : "move",
              };

              if (el.type === "text") {
                return (
                  <div key={el.id} style={base} onMouseDown={e => onElMouseDown(e, el.id)} onClick={e => e.stopPropagation()}>
                    {isSelected ? (
                      <textarea
                        autoFocus
                        className="w-full h-full resize-none outline-none bg-transparent"
                        style={{ fontSize: (s.fontSize ?? 18) * zoom, fontWeight: s.bold ? "bold" : "normal", fontStyle: s.italic ? "italic" : "normal", color: s.color ?? theme.text, textAlign: s.align ?? "left", lineHeight: 1.4 }}
                        value={el.content ?? ""}
                        onChange={e2 => updateElement(el.id, { content: e2.target.value })}
                        onClick={e2 => e2.stopPropagation()}
                        onKeyDown={e2 => {
                          if (e2.ctrlKey || e2.metaKey) {
                            if (e2.key === "b" || e2.key === "B") { e2.preventDefault(); updateElement(el.id, { style: { ...el.style, bold: !s.bold } }); }
                            if (e2.key === "i" || e2.key === "I") { e2.preventDefault(); updateElement(el.id, { style: { ...el.style, italic: !s.italic } }); }
                            if (e2.key === "u" || e2.key === "U") { e2.preventDefault(); updateElement(el.id, { style: { ...el.style, underline: !s.underline } }); }
                          }
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: VALIGN_JUSTIFY[s.valign ?? "top"], fontSize: (s.fontSize ?? 18) * zoom, fontWeight: s.bold ? "bold" : "normal", fontStyle: s.italic ? "italic" : "normal", textDecoration: s.underline ? "underline" : "none", color: s.color ?? theme.text, textAlign: s.align ?? "left", whiteSpace: "pre-wrap", lineHeight: 1.4, width: "100%", height: "100%", overflow: "hidden" }}>
                        {el.content}
                      </div>
                    )}
                    {isSelected && <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#1a56db] cursor-se-resize" onMouseDown={e => onResizeMouseDown(e, el.id)} />}
                  </div>
                );
              }

              return (
                <div key={el.id} style={base} onMouseDown={e => onElMouseDown(e, el.id)} onClick={e => e.stopPropagation()}>
                  <SlideElementView el={el} zoom={zoom} theme={theme} editMode />
                  {isSelected && <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#1a56db] cursor-se-resize z-10" onMouseDown={e => onResizeMouseDown(e, el.id)} />}
                </div>
              );
            })}

            {/* Master logo overlay */}
            {masterLogo && (
              <img src={masterLogo} alt="" className="absolute top-2 right-3 pointer-events-none select-none" style={{ maxHeight: "12%", maxWidth: "22%", objectFit: "contain" }} />
            )}
            {/* Deck footer overlay (Feature 2) */}
            {showFooter && footerText.trim() && (
              <div className="absolute bottom-2 left-3 right-16 text-[10px] font-medium select-none pointer-events-none truncate" style={{ color: "#80868b", fontSize: 10 * zoom }}>
                {footerText}
              </div>
            )}
            {/* Slide number overlay (Feature 2) */}
            {showNumbers && (
              <div className="absolute bottom-2 right-3 font-medium select-none pointer-events-none" style={{ color: "#80868b", fontSize: 10 * zoom }}>
                {(activeIdx + 1) + " / " + slides.length}
              </div>
            )}
          </div>

          {/* Speaker notes — always visible below canvas */}
          <div className="mt-4 flex-shrink-0" style={{ width: CANVAS_W * zoom }}>
            <p className="text-[11px] font-medium text-[#5f6368] mb-1">Speaker notes</p>
            <textarea
              className="w-full px-3 py-2 text-sm text-[#202124] placeholder:text-[#80868b] bg-[#f8f9fa] border border-[#e8eaed] rounded-lg resize-none h-24 focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors"
              placeholder="Click to add speaker notes…"
              value={activeSlide.notes}
              onChange={e => updateSlide({ notes: e.target.value })}
            />
          </div>
        </div>
        </>
        )}

        {/* AI panel */}
        {showAI && (
          <div className="w-72 border-l border-[#e8eaed] bg-white flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaed]">
              <span className="text-sm font-semibold text-[#202124] flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-600" /> AI Slides</span>
              <button onClick={() => setShowAI(false)} className="text-[#80868b] hover:text-[#202124]"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex border-b border-[#e8eaed]">
              {(["generate","rewrite","notes","design"] as const).map(m => (
                <button key={m} onClick={() => setAIMode(m)}
                  className={`flex-1 py-1.5 text-[10px] font-medium capitalize ${aiMode === m ? "text-purple-600 border-b-2 border-purple-600" : "text-[#5f6368] hover:text-[#202124]"}`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="flex-1 p-4 space-y-3">
              {(aiMode === "generate" || aiMode === "design") && (
                <textarea className="w-full px-3 py-2 text-xs bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg resize-none focus:outline-none focus:border-[#1a56db]/60"
                  rows={3}
                  placeholder={aiMode === "generate" ? "What is this presentation about?" : "Describe the design look you want…"}
                  value={aiPrompt} onChange={e => setAIPrompt(e.target.value)} />
              )}
              <button onClick={() => void runAI()} disabled={aiLoading}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiLoading ? "Generating…" : aiMode === "generate" ? "Generate slides" : aiMode === "notes" ? "Generate notes" : aiMode === "rewrite" ? "Rewrite slide" : "Suggest design"}
              </button>
              <p className="text-[11px] text-[#80868b]">
                {aiMode === "generate" && "Creates a full slide deck from your description."}
                {aiMode === "rewrite" && "Rewrites the current slide text to be more impactful."}
                {aiMode === "notes" && "Generates speaker notes for the active slide."}
                {aiMode === "design" && "Suggests design improvements for your slide."}
              </p>
              <div className="border-t border-[#e8eaed] pt-3">
                <p className="text-[10px] font-semibold text-[#5f6368] mb-2">QUICK INSERT</p>
                {SLIDE_TEMPLATES.map(t => (
                  <button key={t.name} onClick={() => { addSlide(t); setShowTemplates(false); }}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[#f1f3f4] text-[#5f6368] hover:text-[#202124]">
                    + {t.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-t border-[#e8eaed] bg-white text-[11px] text-[#5f6368]">
        <button onClick={() => setShowNotes(v => !v)} className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${showNotes ? "text-[#1a56db] bg-[#e8f0fe]" : "hover:bg-[#f1f3f4]"}`}>
          <FileText className="h-3.5 w-3.5" /> Speaker notes
        </button>
        <button onClick={() => addSlide()} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#f1f3f4]">
          <Plus className="h-3.5 w-3.5" /> Add slide
        </button>
        <label className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#f1f3f4] cursor-pointer">
          <Upload className="h-3.5 w-3.5" /> Import
          <input type="file" accept=".pptx" className="hidden" onChange={e => void importFile(e)} />
        </label>
        <span className="ml-auto">{slides.length} slide{slides.length !== 1 ? "s" : ""}</span>

        {/* Background colour */}
        <div className="flex items-center gap-1">
          <span>Background:</span>
          <input type="color" className="h-5 w-5 cursor-pointer border border-[#e8eaed] rounded" value={activeSlide.background.includes("gradient") ? "#1a1a2e" : activeSlide.background} onChange={e => updateSlide({ background: e.target.value })} />
        </div>

        {/* Transition */}
        <span className="flex items-center gap-1"><Play className="h-3 w-3" />Transition:</span>
        <select className="text-xs border border-[#e8eaed] rounded px-1 py-0.5 bg-white" value={activeSlide.transition ?? "none"} onChange={e => updateSlide({ transition: e.target.value as Slide["transition"] })}>
          <option value="none">None</option>
          <option value="fade">Fade</option>
          <option value="slide">Push</option>
          <option value="zoom">Zoom</option>
          <option value="cover">Cover</option>
          <option value="morph">Morph</option>
        </select>
      </div>

      {/* Themes overlay */}
      {showThemes && (
        <Modal title="Themes" onClose={() => setShowThemes(false)}>
          <div className="grid grid-cols-2 gap-3 p-4">
            {THEMES.map(t => (
              <button key={t.id} onClick={() => applyTheme(t)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all hover:shadow ${theme.id === t.id ? "border-[#1a56db]" : "border-[#e8eaed]"}`}>
                <div className="h-10 w-10 rounded-lg flex-shrink-0" style={{ background: t.bg }} />
                <div>
                  <p className="text-xs font-semibold text-[#202124]">{t.name}</p>
                  <div className="flex gap-1 mt-1">
                    {[t.accent, t.text, t.secondary].map((c, i) => <div key={i} className="h-3 w-3 rounded-full" style={{ background: c }} />)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Templates overlay */}
      {showTemplates && (
        <Modal title="Slide Templates" onClose={() => setShowTemplates(false)}>
          <div className="grid grid-cols-2 gap-3 p-4">
            {SLIDE_TEMPLATES.map(t => (
              <button key={t.name} onClick={() => { addSlide(t); setShowTemplates(false); }}
                className="flex flex-col gap-2 p-3 rounded-xl border border-[#e8eaed] hover:border-[#1a56db]/40 hover:shadow text-left transition-all">
                <div className="w-full rounded" style={{ aspectRatio: "16/9", background: theme.bg, position: "relative", overflow: "hidden" }}>
                  {t.elements.map((el, i) => (
                    <SlideElementView key={i} el={{ ...el, id: `preview_${i}` }} zoom={200 / CANVAS_W} theme={theme} />
                  ))}
                </div>
                <p className="text-xs font-medium text-[#202124]">{t.name}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Layout overlay */}
      {showLayout && (
        <Modal title="Layout" onClose={() => setShowLayout(false)}>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] font-medium text-[#5f6368] mb-2">Apply a layout to the current slide</p>
              <div className="grid grid-cols-2 gap-3">
                {LAYOUT_PRESETS.map(preset => (
                  <button key={preset.name} onClick={() => applyLayout(preset)}
                    className="flex flex-col gap-2 p-3 rounded-xl border border-[#e8eaed] hover:border-[#1a56db]/40 hover:shadow text-left transition-all">
                    <div className="w-full rounded" style={{ aspectRatio: "16/9", background: activeSlide.background, position: "relative", overflow: "hidden" }}>
                      {preset.build().map((el, i) => (
                        <SlideElementView key={i} el={{ ...el, id: "preview_" + i }} zoom={200 / CANVAS_W} theme={theme} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-[#202124]">{preset.name}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-[#e8eaed] pt-4">
              <p className="text-[11px] font-medium text-[#5f6368] mb-2">Master background</p>
              <button onClick={applyBackgroundToAll}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7] transition-colors">
                <Images className="h-3.5 w-3.5" /> Apply this slide&apos;s background to all
              </button>
              <p className="text-[11px] text-[#80868b] mt-2">Sets every slide&apos;s background to match the current slide.</p>
            </div>
          </div>
        </Modal>
      )}

      {/* Find & Replace overlay (Feature 1) */}
      {showFindReplace && (
        <Modal title="Find & Replace" onClose={() => setShowFindReplace(false)}>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[#5f6368] mb-1">Find</label>
              <input
                autoFocus
                className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors"
                placeholder="Text to find…"
                value={findText}
                onChange={e => { setFindText(e.target.value); findCursor.current = { slide: activeIdx, el: -1, occ: -1 }; }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); findNext(); } }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#5f6368] mb-1">Replace with</label>
              <input
                className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors"
                placeholder="Replacement text…"
                value={replaceText}
                onChange={e => setReplaceText(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#5f6368] select-none cursor-pointer">
              <input type="checkbox" className="accent-[#1a56db]" checked={matchCase} onChange={e => { setMatchCase(e.target.checked); findCursor.current = { slide: activeIdx, el: -1, occ: -1 }; }} />
              Match case
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={findNext}
                className="px-3 py-1.5 text-[13px] font-medium rounded-md text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] transition-colors border border-[#e8eaed]">
                Find next
              </button>
              <button onClick={replaceCurrent}
                className="px-3 py-1.5 text-[13px] font-medium rounded-md text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] transition-colors border border-[#e8eaed]">
                Replace
              </button>
              <button onClick={replaceAll}
                className="ml-auto px-4 py-2 text-sm font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors">
                Replace all
              </button>
            </div>
            <p className="text-[11px] text-[#80868b]">Searches text boxes, code blocks and table cells across every slide.</p>
          </div>
        </Modal>
      )}

      {/* Deck settings: slide numbers & footer (Feature 2) */}
      {showDeckSettings && (
        <Modal title="Slide numbers & footer" onClose={() => { setShowDeckSettings(false); scheduleSave(slides, title); }}>
          <div className="p-4 space-y-4">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-[#202124]">Show slide numbers</span>
              <input type="checkbox" className="accent-[#1a56db] h-4 w-4" checked={showNumbers} onChange={e => setShowNumbers(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-[#202124]">Show footer text</span>
              <input type="checkbox" className="accent-[#1a56db] h-4 w-4" checked={showFooter} onChange={e => setShowFooter(e.target.checked)} />
            </label>
            <div>
              <label className="block text-[11px] font-medium text-[#5f6368] mb-1">Footer text</label>
              <input
                className="w-full px-3 py-2 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors disabled:opacity-50"
                placeholder="e.g. Cybersage — Confidential"
                value={footerText}
                disabled={!showFooter}
                onChange={e => setFooterText(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#5f6368] mb-1">Master logo (shown on every slide)</label>
              <div className="flex items-center gap-2">
                {masterLogo && <img src={masterLogo} alt="" className="h-8 w-12 object-contain border border-[#e8eaed] rounded bg-white" />}
                <label className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#e8f0fe] text-[#1a56db] hover:bg-[#d2e3fc] cursor-pointer">
                  {masterLogo ? "Replace" : "Upload logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 2 * 1024 * 1024) { toast.error("Logo too large (max 2MB)"); return; }
                    const reader = new FileReader();
                    reader.onload = () => setMasterLogo(String(reader.result));
                    reader.readAsDataURL(f);
                    e.currentTarget.value = "";
                  }} />
                </label>
                {masterLogo && <button onClick={() => setMasterLogo("")} className="px-2 py-1.5 text-xs text-[#5f6368] hover:text-[#ea4335]">Remove</button>}
              </div>
            </div>
            <p className="text-[11px] text-[#80868b]">Applied to every slide in the editor and in presenter mode.</p>
          </div>
        </Modal>
      )}

      {showShare && <DocShareModal docId={presId} docType="pres" onClose={() => setShowShare(false)} />}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ToolBtn({ icon, title, active, onClick }: { icon: React.ReactNode; title: string; active?: boolean; onClick?: () => void }) {
  return (
    <button title={title} onClick={onClick}
      className={`flex items-center justify-center h-7 w-7 rounded text-sm transition-colors ${active ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
      {icon}
    </button>
  );
}

function Sep() { return <div className="w-px h-5 bg-[#e8eaed] mx-0.5" />; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-xl w-full max-w-md max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaed] sticky top-0 bg-white">
          <span className="text-sm font-semibold text-[#202124]">{title}</span>
          <button onClick={onClose} className="text-[#80868b] hover:text-[#202124]"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
