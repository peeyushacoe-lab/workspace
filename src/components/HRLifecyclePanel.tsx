"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, FileText, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Shared lifecycle panel — onboarding / offboarding letters + NOC for one person.
 * Used by the HR console (staff) and the Mentor workspace HR tab (interns).
 * Dark Nexus styling. API: /api/hr/lifecycle (+ /api/hr/signatories).
 */

export interface Lifecycle {
  status?: "ONBOARDING" | "ACTIVE" | "OFFBOARDING" | "EXITED";
  type?: "RESIGNATION" | "TERMINATION";
  ref?: string; letterDocId?: string; letterSentAt?: string;
  signedDocId?: string; signedReturnedAt?: string; confidentialityAckAt?: string; signedVerifiedAt?: string;
  lastWorkingDay?: string; reason?: string;
  nocRef?: string; nocDocId?: string; nocIssuedAt?: string;
}

interface SignatoryOption {
  id: string; name: string; title: string; hasSignature: boolean;
}

const LC_CHIP: Record<string, string> = {
  ONBOARDING: "bg-accent-soft text-accent border-accent/20",
  ACTIVE: "bg-ok/10 text-ok border-ok/20",
  OFFBOARDING: "bg-warn/10 text-warn border-warn/20",
  EXITED: "bg-crit/10 text-crit border-crit/20",
};

const fieldClass =
  "w-full px-3 py-2 bg-surface-sunken border border-border-strong rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StepDot({ done, current, label }: { done?: boolean; current?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
        done ? "bg-ok/10 border-ok/40 text-ok" :
        current ? "bg-accent-soft border-accent/40 text-accent" :
        "bg-surface-sunken border-border text-subtle"}`}>
        {done ? <Check className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      </div>
      <span className={`text-[11px] ${done || current ? "font-medium text-foreground" : "text-subtle"}`}>{label}</span>
    </div>
  );
}

export default function HRLifecyclePanel({ userId, firstName }: { userId: string; firstName: string }) {
  const [lc, setLc] = useState<Lifecycle | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [offboardType, setOffboardType] = useState<"RESIGNATION" | "TERMINATION" | null>(null);
  const [lwd, setLwd] = useState("");
  const [reason, setReason] = useState("");
  const [signatories, setSignatories] = useState<SignatoryOption[]>([]);
  const [signatoryId, setSignatoryId] = useState<string>("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/hr/lifecycle?userId=${userId}`);
    if (res.ok) setLc((await res.json()).lifecycle ?? {});
    else setLc({});
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch("/api/hr/signatories").then(r => (r.ok ? r.json() : { signatories: [] }))
      .then(d => {
        const sigs = (d.signatories ?? []) as SignatoryOption[];
        setSignatories(sigs);
        if (sigs.length > 0) setSignatoryId(prev => prev || sigs[0].id);
      }).catch(() => {});
  }, []);

  async function act(label: string, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActing(label);
    try {
      const res = await fetch("/api/hr/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, signatoryId: signatoryId || undefined, ...body }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Action failed"); return; }
      toast.success(label);
      setOffboardType(null); setLwd(""); setReason("");
      void load();
    } finally { setActing(null); }
  }

  if (lc === null) {
    return <div className="mt-4 pt-4 border-t border-border flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-accent" /></div>;
  }

  const status = lc.status;
  const btnBase = "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors disabled:opacity-50";

  const offboardButtons = (
    <>
      <button onClick={() => { setOffboardType("RESIGNATION"); setReason(""); }} disabled={!!acting}
        className={`${btnBase} bg-warn/10 text-warn border-warn/20 hover:bg-warn/20`}>
        Offboard — Resignation…
      </button>
      <button onClick={() => { setOffboardType("TERMINATION"); setReason(""); }} disabled={!!acting}
        className={`${btnBase} bg-crit/10 text-crit border-crit/20 hover:bg-crit/20`}>
        Offboard — Termination…
      </button>
    </>
  );

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" /> Lifecycle
          {status && (
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${LC_CHIP[status] ?? ""}`}>
              {status === "OFFBOARDING" ? `Offboarding — ${lc.type === "TERMINATION" ? "termination" : "resignation"}` :
               status === "EXITED" ? "Exited — NOC issued" : status.toLowerCase()}
            </span>
          )}
          {lc.ref && <span className="text-[10px] font-mono text-subtle">{lc.ref}</span>}
        </p>
        {signatories.length > 0 && status !== "EXITED" && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            Letters signed by
            <select value={signatoryId} onChange={e => setSignatoryId(e.target.value)}
              className="px-2 py-1 bg-surface-sunken border border-border rounded-md text-[11px] text-foreground">
              {signatories.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.title}{s.hasSignature ? "" : " (no signature)"}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Stepper for open flows */}
      {(status === "ONBOARDING" || status === "OFFBOARDING") && (
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <StepDot done label={`${status === "ONBOARDING" ? "Onboarding" : "Exit"} letter sent`} />
          <div className="w-5 h-px bg-border" />
          <StepDot done={!!lc.signedReturnedAt} current={!lc.signedReturnedAt} label="Signed copy returned" />
          <div className="w-5 h-px bg-border" />
          <StepDot done={!!lc.confidentialityAckAt} label="Confidentiality acknowledged" />
          <div className="w-5 h-px bg-border" />
          {status === "OFFBOARDING"
            ? <StepDot done={!!lc.nocIssuedAt} current={!!lc.signedVerifiedAt && !lc.nocIssuedAt} label="NOC issued" />
            : <StepDot done={!!lc.signedVerifiedAt} current={!!lc.signedReturnedAt && !lc.signedVerifiedAt} label="Verified → active" />}
        </div>
      )}

      {/* Documents involved */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        {lc.letterDocId && (
          <a href={`/api/hr/documents/${lc.letterDocId}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[11px] text-accent hover:underline">
            <FileText className="w-3 h-3" /> Letter PDF
          </a>
        )}
        {lc.signedDocId && (
          <a href={`/api/hr/documents/${lc.signedDocId}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[11px] text-ok hover:underline">
            <FileText className="w-3 h-3" /> Signed copy {lc.signedReturnedAt ? `· ${fmt(lc.signedReturnedAt)}` : ""}
          </a>
        )}
        {lc.nocDocId && (
          <a href={`/api/hr/documents/${lc.nocDocId}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[11px] text-accent hover:underline">
            <ShieldCheck className="w-3 h-3" /> NOC {lc.nocRef}
          </a>
        )}
      </div>

      {/* Actions per state */}
      <div className="flex items-center gap-2 flex-wrap">
        {(!status || status === "ACTIVE") && (
          <>
            {!status && (
              <button onClick={() => void act("Onboarding letter sent", { action: "onboard" })} disabled={!!acting}
                className={`${btnBase} bg-accent text-accent-foreground border-accent hover:bg-accent-hover`}>
                {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send onboarding letter
              </button>
            )}
            {offboardButtons}
          </>
        )}

        {status === "ONBOARDING" && (
          <>
            <button onClick={() => void act("Onboarding letter resent", { action: "onboard" })} disabled={!!acting}
              className={`${btnBase} bg-surface text-muted border-border hover:bg-surface-sunken`}>
              <RefreshCw className="w-3 h-3" /> Resend letter
            </button>
            <button onClick={() => void act("Marked signed & active", { action: "mark-signed" })} disabled={!!acting}
              className={`${btnBase} bg-ok/10 text-ok border-ok/20 hover:bg-ok/20`}>
              <Check className="w-3 h-3" /> Mark signed copy received
            </button>
          </>
        )}

        {status === "OFFBOARDING" && (
          <>
            {!lc.signedVerifiedAt && (
              <button onClick={() => void act("Signed copy verified", { action: "mark-signed" })} disabled={!!acting}
                className={`${btnBase} bg-ok/10 text-ok border-ok/20 hover:bg-ok/20`}>
                <Check className="w-3 h-3" /> Mark signed copy received
              </button>
            )}
            <button
              onClick={() => void act("NOC issued", { action: "issue-noc" },
                `Issue the NOC and mark ${firstName} as exited? This confirms they are no longer part of Cybersage.`)}
              disabled={!!acting || (!lc.signedVerifiedAt && !lc.signedReturnedAt)}
              title={!lc.signedVerifiedAt && !lc.signedReturnedAt ? "Waiting for the signed exit letter" : undefined}
              className={`${btnBase} bg-accent text-accent-foreground border-accent hover:bg-accent-hover`}>
              {acting === "NOC issued" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
              Issue NOC & mark exited
            </button>
          </>
        )}

        {status === "EXITED" && (
          <p className="text-[11px] text-muted">
            Exit closed{lc.nocIssuedAt ? ` on ${fmt(lc.nocIssuedAt)}` : ""} · no longer part of Cybersage.
          </p>
        )}
      </div>

      {/* Offboard dialog (inline) */}
      {offboardType && (
        <div className="mt-3 p-3 bg-surface border border-border rounded-lg space-y-2.5">
          <p className="text-xs font-semibold text-foreground">
            {offboardType === "RESIGNATION" ? "Offboard — accept resignation" : "Offboard — terminate employment"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Last working day</label>
              <input type="date" value={lwd} onChange={e => setLwd(e.target.value)} className={fieldClass} />
            </div>
            {offboardType === "TERMINATION" && (
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Reason on record</label>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Policy violation" className={fieldClass} />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted">
            This generates the exit letter PDF, emails it to {firstName}, and assigns the offboarding checklist.
            The NOC is issued separately once the signed copy comes back.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!lwd) { toast.error("Pick the last working day"); return; }
                void act("Exit letter sent", { action: "offboard", type: offboardType, lastWorkingDay: lwd, reason: reason || undefined });
              }}
              disabled={!!acting}
              className={`${btnBase} ${offboardType === "TERMINATION" ? "bg-crit/10 text-crit border-crit/20 hover:bg-crit/20" : "bg-warn/10 text-warn border-warn/20 hover:bg-warn/20"}`}>
              {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send exit letter
            </button>
            <button onClick={() => setOffboardType(null)} className={`${btnBase} bg-surface text-muted border-border hover:bg-surface-sunken`}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
