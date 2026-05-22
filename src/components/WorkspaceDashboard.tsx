"use client";

import { useEffect, useRef, useState } from "react";
import { Send, User, Loader2, CheckCircle2, AlertCircle, Sparkles, X, ChevronDown } from "lucide-react";
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
      <div className="bg-[#1b1f2e] rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-[rgba(0,255,255,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#dfe1f6] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#a5e7ff]" />
            AI Email Writer
          </h2>
          <button onClick={onClose} className="text-[#bbc9cf] hover:text-[#dfe1f6]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-1.5">
              Describe what you want to say
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Follow up with the client about the Q3 proposal, keep it friendly but professional"
              rows={4}
              className="w-full px-3 py-2.5 border border-[rgba(0,255,255,0.09)] rounded-md text-sm focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 outline-none resize-none bg-[#262939] text-[#dfe1f6] placeholder:text-[#859399]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) generate();
              }}
            />
            <p className="text-[10px] text-[#bbc9cf] mt-1">Ctrl+Enter to generate</p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[rgba(0,255,255,0.09)] rounded-md text-sm font-medium text-[#bbc9cf] hover:bg-[#262939] bg-[#1b1f2e]"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={!prompt.trim() || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#00d2ff] text-[#003543] rounded-md text-sm font-medium hover:bg-[#a5e7ff] transition-colors disabled:opacity-50"
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
        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-[#a5e7ff] bg-[#a5e7ff]/10 border border-[#a5e7ff]/20 rounded-md hover:bg-[#a5e7ff]/20 transition-colors disabled:opacity-50 uppercase tracking-wide"
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
        <div className="absolute right-0 top-full mt-1 w-80 bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] rounded-xl shadow-xl z-20 p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-semibold text-[#bbc9cf] uppercase tracking-wider">
              AI Alternatives
            </p>
            <button onClick={() => setOpen(false)} className="text-[#bbc9cf] hover:text-[#dfe1f6]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-[#a5e7ff]" />
            </div>
          ) : alternatives.length === 0 ? (
            <p className="text-xs text-[#bbc9cf] py-2 text-center">No suggestions available</p>
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
                className="w-full text-left px-3 py-2 text-sm text-[#dfe1f6] bg-[#262939] hover:bg-[#00d2ff]/10 hover:text-[#00d2ff] border border-[rgba(0,255,255,0.08)] hover:border-[#00d2ff]/30 rounded-md transition-colors"
              >
                {alt}
              </button>
            ))
          )}
          <p className="text-[10px] text-[#bbc9cf] text-center pt-1">
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
}: {
  onSuccess?: () => void;
  userRole?: UserRole;
  bare?: boolean;
  defaultRecipient?: string;
  defaultSubject?: string;
  defaultBody?: string;
  draftKey?: string;
  draftId?: string;
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
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);

    const parseEmails = (raw: string) =>
      raw.split(",").map(e => e.trim()).filter(e => e.length > 0);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: [{
            email: recipient,
            name: recipient.split('@')[0],
            status: "Direct"
          }],
          subject,
          body,
          title: `Direct Mail from ${userRole || 'User'}`,
          senderEmail: selectedSenderEmail || undefined,
          signatureId: selectedSignatureId || undefined,
          ...(cc.trim() ? { cc: parseEmails(cc) } : {}),
          ...(bcc.trim() ? { bcc: parseEmails(bcc) } : {}),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success > 0) {
        toast.success("Email sent successfully");
        setRecipient("");
        setCc("");
        setBcc("");
        setShowCc(false);
        setShowBcc(false);
        setSubject("");
        setBody("");
        setHasDraft(false);
        setDraftSaveStatus("idle");
        if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
        if (draftId) {
          fetch(`/api/drafts/${draftId}`, { method: "DELETE" }).catch(() => {});
          setDraftId(undefined);
        }
        if (onSuccess) onSuccess();
      } else {
        toast.error(data.errors?.[0] || "Failed to send email");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsPending(false);
    }
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
        <span className="text-[10px] text-[#bbc9cf]">
          {draftSaveStatus === "saving" && "Saving draft…"}
          {draftSaveStatus === "saved" && "Draft saved"}
        </span>
        <button
          type="button"
          onClick={() => setShowAIWrite(true)}
          className="bg-[#00d2ff] text-[#003543] hover:bg-[#a5e7ff] rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Write
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-1.5">
            From Identity
          </label>
          <select
            value={selectedSenderEmail}
            onChange={(e) => setSelectedSenderEmail(e.target.value)}
            className="block w-full py-2.5 border border-[rgba(0,255,255,0.09)] rounded-md bg-[#262939] text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm px-3"
          >
            {allowedSenders.map(s => (
              <option key={s.email} value={s.email}>{s.displayName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-1.5">
            Signature
          </label>
          <select
            value={selectedSignatureId}
            onChange={(e) => setSelectedSignatureId(e.target.value)}
            className="block w-full py-2.5 border border-[rgba(0,255,255,0.09)] rounded-md bg-[#262939] text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm px-3"
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
          <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">
            To
          </label>
          <div className="flex items-center gap-2">
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-[10px] font-bold text-[#00d2ff] hover:text-[#a5e7ff] uppercase tracking-widest transition-colors"
              >
                Cc
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() => setShowBcc(true)}
                className="text-[10px] font-bold text-[#00d2ff] hover:text-[#a5e7ff] uppercase tracking-widest transition-colors"
              >
                Bcc
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#859399]" />
          <input
            type="email"
            required
            placeholder="recipient@example.com"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="block w-full pl-10 pr-4 py-2.5 border border-[rgba(0,255,255,0.09)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#859399] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all"
          />
        </div>

        {showCc && (
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#859399] uppercase tracking-widest pointer-events-none">Cc</span>
            <input
              type="text"
              placeholder="cc@example.com, another@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="block w-full pl-9 pr-9 py-2.5 border border-[rgba(0,255,255,0.09)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#859399] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => { setShowCc(false); setCc(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#859399] hover:text-[#dfe1f6] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {showBcc && (
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#859399] uppercase tracking-widest pointer-events-none">Bcc</span>
            <input
              type="text"
              placeholder="bcc@example.com, another@example.com"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className="block w-full pl-10 pr-9 py-2.5 border border-[rgba(0,255,255,0.09)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#859399] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => { setShowBcc(false); setBcc(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#859399] hover:text-[#dfe1f6] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">
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
          className="block w-full py-2.5 border border-[rgba(0,255,255,0.09)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#859399] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm px-4 outline-none transition-all"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider mb-1.5">
          Message Body
        </label>
        <textarea
          required
          rows={5}
          placeholder="Write your message here..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="block w-full px-4 py-3 border border-[rgba(0,255,255,0.09)] rounded-md bg-[#262939] text-[#dfe1f6] placeholder:text-[#859399] focus:ring-2 focus:ring-[#00d2ff]/40 focus:border-[#00d2ff]/60 text-sm outline-none transition-all resize-y min-h-[100px]"
        />
      </div>

      <button
        disabled={isPending}
        className="w-full bg-[#00d2ff] text-[#003543] font-medium py-3 rounded-md hover:bg-[#a5e7ff] transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Queuing...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Send Message
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
    <div className="bg-[#1b1f2e] rounded-xl border border-[rgba(0,255,255,0.08)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[rgba(0,255,255,0.08)] bg-[#1b1f2e]">
        <h3 className="text-xl font-bold text-[#dfe1f6] flex items-center gap-2">
          <Send className="w-5 h-5 text-[#00d2ff]" />
          New Message
        </h3>
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

export function WorkspaceDashboard({
  currentUser,
  recentLogs,
}: {
  currentUser: CurrentUser;
  recentLogs: RecentLog[];
}) {
  return (
    <div className="grid lg:grid-cols-[1fr_350px] gap-8">
      {/* Sent History */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#dfe1f6]">Sent Messages</h2>
          <span className="bg-[#00feb2]/10 text-[#00feb2] text-xs px-2 py-0.5 rounded-full font-medium border border-[#00feb2]/20">
            Active Workspace
          </span>
        </div>

        <div className="bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#262939] border-b border-[rgba(0,255,255,0.08)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider text-right">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm text-[#bbc9cf] text-center italic py-12">
                    No sent messages found in this workspace.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="border-b border-[rgba(0,255,255,0.07)] hover:bg-[#262939] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#dfe1f6]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#00d2ff]/10 flex items-center justify-center text-[#00d2ff] font-bold text-xs">
                          {log.recipient.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#dfe1f6]">{log.recipient}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#dfe1f6] max-w-[200px] truncate">
                      {log.subject || "(No Subject)"}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#dfe1f6]">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.status === 'DELIVERED' || log.status === 'SENT' ? 'bg-[#00feb2]/10 text-[#00feb2] border border-[#00feb2]/20' :
                        log.status === 'OPENED' || log.status === 'CLICKED' ? 'bg-[#00d2ff]/10 text-[#00d2ff] border border-[#00d2ff]/20' :
                        log.status === 'FAILED' || log.status === 'BOUNCED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-[#303444] text-[#bbc9cf] border border-[rgba(0,255,255,0.08)]'
                      }`}>
                        {log.status === 'DELIVERED' ? <CheckCircle2 className="w-3 h-3" /> : null}
                        {log.status === 'FAILED' ? <AlertCircle className="w-3 h-3" /> : null}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#bbc9cf] text-right" suppressHydrationWarning>
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
        <h2 className="text-xl font-bold text-[#dfe1f6]">Quick Compose</h2>
        <SimpleComposer userRole={currentUser.role} />
      </div>
    </div>
  );
}
