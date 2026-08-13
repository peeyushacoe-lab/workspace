"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  Loader2,
  Sparkles,
  MessageSquareReply,
  Compass,
  FileText,
  Languages,
  Activity,
  AlertCircle,
  ChevronDown,
  Brain,
  Cpu,
  Plus,
  Trash2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceChat } from "@/components/ai/WorkspaceChat";

type Tab = "ask" | "draft" | "reply" | "summarize" | "translate" | "status" | "memory" | "agents";

type AIStatus = {
  provider: string;
  available: boolean;
  model: string;
  models?: string[];
  hint?: string;
};

type SummarizeResult = {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: "positive" | "neutral" | "negative";
};

type ReplyOption = {
  tone: string;
  text: string;
};

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  // First, and the default: every other tab is a text utility, this is the only
  // one that knows anything about the user's actual workspace.
  { id: "ask", label: "Ask Nexus", icon: <Compass className="w-4 h-4" /> },
  { id: "draft", label: "Email Draft", icon: <Sparkles className="w-4 h-4" /> },
  { id: "reply", label: "Smart Reply", icon: <MessageSquareReply className="w-4 h-4" /> },
  { id: "summarize", label: "Summarize", icon: <FileText className="w-4 h-4" /> },
  { id: "translate", label: "Translate", icon: <Languages className="w-4 h-4" /> },
  { id: "status",  label: "AI Status", icon: <Activity className="w-4 h-4" /> },
  { id: "memory",  label: "Memory",    icon: <Brain className="w-4 h-4" /> },
  { id: "agents",  label: "Agents",    icon: <Cpu className="w-4 h-4" /> },
];

const TONES = ["Professional", "Friendly", "Formal", "Concise", "Persuasive"];
const LANGUAGES = [
  "Spanish", "French", "German", "Arabic", "Chinese",
  "Japanese", "Hindi", "Portuguese", "Russian", "Italian",
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="bg-surface text-muted hover:bg-surface-sunken border border-border rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-ok" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

function ErrorBanner({ message, status }: { message: string; status?: number }) {
  const text =
    status === 503
      ? "AI service unavailable. Make sure Ollama is running."
      : message;
  return (
    <div className="flex items-start gap-3 p-4 bg-crit/10 border border-crit rounded-xl text-sm text-crit">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-crit" />
      <span>{text}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-6 h-6 animate-spin text-accent" />
    </div>
  );
}

/**
 * Availability indicator.
 *
 * Deliberately does NOT name the provider or model. Which vendor and which
 * model are answering is an operational detail — it means nothing to the person
 * writing an email, it leaks part of the stack to anyone who opens the page,
 * and it belongs in the AI Status tab and the server logs, both of which still
 * have it. All the user needs here is: can I use this right now.
 */
function StatusBar({ status }: { status: AIStatus | null }) {
  if (!status || status.available) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-warn-soft px-4 py-2 text-xs">
      <Bot className="h-4 w-4 text-warn" />
      <span className="font-medium text-warn">
        The AI assistant is unavailable right now.
      </span>
      <span className="text-muted">An administrator can check the AI Status tab for details.</span>
    </div>
  );
}

function EmailDraftTab() {
  const [subject, setSubject] = useState("");
  const [context, setContext] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState("Professional");
  const [language, setLanguage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const generate = async () => {
    if (!context.trim()) {
      toast.error("Context / Instructions is required");
      return;
    }
    setLoading(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || undefined,
          context,
          tone: tone.toLowerCase(),
          recipient: recipient || undefined,
          language: language || undefined,
        }),
      });
      const data = await res.json() as { draft?: string; error?: string };
      if (!res.ok) {
        setError({ message: data.error ?? "Generation failed", status: res.status });
      } else {
        setDraft(data.draft ?? "");
      }
    } catch {
      setError({ message: "Network error", status: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-muted mb-1.5">
          Subject (optional)
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Project Update Q2"
          className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1.5">
          Context / Instructions <span className="text-crit">*</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Describe what the email should convey, include any key details..."
          rows={4}
          className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">
            Recipient (optional)
          </label>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. john@example.com"
            className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">
            Tone
          </label>
          <div className="relative">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface appearance-none pr-8"
            >
              {TONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1.5">
          Language (optional)
        </label>
        <input
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="e.g. Spanish, French (leave blank for English)"
          className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface"
        />
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="bg-accent text-accent-foreground hover:bg-surface rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Generate Draft
      </button>

      {loading && <Spinner />}
      {error && <ErrorBanner message={error.message} status={error.status} />}

      {draft && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">Generated Draft</span>
            <CopyButton text={draft} />
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface resize-none font-mono"
          />
        </div>
      )}
    </div>
  );
}

function SmartReplyTab() {
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState<ReplyOption[]>([]);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const toneColors: Record<string, string> = {
    formal: "bg-violet/15 text-violet border-violet/20",
    friendly: "bg-ok/15 text-ok border-ok/20",
    brief: "bg-warn/15 text-warn border-warn/20",
  };

  const generate = async () => {
    if (!original.trim()) {
      toast.error("Paste the original email first");
      return;
    }
    setLoading(true);
    setError(null);
    setReplies([]);
    try {
      const res = await fetch("/api/ai/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalMessage: original }),
      });
      const data = await res.json() as { replies?: ReplyOption[]; error?: string };
      if (!res.ok) {
        setError({ message: data.error ?? "Generation failed", status: res.status });
      } else {
        setReplies(data.replies ?? []);
      }
    } catch {
      setError({ message: "Network error", status: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-muted mb-1.5">
          Original Email
        </label>
        <textarea
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          placeholder="Paste the email you received here..."
          rows={6}
          className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface resize-none"
        />
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="bg-accent text-accent-foreground hover:bg-surface rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareReply className="w-4 h-4" />}
        Generate Replies
      </button>

      {loading && <Spinner />}
      {error && <ErrorBanner message={error.message} status={error.status} />}

      {replies.length > 0 && (
        <div className="space-y-4">
          {replies.map((r, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center justify-between px-0 pb-2.5 mb-2 border-b border-border">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${toneColors[r.tone.toLowerCase()] ?? "bg-surface-sunken text-muted border-border"}`}
                >
                  {r.tone}
                </span>
                <CopyButton text={r.text} />
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummarizeTab() {
  const [text, setText] = useState("");
  const [type, setType] = useState<"email" | "thread" | "document" | "meeting">("email");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const sentimentConfig = {
    positive: { label: "Positive", className: "bg-ok/15 text-ok border-ok/20" },
    neutral: { label: "Neutral", className: "bg-surface-sunken text-muted border-border" },
    negative: { label: "Negative", className: "bg-crit/15 text-crit border-crit/20" },
  };

  const summarize = async () => {
    if (!text.trim()) {
      toast.error("Paste some text to summarize");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setCheckedItems(new Set());
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, type }),
      });
      const data = await res.json() as SummarizeResult & { error?: string };
      if (!res.ok) {
        setError({ message: data.error ?? "Summarization failed", status: res.status });
      } else {
        setResult(data);
      }
    } catch {
      setError({ message: "Network error", status: 0 });
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (i: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const sentiment = result
    ? sentimentConfig[result.sentiment as keyof typeof sentimentConfig] ?? sentimentConfig.neutral
    : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-3">
          <label className="block text-xs font-semibold text-muted mb-1.5">
            Text / Thread to Summarize
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste email thread, document, or meeting notes here..."
            rows={7}
            className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">
            Type
          </label>
          <div className="relative">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface appearance-none pr-8"
            >
              <option value="email">Email</option>
              <option value="thread">Thread</option>
              <option value="document">Document</option>
              <option value="meeting">Meeting</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <button
        onClick={summarize}
        disabled={loading}
        className="bg-accent text-accent-foreground hover:bg-surface rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        Summarize
      </button>

      {loading && <Spinner />}
      {error && <ErrorBanner message={error.message} status={error.status} />}

      {result && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted">Summary</span>
              {sentiment && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${sentiment.className}`}>
                  {sentiment.label}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>
          </div>

          {result.keyPoints.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted mb-3">Key Points</p>
              <ul className="space-y-2">
                {result.keyPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.actionItems.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted mb-3">Action Items</p>
              <ul className="space-y-2">
                {result.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <button
                      onClick={() => toggleCheck(i)}
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                        checkedItems.has(i)
                          ? "bg-accent border-accent"
                          : "border-border hover:border-accent"
                      }`}
                    >
                      {checkedItems.has(i) && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
                    </button>
                    <span
                      className={`text-sm transition-colors ${
                        checkedItems.has(i) ? "text-muted line-through" : "text-foreground"
                      }`}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TranslateTab() {
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Spanish");
  const [loading, setLoading] = useState(false);
  const [translated, setTranslated] = useState("");
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const translate = async () => {
    if (!text.trim()) {
      toast.error("Paste text to translate");
      return;
    }
    setLoading(true);
    setError(null);
    setTranslated("");
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage }),
      });
      const data = await res.json() as { translated?: string; error?: string };
      if (!res.ok) {
        setError({ message: data.error ?? "Translation failed", status: res.status });
      } else {
        setTranslated(data.translated ?? "");
      }
    } catch {
      setError({ message: "Network error", status: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-muted mb-1.5">
          Source Text
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the text you want to translate..."
          rows={6}
          className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted mb-1.5">
          Target Language
        </label>
        <div className="relative w-64">
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface appearance-none pr-8"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        </div>
      </div>

      <button
        onClick={translate}
        disabled={loading}
        className="bg-accent text-accent-foreground hover:bg-surface rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
        Translate
      </button>

      {loading && <Spinner />}
      {error && <ErrorBanner message={error.message} status={error.status} />}

      {translated && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">
              Translation ({targetLanguage})
            </span>
            <CopyButton text={translated} />
          </div>
          <textarea
            value={translated}
            onChange={(e) => setTranslated(e.target.value)}
            rows={6}
            className="w-full bg-surface-sunken border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:bg-surface resize-none font-mono"
          />
        </div>
      )}
    </div>
  );
}

function AIStatusTab({ onStatus }: { onStatus: (s: AIStatus) => void }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/status");
      if (!res.ok) throw new Error("Failed to fetch AI status");
      const data = (await res.json()) as AIStatus;
      setStatus(data);
      onStatus(data);
    } catch {
      setError("Could not reach the AI status endpoint.");
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!status) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted mb-2">Provider</p>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent text-accent-foreground text-sm font-semibold rounded-lg">
            <Bot className="w-4 h-4" />
            {status.provider}
          </span>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted mb-2">Model</p>
          <span className="text-sm font-mono text-foreground font-semibold">{status.model}</span>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 col-span-2">
          <p className="text-xs font-semibold text-muted mb-2">Availability</p>
          <div className="flex items-center gap-3">
            {status.available ? (
              <>
                <CheckCircle className="w-5 h-5 text-ok" />
                <span className="text-ok font-semibold text-sm">Available and responding</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-crit" />
                <span className="text-crit font-semibold text-sm">Unavailable</span>
              </>
            )}
          </div>
          {!status.available && status.hint && (
            <div className="mt-3 p-3 bg-warn/10 border border-warn/20 rounded-lg text-xs text-warn font-mono">
              {status.hint}
            </div>
          )}
        </div>
      </div>

      {status.models && status.models.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted mb-3">
            Available Models ({status.models.length})
          </p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {status.models.map((m) => (
              <div
                key={m}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm border ${
                  m === status.model
                    ? "bg-accent/10 text-accent border-accent/30 font-semibold"
                    : "bg-surface-sunken border-border text-muted"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m === status.model ? "bg-accent" : "bg-border"}`} />
                <span className="font-mono">{m}</span>
                {m === status.model && (
                  <span className="ml-auto text-[10px] font-semibold text-accent">Active</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={fetchStatus}
        className="bg-surface text-muted hover:bg-surface-sunken border border-border rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
      >
        <Activity className="w-4 h-4" />
        Refresh Status
      </button>
    </div>
  );
}

// ─── Memory Tab ──────────────────────────────────────────────────────────────

type AIMemory = {
  id: string;
  type: string;
  content: string;
  context: string | null;
  tags: string[];
  createdAt: string;
};

function MemoryTab() {
  const [memories, setMemories] = useState<AIMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [type, setType] = useState("FACT");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/memory${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (res.ok) setMemories(await res.json() as AIMemory[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStore = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), type, context: context.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      const m = await res.json() as AIMemory;
      setMemories((prev) => [m, ...prev]);
      setContent("");
      setContext("");
      toast.success("Memory stored");
    } catch {
      toast.error("Failed to store memory");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/ai/memory?id=${id}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
    toast.success("Memory deleted");
  };

  const TYPES = ["FACT", "PREFERENCE", "PROJECT", "WORKFLOW", "CONTACT"];
  const typeColors: Record<string, string> = {
    FACT:       "bg-accent/15 text-accent",
    PREFERENCE: "bg-violet/15 text-violet",
    PROJECT:    "bg-ok/15 text-ok",
    WORKFLOW:   "bg-warn/15 text-warn",
    CONTACT:    "bg-crit/15 text-crit",
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${type === t ? "ring-1 ring-accent " + (typeColors[t] ?? "") : "bg-surface-sunken text-muted hover:bg-hover"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Store a memory…"
          className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent/40 resize-none"
        />
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Context (optional)"
          className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent/40"
        />
        <button
          onClick={handleStore}
          disabled={saving || !content.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Store Memory
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
          placeholder="Search memories…"
          className="flex-1 bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent/40"
        />
        <button onClick={load} className="px-3 py-2 bg-surface-sunken text-muted rounded-lg hover:bg-hover text-sm">Search</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : memories.length === 0 ? (
        <p className="text-center text-sm text-muted py-6">No memories stored yet.</p>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <div key={m.id} className="flex items-start gap-3 p-3 bg-surface-sunken rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeColors[m.type] ?? "text-muted"}`}>{m.type}</span>
                  {m.context && <span className="text-xs text-muted">{m.context}</span>}
                </div>
                <p className="text-sm text-foreground">{m.content}</p>
              </div>
              <button onClick={() => handleDelete(m.id)} className="text-muted hover:text-crit flex-shrink-0 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────

type AIAgent = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  isActive: boolean;
  _count?: { runs: number };
};

type AgentRun = {
  id: string;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
};

function AgentsTab() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AIAgent | null>(null);
  const [runInput, setRunInput] = useState("");
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);

  useEffect(() => {
    fetch("/api/ai/agents")
      .then((r) => r.ok ? r.json() as Promise<AIAgent[]> : [])
      .then(setAgents)
      .finally(() => setLoading(false));
  }, []);

  const handleRun = async () => {
    if (!selected || !runInput.trim()) return;
    setRunning(true);
    setLastRun(null);
    try {
      let input: Record<string, unknown>;
      try { input = JSON.parse(runInput) as Record<string, unknown>; }
      catch { input = { text: runInput }; }

      const res = await fetch(`/api/ai/agents/${selected.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const run = await res.json() as AgentRun;
      setLastRun(run);
      if (run.status === "DONE") toast.success("Agent completed");
      else toast.error(run.error ?? "Agent failed");
    } catch {
      toast.error("Failed to run agent");
    } finally {
      setRunning(false);
    }
  };

  const typeColors: Record<string, string> = {
    INBOX_TRIAGE: "text-accent bg-accent/10",
    SCHEDULING:   "text-ok bg-ok/10",
    KNOWLEDGE:    "text-violet bg-violet/10",
    COMPLIANCE:   "text-crit bg-crit/10",
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
      ) : agents.length === 0 ? (
        <div className="text-center py-8">
          <Cpu className="w-8 h-8 text-subtle mx-auto mb-2" />
          <p className="text-sm text-muted">No agents configured. Admins can create agents via the API.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => { setSelected(a); setLastRun(null); }}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${selected?.id === a.id ? "bg-accent/8 border-accent/30" : "bg-surface-sunken border-border hover:border-border"}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">{a.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${typeColors[a.type] ?? "text-muted bg-surface-sunken"}`}>{a.type}</span>
              </div>
              {a.description && <p className="text-xs text-muted">{a.description}</p>}
              {a._count && <p className="text-xs text-subtle mt-0.5">{a._count.runs} runs</p>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="border-t border-border pt-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Run: {selected.name}</h4>
          <textarea
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
            rows={3}
            placeholder={`Input for ${selected.type} agent (plain text or JSON)…`}
            className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent/40 resize-none font-mono"
          />
          <button
            onClick={handleRun}
            disabled={running || !runInput.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? "Running…" : "Run Agent"}
          </button>
          {lastRun && (
            <div className={`p-3 rounded-xl border text-xs ${lastRun.status === "DONE" ? "bg-ok/8 border-ok/20" : "bg-crit/8 border-crit/20"}`}>
              <div className="flex items-center gap-2 mb-2">
                {lastRun.status === "DONE" ? <CheckCircle className="w-3.5 h-3.5 text-ok" /> : <XCircle className="w-3.5 h-3.5 text-crit" />}
                <span className={lastRun.status === "DONE" ? "text-ok font-medium" : "text-crit font-medium"}>{lastRun.status}</span>
              </div>
              {lastRun.error && <p className="text-crit">{lastRun.error}</p>}
              {lastRun.output && (
                <pre className="text-muted whitespace-pre-wrap break-all">
                  {JSON.stringify(lastRun.output, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AIAssistant(_props: { currentUserId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("ask");
  const [globalStatus, setGlobalStatus] = useState<AIStatus | null>(null);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: AIStatus) => setGlobalStatus(d))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-7.25rem)] lg:h-full bg-surface overflow-hidden">
      <StatusBar status={globalStatus} />

      {/* Mobile horizontal tab strip */}
      <div className="lg:hidden flex overflow-x-auto border-b border-border bg-surface px-2 py-1.5 gap-1 flex-shrink-0 scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              activeTab === tab.id
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-muted hover:bg-surface-sunken"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex w-52 bg-surface border-r border-border flex-col flex-shrink-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <span className="text-foreground font-semibold text-sm">AI Assistant</span>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 text-left transition-colors ${
                  activeTab === tab.id
                    ? "bg-accent/10 text-accent rounded-lg px-3 py-2 text-sm font-medium"
                    : "text-muted hover:bg-surface-sunken hover:text-foreground rounded-lg px-3 py-2 text-sm transition-colors"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 bg-surface">
          <div className="max-w-3xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {TABS.find((t) => t.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-muted mt-0.5">
                {activeTab === "ask" && "Ask about your mail, calendar, tasks, meetings and documents — answers cite what they came from."}
                {activeTab === "draft" && "Generate a professional email draft using AI."}
                {activeTab === "reply" && "Get three tailored reply options for any email."}
                {activeTab === "summarize" && "Extract key points, action items, and sentiment."}
                {activeTab === "translate" && "Instantly translate text to any supported language."}
                {activeTab === "status" && "Check your AI provider connection and available models."}
                {activeTab === "memory" && "Store and retrieve AI workspace memories — preferences, projects, and facts."}
                {activeTab === "agents" && "Run AI agents for inbox triage, scheduling, knowledge retrieval, and compliance."}
              </p>
            </div>

            <div className="bg-surface border border-border rounded-xl p-4">
              {activeTab === "ask" && <WorkspaceChat />}
              {activeTab === "draft" && <EmailDraftTab />}
              {activeTab === "reply" && <SmartReplyTab />}
              {activeTab === "summarize" && <SummarizeTab />}
              {activeTab === "translate" && <TranslateTab />}
              {activeTab === "status" && (
                <AIStatusTab
                  onStatus={(s) => setGlobalStatus(s)}
                />
              )}
              {activeTab === "memory" && <MemoryTab />}
              {activeTab === "agents" && <AgentsTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
