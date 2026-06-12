"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, User, Loader2, CheckCircle2, AlertCircle, Sparkles, X, ChevronDown, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { getAllowedSendersForRole, type EmailAddressConfig } from "@/lib/email-config";
import type { UserRole } from "@/generated/prisma/enums";

type SignatureSummary = {
  id: string;
  fullName: string;
  title?: string | null;
};

// ─── AI Write Modal ───────────────────────────────────────────────────────────

function AIWriteModal({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (subject: string, body: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as { subject?: string; body?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "AI generation failed");
        return;
      }
      onApply(data.subject ?? "", data.body ?? "");
      onClose();
      toast.success("AI draft applied!");
    } catch {
      toast.error("Failed to reach AI service");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1b1f2e] rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#eceef8] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00d2ff]" />
            Write with AI
          </h2>
          <button onClick={onClose} className="text-[#9aa3b8] hover:text-[#dfe1f6]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#8b93a7] mb-1.5">
              Describe what you want to say
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Follow up with the client about the Q3 proposal, keep it friendly but professional"
              rows={4}
              className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.07)] rounded-md text-sm focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 outline-none resize-none bg-[#262939] text-[#dfe1f6] placeholder:text-[#707a90]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) generate();
              }}
            />
            <p className="text-[10px] text-[#9aa3b8] mt-1">Ctrl+Enter to generate</p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[rgba(255,255,255,0.07)] rounded-md text-sm font-medium text-[#9aa3b8] hover:bg-[#262939] bg-[#1b1f2e]"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={!prompt.trim() || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#00d2ff] text-[#003543] rounded-md text-sm font-medium hover:bg-[#7dd8f5] transition-colors disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Draft</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subject Optimizer Popover ────────────────────────────────────────────────

function SubjectOptimizer({
  subject,
  onSelect,
}: {
  subject: string;
  onSelect: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const optimize = async () => {
    if (!subject.trim()) {
      toast.error("Type a subject first");
      return;
    }
    setLoading(true);
    setOpen(true);
    setAlternatives([]);
    try {
      const res = await fetch("/api/ai/optimize-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      const data = (await res.json()) as { alternatives?: string[]; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Optimization failed");
        setOpen(false);
        return;
      }
      setAlternatives(data.alternatives ?? []);
    } catch {
      toast.error("Failed to reach AI service");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={optimize}
        disabled={loading}
        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#9aa3b8] hover:text-[#00d2ff] rounded-md hover:bg-[#00d2ff]/10 transition-colors disabled:opacity-50"
        title="Optimize subject with AI"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        Optimize
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-[#1f2433] border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl z-20 p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-[#8b93a7]">
              Suggestions
            </p>
            <button onClick={() => setOpen(false)} className="text-[#9aa3b8] hover:text-[#dfe1f6]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-[#7dd8f5]" />
            </div>
          ) : alternatives.length === 0 ? (
            <p className="text-xs text-[#9aa3b8] py-2 text-center">No suggestions available</p>
          ) : (
            alternatives.map((alt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onSelect(alt);
                  setOpen(false);
                  toast.success("Subject updated");
                }}
                className="w-full text-left px-3 py-2 text-sm text-[#dfe1f6] bg-[#262939] hover:bg-[#00d2ff]/10 hover:text-[#00d2ff] border border-[rgba(255,255,255,0.06)] hover:border-[#00d2ff]/30 rounded-md transition-colors"
              >
                {alt}
              </button>
            ))
          )}
          <p className="text-[10px] text-[#9aa3b8] text-center pt-1">
            Click an option to use it
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Simple Composer ──────────────────────────────────────────────────────────

export function SimpleComposer({
  onSuccess,
  userRole,
  bare = false,
  defaultRecipient = "",
  defaultSubject = "",
  defaultBody = "",
  draftKey,
  draftId: initialDraftId,
  replyToThreadId,
}: {
  onSuccess?: () => void;
  userRole?: UserRole;
  bare?: boolean;
  defaultRecipient?: string;
  defaultSubject?: string;
  defaultBody?: string;
  draftKey?: string;
  draftId?: string;
  replyToThreadId?: string;
}) {
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [isPending, setIsPending] = useState(false);
  const [allowedSenders, setAllowedSenders] = useState<EmailAddressConfig[]>([]);
  const [selectedSenderEmail, setSelectedSenderEmail] = useState("");
  const [signatures, setSignatures] = useState<SignatureSummary[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [showAIWrite, setShowAIWrite] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(initialDraftId);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const MAX = 10 * 1024 * 1024; // 10 MB per file
    const valid = files.filter(f => {
      if (f.size > MAX) { toast.error(`${f.name} exceeds 10 MB limit`); return false; }
      return true;
    });
    setAttachments(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...valid.filter(f => !names.has(f.name))];
    });
    // Reset so the same file can be re-selected after removal
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Restore draft on mount from localStorage (legacy/offline)
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved) as { recipient?: string; cc?: string; bcc?: string; subject?: string; body?: string };
      if (draft.body || draft.subject) {
        if (!defaultRecipient) setRecipient(draft.recipient ?? "");
        if (!defaultSubject) setSubject(draft.subject ?? "");
        setBody(draft.body ?? "");
        if (draft.cc) { setCc(draft.cc); setShowCc(true); }
        if (draft.bcc) { setBcc(draft.bcc); setShowBcc(true); }
        setHasDraft(true);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Server-side autosave with 2s debounce
  useEffect(() => {
    if (!recipient && !subject && !body) return;
    setDraftSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: draftId, to: recipient, cc, bcc, subject, body, signatureId: selectedSignatureId || undefined }),
        });
        if (res.ok) {
          const saved = await res.json() as { id: string };
          setDraftId(saved.id);
          setDraftSaveStatus("saved");
          // Also update localStorage for offline fallback
          if (draftKey) { try { localStorage.setItem(draftKey, JSON.stringify({ recipient, cc, bcc, subject, body })); } catch {} }
        }
      } catch {
        setDraftSaveStatus("idle");
      }
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient, cc, bcc, subject, body]);

  useEffect(() => {
    if (userRole) {
      const senders = getAllowedSendersForRole(userRole);
      setAllowedSenders(senders);
      const personal = senders.find(s => s.type === "PERSONAL");
      setSelectedSenderEmail(personal ? personal.email : senders[0]?.email || "");
    }
  }, [userRole]);

  useEffect(() => {
    const loadSignatures = async () => {
      try {
        const response = await fetch("/api/signatures");
        if (response.ok) {
          const data = await response.json();
          setSignatures(data);
          if (data.length > 0) setSelectedSignatureId(data[0].id);
        }
      } catch (error) {
        console.error("Failed to load signatures:", error);
      }
    };
    loadSignatures();
  }, []);

  const doActualSend = async (payload: { to: string; subject: string; body: string; signatureId?: string; cc?: string[]; bcc?: string[]; replyToThreadId?: string }) => {
    let requestInit: RequestInit;
    if (attachments.length > 0) {
      const fd = new FormData();
      fd.append("to", payload.to);
      fd.append("subject", payload.subject);
      fd.append("body", payload.body);
      if (payload.signatureId) fd.append("signatureId", payload.signatureId);
      if (payload.replyToThreadId) fd.append("replyToThreadId", payload.replyToThreadId);
      if (payload.cc?.length) fd.append("cc", JSON.stringify(payload.cc));
      if (payload.bcc?.length) fd.append("bcc", JSON.stringify(payload.bcc));
      for (const file of attachments) fd.append("attachments", file);
      requestInit = { method: "POST", body: fd };
    } else {
      requestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
    }
    const response = await fetch("/api/inbox/compose", requestInit);
    const data = await response.json() as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to send");
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !subject.trim()) { toast.error("Recipient and subject are required"); return; }

    const parseEmails = (raw: string) => raw.split(",").map(s => s.trim()).filter(Boolean);
    const payload = {
      to: recipient,
      subject,
      body,
      signatureId: selectedSignatureId || undefined,
      ...(replyToThreadId ? { replyToThreadId } : {}),
      ...(cc.trim()  ? { cc:  parseEmails(cc) }  : {}),
      ...(bcc.trim() ? { bcc: parseEmails(bcc) } : {}),
    };

    const DELAY = 8;
    let remaining = DELAY;
    const toastId = "undo-send";

    const cancelSend = () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      toast.dismiss(toastId);
      toast.info("Send cancelled");
      setIsPending(false);
    };

    setIsPending(true);
    toast(
      `Sending in ${remaining}s…`,
      { id: toastId, duration: (DELAY + 2) * 1000, action: { label: "Undo", onClick: cancelSend } }
    );

    const tick = () => {
      remaining--;
      if (remaining <= 0) {
        toast.loading("Sending…", { id: toastId });
        doActualSend(payload)
          .then(() => {
            toast.success("Email sent", { id: toastId });
            setRecipient(""); setCc(""); setBcc(""); setShowCc(false); setShowBcc(false);
            setSubject(""); setBody(""); setHasDraft(false); setDraftSaveStatus("idle");
            setAttachments([]);
            if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
            if (draftId) { fetch(`/api/drafts/${draftId}`, { method: "DELETE" }).catch(() => {}); setDraftId(undefined); }
            if (onSuccess) onSuccess();
          })
          .catch((err: Error) => toast.error(err.message, { id: toastId }))
          .finally(() => setIsPending(false));
      } else {
        toast(`Sending in ${remaining}s…`, { id: toastId, duration: (remaining + 2) * 1000, action: { label: "Undo", onClick: cancelSend } });
        undoTimerRef.current = setTimeout(tick, 1000);
      }
    };
    undoTimerRef.current = setTimeout(tick, 1000);
  };

  const formContent = (
    <form onSubmit={handleSend} className="p-6 space-y-4">
      {hasDraft && (
        <div className="flex items-center justify-between rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-2.5">
          <p className="text-xs font-medium text-amber-400">Draft restored</p>
          <button
            type="button"
            onClick={() => {
              setRecipient(defaultRecipient);
              setCc("");
              setBcc("");
              setShowCc(false);
              setShowBcc(false);
              setSubject(defaultSubject);
              setBody("");
              setHasDraft(false);
              if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
            }}
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Draft status + AI Write */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#9aa3b8]">
          {draftSaveStatus === "saving" && "Saving draft…"}
          {draftSaveStatus === "saved" && "Draft saved"}
        </span>
        <button
          type="button"
          onClick={() => setShowAIWrite(true)}
          className="text-[#9aa3b8] hover:text-[#00d2ff] hover:bg-[#00d2ff]/10 rounded-md px-3 py-1.5 text-[13px] font-medium flex items-center gap-1.5 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Write with AI
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-[#8b93a7] mb-1.5">
            From
          </label>
          <select
            value={selectedSenderEmail}
            onChange={(e) => setSelectedSenderEmail(e.target.value)}
            className="block w-full py-2.5 border border-[rgba(255,255,255,0.07)] rounded-md bg-[#262939] text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm px-3"
          >
            {allowedSenders.map(s => (
              <option key={s.email} value={s.email}>{s.displayName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8b93a7] mb-1.5">
            Signature
          </label>
          <select
            value={selectedSignatureId}
            onChange={(e) => setSelectedSignatureId(e.target.value)}
            className="block w-full py-2.5 border border-[rgba(255,255,255,0.07)] rounded-md bg-[#262939] text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm px-3"
          >
            <option value="">No Signature</option>
            {signatures.map(s => (
              <option key={s.id} value={s.id}>{s.fullName} ({s.title})</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-medium text-[#8b93a7]">
            To
          </label>
          <div className="flex items-center gap-2">
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-[11px] font-medium text-[#8b93a7] hover:text-[#dfe1f6] transition-colors"
              >
                Cc
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() => setShowBcc(true)}
                className="text-[11px] font-medium text-[#8b93a7] hover:text-[#dfe1f6] transition-colors"
              >
                Bcc
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#707a90]" />
          <input
            type="email"
            required
            placeholder="recipient@example.com"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="block w-full pl-10 pr-4 py-2.5 border border-[rgba(255,255,255,0.07)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#707a90] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all"
          />
        </div>

        {showCc && (
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#707a90] pointer-events-none">Cc</span>
            <input
              type="text"
              placeholder="cc@example.com, another@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="block w-full pl-9 pr-9 py-2.5 border border-[rgba(255,255,255,0.07)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#707a90] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => { setShowCc(false); setCc(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#707a90] hover:text-[#dfe1f6] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {showBcc && (
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#707a90] pointer-events-none">Bcc</span>
            <input
              type="text"
              placeholder="bcc@example.com, another@example.com"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className="block w-full pl-10 pr-9 py-2.5 border border-[rgba(255,255,255,0.07)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#707a90] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => { setShowBcc(false); setBcc(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#707a90] hover:text-[#dfe1f6] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-medium text-[#8b93a7]">
            Subject
          </label>
          <SubjectOptimizer subject={subject} onSelect={setSubject} />
        </div>
        <input
          type="text"
          required
          placeholder="Message subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="block w-full py-2.5 border border-[rgba(255,255,255,0.07)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#707a90] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm px-4 outline-none transition-all"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#8b93a7] mb-1.5">
          Message
        </label>
        <textarea
          required
          rows={5}
          placeholder="Write your message here..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="block w-full px-4 py-3 border border-[rgba(255,255,255,0.07)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#707a90] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all resize-y min-h-[100px]"
        />
      </div>

      {/* Attachments */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs font-medium text-[#9aa3b8] hover:text-[#dfe1f6] transition-colors"
        >
          <Paperclip className="w-3.5 h-3.5" />
          Attach files
        </button>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((f) => (
              <li key={f.name} className="flex items-center gap-2 rounded-md bg-[#1e2233] border border-[rgba(255,255,255,0.06)] px-3 py-1.5">
                <Paperclip className="w-3 h-3 text-[#707a90] shrink-0" />
                <span className="text-xs text-[#dfe1f6] flex-1 truncate">{f.name}</span>
                <span className="text-[10px] text-[#707a90] shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => setAttachments(prev => prev.filter(a => a.name !== f.name))}
                  className="text-[#707a90] hover:text-[#ff4d6d] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        disabled={isPending}
        className="w-full bg-[#00d2ff] text-[#003543] font-medium py-3 rounded-md hover:bg-[#7dd8f5] transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            {attachments.length > 0 ? `Send (${attachments.length} attachment${attachments.length > 1 ? "s" : ""})` : "Send"}
          </>
        )}
      </button>

      {showAIWrite && (
        <AIWriteModal
          onClose={() => setShowAIWrite(false)}
          onApply={(s, b) => {
            setSubject(s);
            setBody(b);
          }}
        />
      )}
    </form>
  );

  if (bare) return formContent;

  return (
    <div className="bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h3 className="text-base font-semibold text-[#eceef8]">New message</h3>
      </div>
      {formContent}
    </div>
  );
}

type CurrentUser = {
  id: string;
  role: UserRole;
  email: string;
  fullName: string;
};

type RecentLog = {
  id: string;
  recipient: string;
  subject: string | null;
  status: string;
  createdAt: Date | string;
};

type MemberInfo = { id: string; email: string; fullName: string; avatarUrl: string | null };

function MemberAvatar({ email, members }: { email: string; members: MemberInfo[] }) {
  const m = members.find((u) => u.email.toLowerCase() === email.toLowerCase());
  const label = (m?.fullName ?? email).charAt(0).toUpperCase();
  if (m?.avatarUrl) {
    return <img src={m.avatarUrl} alt={label} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-[#00d2ff]/10 flex items-center justify-center text-[#00d2ff] font-semibold text-xs flex-shrink-0">
      {label}
    </div>
  );
}

export function WorkspaceDashboard({
  currentUser,
  recentLogs,
}: {
  currentUser: CurrentUser;
  recentLogs: RecentLog[];
}) {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((data: MemberInfo[]) => setMembers(data))
      .catch(() => {});
  }, []);
  return (
    <div className="grid lg:grid-cols-[1fr_350px] gap-8">
      {/* Sent History */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-[#eceef8] tracking-[-0.01em]">Sent messages</h2>

        <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-[rgba(255,255,255,0.06)]">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#707a90]">Recipient</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#707a90]">Subject</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#707a90]">Status</th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#707a90] text-right">Sent</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm text-[#9aa3b8] text-center italic py-12">
                    No sent messages found in this workspace.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[#262939] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#dfe1f6]">
                      <div className="flex items-center gap-3">
                        <MemberAvatar email={log.recipient} members={members} />
                        <span className="text-sm font-medium text-[#dfe1f6]">{log.recipient}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#dfe1f6] max-w-[200px] truncate">
                      {log.subject || "(No Subject)"}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#dfe1f6]">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.status === 'DELIVERED' || log.status === 'SENT' ? 'bg-[#06d6a0]/10 text-[#06d6a0]' :
                        log.status === 'OPENED' || log.status === 'CLICKED' ? 'bg-[#00d2ff]/10 text-[#00d2ff]' :
                        log.status === 'FAILED' || log.status === 'BOUNCED' ? 'bg-[#ff4d6d]/10 text-[#ff4d6d]' :
                        'bg-white/[0.06] text-[#9aa3b8]'
                      }`}>
                        {log.status === 'DELIVERED' ? <CheckCircle2 className="w-3 h-3" /> : null}
                        {log.status === 'FAILED' ? <AlertCircle className="w-3 h-3" /> : null}
                        {log.status.charAt(0) + log.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#9aa3b8] text-right" suppressHydrationWarning>
                      {new Date(log.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Composer Side Pane */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-[#eceef8] tracking-[-0.01em]">Quick compose</h2>
        <SimpleComposer userRole={currentUser.role} />
      </div>
    </div>
  );
}
