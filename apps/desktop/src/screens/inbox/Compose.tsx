import { useState, useEffect, useRef } from "react";
import { composeEmail, getWorkspaceMembers, getSignature, type WorkspaceMember, type Signature } from "@/api/client";

export type ComposeMode =
  | { kind: "new" }
  | { kind: "reply"; threadId: string; to: string; subject: string; quoted: string }
  | { kind: "replyAll"; threadId: string; to: string; cc: string[]; subject: string; quoted: string }
  | { kind: "forward"; subject: string; quoted: string };

export function Compose({
  mode,
  onClose,
  onSent,
}: {
  mode: ComposeMode;
  onClose: () => void;
  onSent: () => void;
}) {
  const initialSubject =
    mode.kind === "reply" || mode.kind === "replyAll"
      ? mode.subject.startsWith("Re:") ? mode.subject : `Re: ${mode.subject}`
      : mode.kind === "forward"
        ? mode.subject.startsWith("Fwd:") ? mode.subject : `Fwd: ${mode.subject}`
        : "";

  const initialTo =
    mode.kind === "reply" || mode.kind === "replyAll" ? mode.to : "";

  const initialCc = mode.kind === "replyAll" ? mode.cc.join(", ") : "";

  const initialBody = (mode.kind === "reply" || mode.kind === "replyAll" || mode.kind === "forward")
    ? `\n\n${mode.quoted}`
    : "";

  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc);
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(initialCc.length > 0);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [useSignature, setUseSignature] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [activeField, setActiveField] = useState<"to" | "cc" | "bcc" | null>(null);
  const [suggestions, setSuggestions] = useState<WorkspaceMember[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getWorkspaceMembers().then(setMembers).catch(() => {});
    getSignature().then(setSignature).catch(() => {});
    setTimeout(() => {
      if (mode.kind === "new") toRef.current?.focus();
      else bodyRef.current?.focus();
    }, 50);
  }, [mode.kind]);

  function lastToken(s: string): string {
    const parts = s.split(",");
    return (parts[parts.length - 1] ?? "").trim().toLowerCase();
  }

  function onFieldChange(setter: (v: string) => void, field: "to" | "cc" | "bcc", value: string) {
    setter(value);
    setActiveField(field);
    const tok = lastToken(value);
    if (tok.length < 1) { setSuggestions([]); return; }
    const matches = members
      .filter(m =>
        m.email.toLowerCase().includes(tok) ||
        m.fullName.toLowerCase().includes(tok),
      )
      .slice(0, 6);
    setSuggestions(matches);
  }

  function acceptSuggestion(m: WorkspaceMember) {
    const setter = activeField === "to" ? setTo : activeField === "cc" ? setCc : setBcc;
    const current = activeField === "to" ? to : activeField === "cc" ? cc : bcc;
    const parts = current.split(",");
    parts[parts.length - 1] = ` ${m.email}`;
    setter(parts.join(",").trim() + ", ");
    setSuggestions([]);
  }

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setError("Recipient, subject and body are required.");
      return;
    }
    setSending(true);
    setError("");

    const ccList = cc.split(",").map(s => s.trim()).filter(Boolean);
    const bccList = bcc.split(",").map(s => s.trim()).filter(Boolean);

    try {
      await composeEmail({
        to: to.split(",")[0]!.trim(),
        subject: subject.trim(),
        body: body.trim() + (useSignature && signature?.plainText ? `\n\n${signature.plainText}` : ""),
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        replyToThreadId: (mode.kind === "reply" || mode.kind === "replyAll") ? mode.threadId : undefined,
        signatureId: useSignature && signature ? signature.id : undefined,
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const title =
    mode.kind === "new" ? "New message"
    : mode.kind === "reply" ? "Reply"
    : mode.kind === "replyAll" ? "Reply all"
    : "Forward";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-6 no-select">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !sending && onClose()}
      />

      {/* Window */}
      <div className="relative flex w-full max-w-[720px] h-[640px] flex-col rounded-xl border border-brand-border bg-bg-card shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex h-[44px] flex-shrink-0 items-center justify-between border-b border-brand-border bg-bg-sidebar px-4">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <button
            onClick={() => !sending && onClose()}
            className="text-text-muted hover:text-text-primary transition-fast"
            disabled={sending}
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div className="flex-shrink-0 border-b border-brand-border px-4 py-3 space-y-2">
          {/* To */}
          <div className="relative flex items-center gap-3 border-b border-brand-border/40 pb-2">
            <label className="w-12 text-[11px] uppercase tracking-wider text-text-muted">To</label>
            <input
              ref={toRef}
              value={to}
              onChange={e => onFieldChange(setTo, "to", e.target.value)}
              onFocus={() => setActiveField("to")}
              placeholder="recipient@cybersage.uk"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted/50 outline-none"
            />
            <div className="flex gap-2 text-[11px] text-text-muted">
              {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-text-secondary transition-fast">Cc</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-text-secondary transition-fast">Bcc</button>}
            </div>
            {activeField === "to" && suggestions.length > 0 && (
              <SuggestionList suggestions={suggestions} onPick={acceptSuggestion} />
            )}
          </div>

          {showCc && (
            <div className="relative flex items-center gap-3 border-b border-brand-border/40 pb-2">
              <label className="w-12 text-[11px] uppercase tracking-wider text-text-muted">Cc</label>
              <input
                value={cc}
                onChange={e => onFieldChange(setCc, "cc", e.target.value)}
                onFocus={() => setActiveField("cc")}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted/50 outline-none"
              />
              {activeField === "cc" && suggestions.length > 0 && (
                <SuggestionList suggestions={suggestions} onPick={acceptSuggestion} />
              )}
            </div>
          )}

          {showBcc && (
            <div className="relative flex items-center gap-3 border-b border-brand-border/40 pb-2">
              <label className="w-12 text-[11px] uppercase tracking-wider text-text-muted">Bcc</label>
              <input
                value={bcc}
                onChange={e => onFieldChange(setBcc, "bcc", e.target.value)}
                onFocus={() => setActiveField("bcc")}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted/50 outline-none"
              />
              {activeField === "bcc" && suggestions.length > 0 && (
                <SuggestionList suggestions={suggestions} onPick={acceptSuggestion} />
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="w-12 text-[11px] uppercase tracking-wider text-text-muted">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent text-sm font-medium text-text-primary placeholder-text-muted/50 outline-none"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message…"
            className="h-full w-full resize-none bg-transparent px-4 py-3 text-sm text-text-primary placeholder-text-muted/50 outline-none leading-relaxed"
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-brand-border px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            {signature && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSignature}
                  onChange={e => setUseSignature(e.target.checked)}
                  className="accent-brand"
                />
                Include signature
              </label>
            )}
            {error && <span className="text-danger">{error}</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={sending}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-fast disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
              className="rounded-md px-4 py-1.5 text-xs font-semibold text-bg-deep transition-smooth disabled:opacity-50"
              style={{
                background: sending ? "rgba(0,210,255,0.5)" : "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)",
                boxShadow: sending ? "none" : "0 0 12px rgba(0,210,255,0.2)",
              }}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestionList({
  suggestions,
  onPick,
}: {
  suggestions: WorkspaceMember[];
  onPick: (m: WorkspaceMember) => void;
}) {
  return (
    <div className="absolute left-12 right-0 top-full z-10 mt-1 max-h-[200px] overflow-y-auto rounded-md border border-brand-border bg-bg-deep shadow-lg">
      {suggestions.map(m => (
        <button
          key={m.id}
          onMouseDown={e => { e.preventDefault(); onPick(m); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-hover transition-fast"
        >
          <div className="h-7 w-7 flex-shrink-0 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-xs font-bold text-brand">
            {m.fullName[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-text-primary truncate leading-tight">{m.fullName}</p>
            <p className="text-[11px] text-text-muted truncate leading-tight">{m.email}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
