"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";

/**
 * AI daily briefing card.
 *
 * Fetched client-side rather than awaited in the Home Server Component on
 * purpose: a model call takes seconds, and blocking on it would make the first
 * screen after login the slowest page in the product. Home paints with real data
 * immediately and this card fills in.
 *
 * The card renders nothing at all when AI is unconfigured or unavailable — an
 * empty "AI briefing" frame is worse than no frame, because it reads as broken
 * rather than as absent.
 */
export function DailyBriefing() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  const load = useCallback(async (refresh = false) => {
    setState("loading");
    try {
      const res = await fetch(`/api/home/briefing${refresh ? "?refresh=1" : ""}`);
      const json = (await res.json()) as { briefing?: string | null };
      if (json.briefing) {
        setBriefing(json.briefing);
        setState("ready");
      } else {
        setState("empty");
      }
    } catch {
      setState("empty");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "empty") return null;

  return (
    <div className="bg-accent-soft border border-accent/20 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-accent-strong">Your briefing</p>
            {state === "ready" && (
              <button
                type="button"
                onClick={() => void load(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
                aria-label="Regenerate briefing"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            )}
          </div>

          {state === "loading" ? (
            <div className="flex items-center gap-2 py-0.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-subtle" />
              <span className="text-[13px] text-subtle">Reading your workspace…</span>
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed text-foreground">{briefing}</p>
          )}
        </div>
      </div>
    </div>
  );
}
