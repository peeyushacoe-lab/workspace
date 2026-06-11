"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Eraser, Square, Circle, Minus, Trash2, Download, Users } from "lucide-react";
import { PageHeader } from "@/components/Shell";

type Tool = "pen" | "eraser" | "line" | "rect" | "ellipse";
type DrawEvent = { type: "draw" | "clear"; tool: Tool; color: string; size: number; points?: [number, number][]; from?: [number, number]; to?: [number, number] };

const COLORS = ["#00d2ff", "#7dd8f5", "#dfe1f6", "#ff4d6d", "#ffd166", "#06d6a0", "#ffffff", "#000000"];

export default function WhiteboardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#00d2ff");
  const [size, setSize] = useState(3);
  const [drawing, setDrawing] = useState(false);
  const lastPos = useRef<[number, number] | null>(null);
  const [collaborators] = useState<{ id: string; name: string }[]>([]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const drawLine = (from: [number, number], to: [number, number]) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = tool === "eraser" ? size * 5 : size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    lastPos.current = getPos(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !lastPos.current) return;
    const pos = getPos(e);
    if (tool === "pen" || tool === "eraser") {
      drawLine(lastPos.current, pos);
      lastPos.current = pos;
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(false);
    if (!lastPos.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = size;

    if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(lastPos.current[0], lastPos.current[1]);
      ctx.lineTo(pos[0], pos[1]);
      ctx.stroke();
    } else if (tool === "rect") {
      const [x1, y1] = lastPos.current;
      ctx.strokeRect(x1, y1, pos[0] - x1, pos[1] - y1);
    } else if (tool === "ellipse") {
      const [x1, y1] = lastPos.current;
      const rx = Math.abs(pos[0] - x1) / 2;
      const ry = Math.abs(pos[1] - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(x1 + (pos[0] - x1) / 2, y1 + (pos[1] - y1) / 2, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }

    lastPos.current = null;
  };

  const handleClear = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = canvasRef.current?.toDataURL() ?? "";
    link.click();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }, []);

  const TOOLS: { id: Tool; Icon: typeof Pencil }[] = [
    { id: "pen",     Icon: Pencil },
    { id: "eraser",  Icon: Eraser },
    { id: "line",    Icon: Minus },
    { id: "rect",    Icon: Square },
    { id: "ellipse", Icon: Circle },
  ];

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6] flex flex-col">
      <PageHeader
        eyebrow="Collaboration · Phase 25"
        title="Whiteboard"
        description="Shared visual canvas for brainstorming and diagrams"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#1b1f2e] border-b border-[rgba(255,255,255,0.06)]">
        {/* Tools */}
        <div className="flex items-center gap-1 bg-[#262939] rounded-lg p-1">
          {TOOLS.map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              className={`p-2 rounded-md transition-colors ${tool === id ? "bg-[#00d2ff]/20 text-[#00d2ff]" : "text-[#5d6579] hover:text-[#9aa3b8]"}`}
              title={id}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Colors */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{ backgroundColor: c, borderColor: color === c ? "#00d2ff" : "transparent" }}
            />
          ))}
        </div>

        {/* Size */}
        <input type="range" min={1} max={20} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-[#00d2ff]" />
        <span className="text-xs text-[#5d6579] w-6">{size}px</span>

        <div className="flex-1" />

        {/* Collaborators */}
        {collaborators.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-[#5d6579]">
            <Users className="w-3.5 h-3.5" />
            {collaborators.length} online
          </div>
        )}

        <button onClick={handleDownload} className="p-2 text-[#5d6579] hover:text-[#9aa3b8]" title="Download">
          <Download className="w-4 h-4" />
        </button>
        <button onClick={handleClear} className="p-2 text-[#5d6579] hover:text-[#ff4d6d]" title="Clear">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ background: "#0a0e1a" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
}
