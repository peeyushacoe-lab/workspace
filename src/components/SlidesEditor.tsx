"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus, Trash2, Download, Upload, Users, X, Loader2,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  ChevronUp, ChevronDown, Copy, Share2, Type, Square, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DocShareModal } from "./DocShareModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type ElementStyle = {
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  bg?: string;
  align?: "left" | "center" | "right";
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
};

type SlideElement = {
  id: string;
  type: "text" | "shape" | "image";
  x: number; y: number; w: number; h: number;
  content?: string;
  src?: string; // for image
  shapeType?: "rect" | "circle" | "triangle";
  style?: ElementStyle;
};

type Slide = {
  id: string;
  background: string;
  elements: SlideElement[];
};

type PresentationDoc = {
  slides: Slide[];
  theme: string;
  slideSize: { w: number; h: number };
};

const CANVAS_W = 960;
const CANVAS_H = 540;
const PANEL_W = 180;

// ─── Collab hook ──────────────────────────────────────────────────────────────

function useSlidesCollab(presId: string | null, onRemoteUpdate: (data: unknown) => void) {
  const [collaborators, setCollaborators] = useState<{ userId: string; name: string; color: string }[]>([]);

  useEffect(() => {
    if (!presId) return;
    const es = new EventSource(`/api/slides/${presId}/collab`);
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
        if (msg.type === "PRES_UPDATE") onRemoteUpdate(msg.update);
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [presId, onRemoteUpdate]);

  const broadcast = useCallback((update: unknown) => {
    if (!presId) return;
    fetch(`/api/slides/${presId}/collab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "PRES_UPDATE", update }),
    }).catch(() => {});
  }, [presId]);

  return { collaborators, broadcast };
}

// ─── PPTX import (client-side, JSZip + XML text) ─────────────────────────────

async function importPPTX(file: File): Promise<Slide[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JSZip = (await import("jszip" as any)).default as any;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slides: Slide[] = [];
  const slideFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0");
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0");
      return na - nb;
    });

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("string");
    // Extract all <a:t> text nodes
    const textMatches = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1].trim()).filter(Boolean);
    // Try to extract background color
    const bgMatch = xml.match(/srgbClr val="([0-9A-Fa-f]{6})"/);
    const bg = bgMatch ? `#${bgMatch[1]}` : "#ffffff";

    const elements: SlideElement[] = [];

    // Group text runs into paragraphs (heuristic: each <a:p> block becomes one element)
    const paraMatches = [...xml.matchAll(/<a:p[^>]*>([\s\S]*?)<\/a:p>/g)];
    let yOffset = 80;
    let elIdx = 0;

    for (const para of paraMatches) {
      const paraXml = para[1];
      const texts = [...paraXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("");
      if (!texts.trim()) continue;

      // Font size
      const szMatch = paraXml.match(/sz="(\d+)"/);
      const fontSize = szMatch ? Math.round(parseInt(szMatch[1]) / 100) : 18;
      // Bold
      const isBold = /<a:rPr[^>]*b="1"/.test(paraXml);

      elements.push({
        id: `el-${i}-${elIdx++}`,
        type: "text",
        x: 60, y: yOffset, w: CANVAS_W - 120, h: Math.max(40, fontSize * 2),
        content: texts,
        style: { fontSize: Math.min(Math.max(fontSize, 12), 72), bold: isBold, color: "#202124", align: "left" },
      });
      yOffset += Math.max(40, fontSize * 2) + 8;
      if (yOffset > CANVAS_H - 40) break;
    }

    // If no elements extracted, add a placeholder
    if (elements.length === 0 && textMatches.length > 0) {
      elements.push({
        id: `el-${i}-0`, type: "text",
        x: 60, y: 80, w: CANVAS_W - 120, h: 60,
        content: textMatches.join(" "),
        style: { fontSize: 24, bold: false, color: "#202124", align: "left" },
      });
    }

    slides.push({ id: `imported-${i}`, background: bg, elements });
  }

  return slides.length ? slides : [{
    id: "slide-1", background: "#ffffff",
    elements: [{ id: "el-0", type: "text", x: 80, y: 200, w: 760, h: 100,
      content: "Imported Presentation", style: { fontSize: 36, bold: true, color: "#202124", align: "center" } }],
  }];
}

// ─── Slide thumbnail ──────────────────────────────────────────────────────────

function SlideThumbnail({ slide, index, isActive, onClick }: {
  slide: Slide; index: number; isActive: boolean; onClick: () => void;
}) {
  const scale = PANEL_W / CANVAS_W;
  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer rounded border-2 overflow-hidden flex-shrink-0 transition-all
        ${isActive ? "border-[#1a56db]" : "border-[#e8eaed] hover:border-[#1a56db]/50"}`}
      style={{ width: PANEL_W, height: PANEL_W * (CANVAS_H / CANVAS_W) }}
    >
      <div style={{ width: CANVAS_W, height: CANVAS_H, background: slide.background, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {slide.elements.map((el) => (
          <ElementRenderer key={el.id} el={el} selected={false} onSelect={() => {}} editing={false} onEdit={() => {}} />
        ))}
      </div>
      <div className="absolute bottom-0.5 right-1 text-[9px] text-[#80868b]">{index + 1}</div>
    </div>
  );
}

// ─── Element renderer ─────────────────────────────────────────────────────────

function ElementRenderer({ el, selected, onSelect, editing, onEdit, onUpdate }: {
  el: SlideElement;
  selected: boolean;
  onSelect: () => void;
  editing: boolean;
  onEdit: () => void;
  onUpdate?: (partial: Partial<SlideElement>) => void;
}) {
  const s = el.style ?? {};
  const base: React.CSSProperties = {
    position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
    outline: selected ? "2px solid #1a56db" : "none",
    cursor: "move",
    boxSizing: "border-box",
    opacity: s.opacity ?? 1,
  };

  if (el.type === "text") {
    return (
      <div style={base} onClick={(e) => { e.stopPropagation(); onSelect(); }} onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}>
        {editing ? (
          <textarea
            autoFocus
            defaultValue={el.content ?? ""}
            className="w-full h-full resize-none bg-transparent outline-none border-none p-1"
            style={{ fontSize: s.fontSize ?? 18, fontWeight: s.bold ? "bold" : "normal", fontStyle: s.italic ? "italic" : "normal",
              textDecoration: s.underline ? "underline" : "none", color: s.color ?? "#202124",
              textAlign: s.align ?? "left", lineHeight: 1.3 }}
            onBlur={(e) => onUpdate?.({ content: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLTextAreaElement).blur()}
          />
        ) : (
          <div style={{ fontSize: s.fontSize ?? 18, fontWeight: s.bold ? "bold" : "normal", fontStyle: s.italic ? "italic" : "normal",
            textDecoration: s.underline ? "underline" : "none", color: s.color ?? "#202124",
            textAlign: s.align ?? "left", lineHeight: 1.3, padding: 4, height: "100%", overflow: "hidden",
            backgroundColor: s.bg ?? "transparent" }}>
            {el.content || <span style={{ color: "#80868b" }}>Click to add text</span>}
          </div>
        )}
      </div>
    );
  }

  if (el.type === "shape") {
    const shapeStyle: React.CSSProperties = {
      ...base,
      backgroundColor: s.bg ?? "#e8f0fe",
      border: `${s.borderWidth ?? 1}px solid ${s.borderColor ?? "#1a56db"}`,
      borderRadius: el.shapeType === "circle" ? "50%" : 0,
    };
    return <div style={shapeStyle} onClick={(e) => { e.stopPropagation(); onSelect(); }} />;
  }

  if (el.type === "image" && el.src) {
    return (
      <div style={base} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }

  return null;
}

// ─── Drag/resize handle ───────────────────────────────────────────────────────

function DragResizeWrapper({ el, onUpdate, children }: {
  el: SlideElement;
  onUpdate: (partial: Partial<SlideElement>) => void;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const startRef = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.resize) return;
    e.preventDefault();
    setDragging(true);
    startRef.current = { mx: e.clientX, my: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h };
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startRef.current.mx;
      const dy = ev.clientY - startRef.current.my;
      onUpdate({ x: Math.max(0, startRef.current.x + dx), y: Math.max(0, startRef.current.y + dy) });
    };
    const onUp = () => { setDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onResizeDown(e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    setResizing(true);
    startRef.current = { mx: e.clientX, my: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h };
    const onMove = (ev: MouseEvent) => {
      const dw = ev.clientX - startRef.current.mx;
      const dh = ev.clientY - startRef.current.my;
      onUpdate({ w: Math.max(40, startRef.current.w + dw), h: Math.max(20, startRef.current.h + dh) });
    };
    const onUp = () => { setResizing(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div onMouseDown={onMouseDown} style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, cursor: dragging ? "grabbing" : "grab" }}>
      {children}
      <div data-resize="1" onMouseDown={onResizeDown}
        style={{ position: "absolute", right: -4, bottom: -4, width: 8, height: 8, background: "#1a56db", borderRadius: 1, cursor: "se-resize", zIndex: 10 }} />
    </div>
  );
}

// ─── SlidesEditor ──────────────────────────────────────────────────────────────

export function SlidesEditor({ presId }: { presId: string }) {
  const [doc, setDoc] = useState<PresentationDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Untitled Presentation");
  const [editingTitle, setEditingTitle] = useState(false);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [editingElId, setEditingElId] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/slides/${presId}`)
      .then((r) => r.json())
      .then((data: { title?: string; content?: string }) => {
        setTitle(data.title ?? "Untitled Presentation");
        if (data.content) {
          const parsed = JSON.parse(data.content) as PresentationDoc;
          setDoc(parsed);
        }
      })
      .catch(() => toast.error("Failed to load presentation"))
      .finally(() => setLoading(false));
  }, [presId]);

  // Collab
  const handleRemoteUpdate = useCallback((update: unknown) => {
    if (!update || typeof update !== "object") return;
    const u = update as { slideIdx?: number; elements?: SlideElement[] };
    if (u.slideIdx !== undefined && u.elements) {
      setDoc((prev) => {
        if (!prev) return prev;
        const slides = prev.slides.map((s, i) => i === u.slideIdx ? { ...s, elements: u.elements! } : s);
        return { ...prev, slides };
      });
    }
  }, []);

  const { collaborators, broadcast } = useSlidesCollab(presId, handleRemoteUpdate);

  function scheduleSave(newDoc: PresentationDoc) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`/api/slides/${presId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(newDoc) }),
      }).catch(() => {});
    }, 1500);
  }

  const activeSlide = doc?.slides[activeSlideIdx] ?? null;
  const selectedEl = activeSlide?.elements.find((e) => e.id === selectedElId) ?? null;

  function updateSlide(idx: number, partial: Partial<Slide>) {
    setDoc((prev) => {
      if (!prev) return prev;
      const slides = prev.slides.map((s, i) => i === idx ? { ...s, ...partial } : s);
      const newDoc = { ...prev, slides };
      scheduleSave(newDoc);
      return newDoc;
    });
  }

  function updateElement(slideIdx: number, elId: string, partial: Partial<SlideElement>) {
    setDoc((prev) => {
      if (!prev) return prev;
      const slide = prev.slides[slideIdx];
      if (!slide) return prev;
      const elements = slide.elements.map((e) => e.id === elId ? { ...e, ...partial } : e);
      const slides = prev.slides.map((s, i) => i === slideIdx ? { ...s, elements } : s);
      const newDoc = { ...prev, slides };
      scheduleSave(newDoc);
      broadcast({ slideIdx, elements });
      return newDoc;
    });
  }

  function updateSelectedStyle(stylePartial: Partial<ElementStyle>) {
    if (!selectedEl) return;
    const newStyle = { ...(selectedEl.style ?? {}), ...stylePartial };
    updateElement(activeSlideIdx, selectedEl.id, { style: newStyle });
  }

  // Slide management
  function addSlide() {
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      background: "#ffffff",
      elements: [
        { id: `el-${Date.now()}-0`, type: "text", x: 80, y: 200, w: 760, h: 100,
          content: "New Slide", style: { fontSize: 36, bold: true, color: "#202124", align: "center" } },
      ],
    };
    setDoc((prev) => {
      if (!prev) return prev;
      const slides = [...prev.slides, newSlide];
      const newDoc = { ...prev, slides };
      scheduleSave(newDoc);
      return newDoc;
    });
    setActiveSlideIdx((doc?.slides.length ?? 0));
  }

  function duplicateSlide(idx: number) {
    setDoc((prev) => {
      if (!prev) return prev;
      const orig = prev.slides[idx];
      const copy: Slide = { ...orig, id: `slide-${Date.now()}`, elements: orig.elements.map((e) => ({ ...e, id: `el-${Date.now()}-${e.id}` })) };
      const slides = [...prev.slides.slice(0, idx + 1), copy, ...prev.slides.slice(idx + 1)];
      const newDoc = { ...prev, slides };
      scheduleSave(newDoc);
      return newDoc;
    });
  }

  function deleteSlide(idx: number) {
    if ((doc?.slides.length ?? 0) <= 1) { toast.error("Cannot delete the only slide"); return; }
    setDoc((prev) => {
      if (!prev) return prev;
      const slides = prev.slides.filter((_, i) => i !== idx);
      const newDoc = { ...prev, slides };
      scheduleSave(newDoc);
      return newDoc;
    });
    setActiveSlideIdx((i) => Math.min(i, (doc?.slides.length ?? 1) - 2));
  }

  function moveSlide(from: number, to: number) {
    if (to < 0 || to >= (doc?.slides.length ?? 0)) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const slides = [...prev.slides];
      const [s] = slides.splice(from, 1);
      slides.splice(to, 0, s);
      const newDoc = { ...prev, slides };
      scheduleSave(newDoc);
      return newDoc;
    });
    setActiveSlideIdx(to);
  }

  // Element management
  function addElement(type: SlideElement["type"]) {
    const id = `el-${Date.now()}`;
    let el: SlideElement;
    if (type === "text") {
      el = { id, type, x: 100, y: 100, w: 400, h: 80, content: "Text", style: { fontSize: 24, color: "#202124", align: "left" } };
    } else if (type === "shape") {
      el = { id, type, x: 200, y: 150, w: 200, h: 150, shapeType: "rect", style: { bg: "#e8f0fe", borderColor: "#1a56db", borderWidth: 2 } };
    } else {
      el = { id, type: "image", x: 100, y: 100, w: 300, h: 200 };
    }
    const elements = [...(activeSlide?.elements ?? []), el];
    updateSlide(activeSlideIdx, { elements });
    setSelectedElId(id);
  }

  function deleteSelected() {
    if (!selectedElId) return;
    const elements = (activeSlide?.elements ?? []).filter((e) => e.id !== selectedElId);
    updateSlide(activeSlideIdx, { elements });
    setSelectedElId(null);
  }

  // Title save
  function saveTitle() {
    setEditingTitle(false);
    fetch(`/api/slides/${presId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }

  // PPTX import
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.loading("Importing presentation…", { id: "pptx-import" });
      const slides = await importPPTX(file);
      const newDoc: PresentationDoc = { slides, theme: "light", slideSize: { w: CANVAS_W, h: CANVAS_H } };
      setDoc(newDoc);
      setActiveSlideIdx(0);
      scheduleSave(newDoc);
      toast.success(`Imported ${slides.length} slide(s)`, { id: "pptx-import" });
    } catch {
      toast.error("Failed to import presentation", { id: "pptx-import" });
    }
    e.target.value = "";
  }

  // Export as JSON (real PPTX generation is server-side — offer download of JSON for now)
  function exportPresentation() {
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded as JSON. PPTX export coming soon.");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#1a56db]" />
      </div>
    );
  }
  if (!doc || !activeSlide) return null;

  const selStyle = selectedEl?.style ?? {};

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#e8eaed] bg-white flex-shrink-0">
        {editingTitle ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            className="text-sm font-semibold text-[#202124] bg-transparent border-b border-[#1a56db] outline-none px-1" />
        ) : (
          <span className="text-sm font-semibold text-[#202124] cursor-pointer hover:underline"
            onDoubleClick={() => setEditingTitle(true)}>
            {title}
          </span>
        )}

        <div className="flex-1" />

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
          <Upload className="w-3.5 h-3.5" /> Import PPTX
        </button>
        <button onClick={exportPresentation}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded-md transition-colors">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
        <button onClick={() => setShowShare(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1a56db] hover:bg-[#1648c7] rounded-md transition-colors">
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        <input ref={fileInputRef} type="file" accept=".pptx,.ppt" className="hidden" onChange={handleImport} />
      </div>

      {/* ── Formatting toolbar ── */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-[#e8eaed] bg-white flex-shrink-0">
        {/* Insert buttons */}
        <button onClick={() => addElement("text")}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded transition-colors">
          <Type className="w-3 h-3" /> Text
        </button>
        <button onClick={() => addElement("shape")}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] rounded transition-colors">
          <Square className="w-3 h-3" /> Shape
        </button>

        {selectedEl && (
          <>
            <div className="w-px h-4 bg-[#e8eaed] mx-1" />
            {/* Text formatting — only for text elements */}
            {selectedEl.type === "text" && (
              <>
                <button onClick={() => updateSelectedStyle({ bold: !selStyle.bold })}
                  className={`p-1.5 rounded hover:bg-[#f1f3f4] ${selStyle.bold ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => updateSelectedStyle({ italic: !selStyle.italic })}
                  className={`p-1.5 rounded hover:bg-[#f1f3f4] ${selStyle.italic ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => updateSelectedStyle({ underline: !selStyle.underline })}
                  className={`p-1.5 rounded hover:bg-[#f1f3f4] ${selStyle.underline ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
                  <Underline className="w-3.5 h-3.5" />
                </button>
                {(["left","center","right"] as const).map((a) => (
                  <button key={a} onClick={() => updateSelectedStyle({ align: a })}
                    className={`p-1.5 rounded hover:bg-[#f1f3f4] ${selStyle.align === a ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368]"}`}>
                    {a === "left" ? <AlignLeft className="w-3.5 h-3.5" /> : a === "center" ? <AlignCenter className="w-3.5 h-3.5" /> : <AlignRight className="w-3.5 h-3.5" />}
                  </button>
                ))}
                <input type="number" min={8} max={120} value={selStyle.fontSize ?? 18}
                  onChange={(e) => updateSelectedStyle({ fontSize: parseInt(e.target.value) })}
                  className="w-12 text-xs text-center bg-[#f1f3f4] border border-[#e8eaed] rounded px-1 py-0.5 outline-none" />
                <label className="flex items-center gap-0.5 text-[10px] text-[#5f6368]">
                  Text <input type="color" value={selStyle.color ?? "#202124"} onChange={(e) => updateSelectedStyle({ color: e.target.value })} className="w-5 h-5 rounded cursor-pointer" />
                </label>
              </>
            )}
            <label className="flex items-center gap-0.5 text-[10px] text-[#5f6368]">
              Fill <input type="color" value={selStyle.bg ?? "#ffffff"} onChange={(e) => updateSelectedStyle({ bg: e.target.value })} className="w-5 h-5 rounded cursor-pointer" />
            </label>
            <div className="w-px h-4 bg-[#e8eaed] mx-1" />
            <button onClick={deleteSelected} className="p-1.5 rounded hover:bg-[#f1f3f4] text-[#5f6368] hover:text-[#ea4335]">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* Slide background */}
        <div className="w-px h-4 bg-[#e8eaed] mx-1" />
        <label className="flex items-center gap-1 text-[10px] text-[#5f6368] cursor-pointer">
          BG <input ref={bgInputRef} type="color" value={activeSlide.background}
            onChange={(e) => updateSlide(activeSlideIdx, { background: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer" />
        </label>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Slide panel */}
        <div className="flex flex-col gap-2 p-2 border-r border-[#e8eaed] bg-[#f8f9fa] overflow-y-auto flex-shrink-0" style={{ width: PANEL_W + 32 }}>
          {doc.slides.map((slide, idx) => (
            <div key={slide.id} className="group relative">
              <SlideThumbnail slide={slide} index={idx} isActive={idx === activeSlideIdx} onClick={() => { setActiveSlideIdx(idx); setSelectedElId(null); }} />
              <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
                <button onClick={() => moveSlide(idx, idx - 1)} disabled={idx === 0} className="w-5 h-5 rounded bg-white/90 flex items-center justify-center text-[#5f6368] hover:text-[#202124] disabled:opacity-30">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button onClick={() => moveSlide(idx, idx + 1)} disabled={idx === doc.slides.length - 1} className="w-5 h-5 rounded bg-white/90 flex items-center justify-center text-[#5f6368] hover:text-[#202124] disabled:opacity-30">
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button onClick={() => duplicateSlide(idx)} className="w-5 h-5 rounded bg-white/90 flex items-center justify-center text-[#5f6368] hover:text-[#202124]">
                  <Copy className="w-3 h-3" />
                </button>
                <button onClick={() => deleteSlide(idx)} className="w-5 h-5 rounded bg-white/90 flex items-center justify-center text-[#5f6368] hover:text-[#ea4335]">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={addSlide}
            className="flex items-center justify-center gap-1 w-full py-2 text-xs text-[#5f6368] hover:bg-[#e8eaed] rounded border border-dashed border-[#e8eaed] transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Slide
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-[#f1f3f4] flex items-center justify-center p-8">
          <div
            className="relative shadow-xl flex-shrink-0"
            style={{ width: CANVAS_W, height: CANVAS_H, background: activeSlide.background }}
            onClick={() => { setSelectedElId(null); setEditingElId(null); }}
          >
            {activeSlide.elements.map((el) => (
              <DragResizeWrapper key={el.id} el={el} onUpdate={(partial) => updateElement(activeSlideIdx, el.id, partial)}>
                <ElementRenderer
                  el={el}
                  selected={selectedElId === el.id}
                  onSelect={() => setSelectedElId(el.id)}
                  editing={editingElId === el.id}
                  onEdit={() => setEditingElId(el.id)}
                  onUpdate={(partial) => updateElement(activeSlideIdx, el.id, partial)}
                />
              </DragResizeWrapper>
            ))}
          </div>
        </div>
      </div>

      {/* Slide count footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-[#e8eaed] bg-[#f8f9fa] flex-shrink-0">
        <span className="text-xs text-[#80868b]">
          Slide {activeSlideIdx + 1} of {doc.slides.length}
        </span>
        <span className="text-xs text-[#80868b]">960 × 540</span>
      </div>

      {showShare && <DocShareModal docId={presId} docType="pres" onClose={() => setShowShare(false)} />}
    </div>
  );
}
