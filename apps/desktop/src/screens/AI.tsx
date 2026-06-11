import { useState, useRef, useEffect } from "react";
import { aiChat } from "@/api/client";

type Message = { role: "user" | "assistant"; content: string; id: string };

const SUGGESTIONS = [
  "Summarize my unread emails",
  "Draft a professional reply to a client",
  "Help me schedule a meeting",
  "Write a weekly status update",
];

export function AI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setDraft("");

    const userMsg: Message = { role: "user", content: trimmed, id: crypto.randomUUID() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const { reply } = await aiChat(trimmed, history);
      setMessages(prev => [...prev, { role: "assistant", content: reply, id: crypto.randomUUID() }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${msg}`, id: crypto.randomUUID() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 h-[52px] flex items-center gap-3 px-5 border-b border-brand-border no-select">
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(0,210,255,0.2), rgba(0,100,150,0.3))", border: "1px solid rgba(0,210,255,0.2)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 1 0 0 16A8 8 0 0 0 12 2zM12 6v6l4 2" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary leading-none">CyberSage AI</p>
            <p className="text-[10px] text-text-muted leading-none mt-0.5">Powered by Claude</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="ml-auto text-xs text-text-muted/60 hover:text-text-muted transition-fast"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <div
                className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(0,210,255,0.15), rgba(0,70,100,0.3))",
                  border: "1px solid rgba(0,210,255,0.2)",
                  boxShadow: "0 0 40px rgba(0,210,255,0.1)",
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-text-primary">How can I help?</h3>
              <p className="text-sm text-text-muted mt-1">Ask me anything about your workspace</p>
            </div>

            {/* Suggestions */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="text-left rounded-xl border border-brand-border bg-bg-card px-3.5 py-3 text-xs text-text-secondary hover:border-brand/40 hover:bg-bg-hover transition-fast"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div
                    className="h-7 w-7 flex-shrink-0 rounded-lg flex items-center justify-center mt-0.5"
                    style={{ background: "linear-gradient(135deg, rgba(0,210,255,0.15), rgba(0,70,100,0.25))", border: "1px solid rgba(0,210,255,0.15)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                    </svg>
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-brand text-bg-deep rounded-tr-sm font-medium"
                      : "bg-bg-card border border-brand-border text-text-secondary rounded-tl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div
                  className="h-7 w-7 flex-shrink-0 rounded-lg flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(0,210,255,0.15), rgba(0,70,100,0.25))", border: "1px solid rgba(0,210,255,0.15)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                  </svg>
                </div>
                <div className="bg-bg-card border border-brand-border rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-text-muted/60" style={{ animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-brand-border p-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2 rounded-2xl bg-bg-card border border-brand-border px-4 py-3 focus-within:border-brand/50 transition-fast">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask CyberSage AI anything…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder-text-muted/50 outline-none leading-relaxed max-h-36 overflow-y-auto disabled:opacity-50"
            style={{ minHeight: "22px" }}
          />
          <button
            onClick={() => void send(draft)}
            disabled={!draft.trim() || loading}
            className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-fast disabled:opacity-30"
            style={{ background: draft.trim() && !loading ? "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" : undefined }}
          >
            {loading ? (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={draft.trim() ? "#0f1321" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1 text-center text-[10px] text-text-muted/30 no-select">Enter to send · Shift+Enter for newline</p>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
