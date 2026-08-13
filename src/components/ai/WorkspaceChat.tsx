"use client";

import { useCallback, useRef, useState } from "react";
import {
  Send, Loader2, Sparkles, Mail, CalendarDays, CheckSquare,
  Video, FileText, Users, type LucideIcon,
} from "lucide-react";
import { AppLink } from "@/components/AppLink";

/**
 * Ask-your-workspace chat.
 *
 * Nexus had twenty-one AI routes and no way to ask "what meetings do I have
 * tomorrow" — `/api/ai/chat` existed but was ungrounded, so it could only produce
 * plausible fiction, and the only surfaces calling it were document-scoped panels.
 * This is the general surface, backed by the retrieval in lib/ai-context.ts.
 *
 * ── Why citations are the whole point ─────────────────────────────────────────
 * A grounded answer and a hallucinated one read identically. The only way a user
 * can tell them apart is if the assistant shows its sources — so every answer
 * says whether it consulted the workspace, and lists the exact items it used as
 * links you can open and check. An answer with no citations is visibly an
 * unsourced answer, which is the honest presentation.
 */

type Citation = { n: number; kind: string; label: string; href: string | null };

type Turn = {
  role: "user" | "assistant";
  content: string;
  grounded?: boolean;
  citations?: Citation[];
};

const KIND_ICON: Record<string, LucideIcon> = {
  mail: Mail,
  event: CalendarDays,
  task: CheckSquare,
  meeting: Video,
  doc: FileText,
  person: Users,
};

/** Starter prompts — the questions this feature exists to answer. */
const EXAMPLES = [
  "What's on my calendar this week?",
  "What tasks are overdue?",
  "Summarise my unread email",
  "What meetings do I have coming up?",
];

export function WorkspaceChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || sending) return;

      setInput("");
      setSending(true);
      const nextTurns: Turn[] = [...turns, { role: "user", content: question }];
      setTurns(nextTurns);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: question,
            // Trimmed server-side too; sending the recent turns keeps follow-ups
            // ("and next week?") meaningful.
            history: turns.slice(-10).map((t) => ({ role: t.role, content: t.content })),
          }),
        });

        const body = (await res.json()) as {
          reply?: string;
          error?: string;
          grounded?: boolean;
          citations?: Citation[];
        };

        if (!res.ok) throw new Error(body.error ?? "The assistant is unavailable right now.");

        setTurns([
          ...nextTurns,
          {
            role: "assistant",
            content: body.reply ?? "",
            grounded: body.grounded,
            citations: body.citations ?? [],
          },
        ]);
      } catch (err) {
        setTurns([
          ...nextTurns,
          {
            role: "assistant",
            content: err instanceof Error ? err.message : "Something went wrong.",
          },
        ]);
      } finally {
        setSending(false);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        });
      }
    },
    [turns, sending],
  );

  return (
    <div className="flex h-[540px] flex-col rounded-xl border border-border bg-surface shadow-sm">
      {/* ── Transcript ── */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Ask about your workspace</p>
              <p className="mt-1 text-xs text-subtle">
                Your mail, calendar, tasks, meetings and documents — nothing you can&apos;t already open.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:bg-hover hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
              {turn.role === "user" ? (
                <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-[13px] text-accent-foreground">
                  {turn.content}
                </p>
              ) : (
                <div className="max-w-[90%]">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                    {turn.content}
                  </p>

                  {/* Sources. Absent when the answer wasn't grounded — that
                      difference is deliberate and is what tells the user
                      whether this came from their data or the model. */}
                  {turn.citations && turn.citations.length > 0 && (
                    <div className="mt-2.5 border-t border-border-soft pt-2">
                      <p className="mb-1.5 text-[10px] font-medium text-subtle">Based on</p>
                      <div className="flex flex-wrap gap-1.5">
                        {turn.citations.map((c) => {
                          const Icon = KIND_ICON[c.kind] ?? FileText;
                          const inner = (
                            <>
                              <span className="text-[9px] font-semibold tabular-nums opacity-60">
                                {c.n}
                              </span>
                              <Icon className="w-3 h-3 flex-shrink-0" />
                              <span className="max-w-[180px] truncate">{c.label}</span>
                            </>
                          );
                          const cls =
                            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium";
                          return c.href ? (
                            <AppLink
                              key={c.n}
                              href={c.href}
                              className={`${cls} border-accent/25 bg-accent-soft text-accent-strong transition-colors hover:border-accent/50`}
                            >
                              {inner}
                            </AppLink>
                          ) : (
                            <span key={c.n} className={`${cls} border-border bg-surface-sunken text-subtle`}>
                              {inner}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {turn.grounded === false && (
                    <p className="mt-2 text-[10px] text-subtle">
                      Answered without looking at your workspace.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-subtle">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Reading your workspace…
          </div>
        )}
      </div>

      {/* ── Composer ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
        className="flex items-center gap-2 border-t border-border-soft px-3 py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your mail, calendar, tasks…"
          className="flex-1 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-foreground transition-colors placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Ask
        </button>
      </form>
    </div>
  );
}
