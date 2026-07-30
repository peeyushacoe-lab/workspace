"use client";

// Intern-facing growth panel — mentor evaluations, shared 1:1 notes and
// certificates (with printable view). Mounted inside the Intern Hub Progress tab.

import React, { useEffect, useState } from "react";
import { Award, ClipboardCheck, MessageSquare, Printer } from "lucide-react";

interface Person { id: string; fullName: string; avatarUrl?: string | null }

interface Evaluation {
  id: string; period: string; isFinal: boolean; overall: number;
  scores: Record<string, number>;
  strengths?: string | null; improvements?: string | null; comment?: string | null;
  createdAt: string; mentor: Person;
}
interface Note {
  id: string; meetingDate: string; note: string; actionItems?: string | null; mentor: Person;
}
interface Certificate {
  id: string; title: string; serial: string; grade?: string | null; issuedAt: string;
  issuedBy?: Person | null; intern: Person;
}

const RUBRIC_LABELS: Record<string, string> = {
  technical: "Technical", communication: "Communication", initiative: "Initiative",
  reliability: "Reliability", teamwork: "Teamwork",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function scoreColor(v: number, outOf = 5) {
  const pct = (v / outOf) * 100;
  if (pct >= 80) return "text-ok";
  if (pct >= 60) return "text-warn";
  return "text-crit";
}

function printCertificate(cert: Certificate) {
  const win = window.open("", "_blank", "width=900,height=650");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${cert.serial}</title>
<style>
  @page { size: landscape; margin: 0; }
  body { margin:0; font-family: Georgia, 'Times New Roman', serif; background:#f0efec;
         display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .cert { width: 820px; padding: 60px 70px; background:#fdfcf8; color:#1a1a1a;
          border: 3px double #b08d2f; position:relative; text-align:center; }
  .brand { font-size: 13px; letter-spacing: 4px; color:#b08d2f; font-weight:bold; }
  h1 { font-size: 34px; margin: 18px 0 6px; font-weight: normal; }
  .name { font-size: 30px; margin: 22px 0 4px; font-style: italic; }
  .rule { width: 280px; border-bottom: 1px solid #999; margin: 0 auto 18px; }
  .title { font-size: 17px; margin: 6px 0; }
  .grade { font-size: 15px; color:#b08d2f; font-weight:bold; letter-spacing:1px; }
  .meta { display:flex; justify-content:space-between; margin-top: 48px; font-size: 12px; color:#555; }
  .serial { font-family: monospace; }
</style></head><body>
<div class="cert">
  <div class="brand">CYBERSAGE · NEXUS</div>
  <h1>Certificate of ${cert.title.toLowerCase().includes("completion") ? "Completion" : "Achievement"}</h1>
  <p style="font-size:14px;color:#555">This certifies that</p>
  <div class="name">${cert.intern.fullName}</div>
  <div class="rule"></div>
  <p class="title">${cert.title}</p>
  ${cert.grade ? `<p class="grade">Awarded with ${cert.grade}</p>` : ""}
  <div class="meta">
    <span>Issued ${fmt(cert.issuedAt)}${cert.issuedBy ? `<br/>by ${cert.issuedBy.fullName}` : ""}</span>
    <span class="serial">Serial: ${cert.serial}</span>
  </div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  win.document.close();
}

export default function InternGrowth() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);

  useEffect(() => {
    fetch("/api/mentor/evaluations").then(r => (r.ok ? r.json() : { evaluations: [] })).then(d => setEvaluations(d.evaluations ?? [])).catch(() => {});
    fetch("/api/mentor/notes").then(r => (r.ok ? r.json() : { notes: [] })).then(d => setNotes(d.notes ?? [])).catch(() => {});
    fetch("/api/internship/certificates").then(r => (r.ok ? r.json() : { certificates: [] })).then(d => setCerts(d.certificates ?? [])).catch(() => {});
  }, []);

  if (evaluations.length === 0 && notes.length === 0 && certs.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Certificates */}
      {certs.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><Award className="w-4 h-4 text-warn" /> My certificates</h3>
          </div>
          <div className="divide-y divide-border">
            {certs.map(c => (
              <div key={c.id} className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.title}{c.grade ? <span className="text-warn"> — {c.grade}</span> : null}</p>
                  <p className="text-xs font-mono text-subtle mt-0.5">{c.serial} · issued {fmt(c.issuedAt)}{c.issuedBy ? ` by ${c.issuedBy.fullName}` : ""}</p>
                </div>
                <button onClick={() => printCertificate(c)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-soft text-accent hover:bg-accent-soft shrink-0 transition-colors">
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evaluations */}
      {evaluations.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-accent" /> Mentor evaluations</h3>
          </div>
          <div className="divide-y divide-border">
            {evaluations.map(ev => (
              <div key={ev.id} className="px-5 py-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{ev.period}</span>
                  {ev.isFinal && <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-accent-soft text-accent">FINAL</span>}
                  <span className={`text-sm font-mono font-semibold ${scoreColor(ev.overall)}`}>{ev.overall}/5</span>
                  <span className="text-[11px] text-subtle ml-auto">{ev.mentor.fullName} · {fmt(ev.createdAt)}</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 mt-3 max-w-md">
                  {Object.entries(RUBRIC_LABELS).map(([k, label]) => (
                    <div key={k} className="text-center bg-surface-sunken/60 rounded py-1.5">
                      <p className={`text-sm font-mono ${ev.scores[k] != null ? scoreColor(ev.scores[k]) : "text-subtle"}`}>{ev.scores[k] ?? "—"}</p>
                      <p className="text-[9px] text-subtle">{label}</p>
                    </div>
                  ))}
                </div>
                {ev.strengths && <p className="text-xs text-muted mt-2"><span className="text-ok font-medium">Strengths:</span> {ev.strengths}</p>}
                {ev.improvements && <p className="text-xs text-muted mt-1"><span className="text-warn font-medium">To improve:</span> {ev.improvements}</p>}
                {ev.comment && <p className="text-xs text-foreground mt-1">{ev.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared 1:1 notes */}
      {notes.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-accent" /> 1:1 notes from your mentor</h3>
          </div>
          <div className="divide-y divide-border">
            {notes.map(n => (
              <div key={n.id} className="px-5 py-4">
                <p className="text-xs font-mono text-subtle">{fmt(n.meetingDate)} · {n.mentor.fullName}</p>
                <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{n.note}</p>
                {n.actionItems && <p className="text-xs text-muted mt-1.5"><span className="text-accent font-medium">Actions:</span> {n.actionItems}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
