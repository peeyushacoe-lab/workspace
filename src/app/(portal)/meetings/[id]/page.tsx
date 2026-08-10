"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Video, Radio, Users, ListChecks, Plus, Trash2,
  CheckSquare, Square, Clock, NotebookPen, Check, GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { avatarGradient } from "@/lib/avatar";
import { usableMediaUrl } from "@/lib/media-url";

/**
 * Meeting detail — the page a meeting is prepared from and run against.
 *
 * Nexus could already host a meeting but had nowhere to say what it was for or
 * what came out of it. This is that place: agenda → notes → tasks, with the
 * tasks carrying a backlink here so the loop closes (see lib/task-source.ts).
 *
 * Distinct from /meet/[roomId], which is the live Jitsi room. A link to a past
 * meeting must show what was discussed, not drop the reader into a video call.
 */

type Person = { id: string; fullName: string; avatarUrl: string | null };

type AgendaItem = {
  id: string;
  position: number;
  title: string;
  minutes: number | null;
  done: boolean;
  ownerId: string | null;
  owner: Person | null;
};

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  roomName: string;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  scheduledAt: string | null;
  organizer: Person;
  participants: { userId: string; role: string; user: Person }[];
  actionItems: string[];
  aiSummary: string | null;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

/** Fixed locale + UTC: this renders on a client page but the rule is cheap to keep. */
function whenLabel(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
}

function Avatar({ person, size = 24 }: { person: Person; size?: number }) {
  const url = usableMediaUrl(person.avatarUrl);
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={person.fullName} style={style} className="rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div
      style={{ ...style, background: avatarGradient(person.id) }}
      className="flex flex-shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
    >
      {initials(person.fullName)}
    </div>
  );
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [notesState, setNotesState] = useState<"idle" | "saving" | "saved">("idle");
  const [taskFrom, setTaskFrom] = useState<AgendaItem | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void (async () => {
      try {
        const [mRes, aRes, nRes] = await Promise.all([
          fetch(`/api/meet/${id}`),
          fetch(`/api/meet/${id}/agenda`),
          fetch(`/api/meet/${id}/notes`),
        ]);
        // 404 covers both "no such meeting" and "you're not on it" — the API
        // deliberately doesn't distinguish, so neither does this page.
        if (!mRes.ok) { setNotFound(true); return; }
        setMeeting((await mRes.json()) as Meeting);
        if (aRes.ok) setItems(((await aRes.json()) as { items: AgendaItem[] }).items);
        if (nRes.ok) setNotes(((await nRes.json()) as { notes: string }).notes);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Notes autosave ────────────────────────────────────────────────────────
  // Debounced rather than saved per keystroke: this is a plain textarea with
  // last-write-wins on the server, so fewer, larger writes are strictly better.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNotes = useCallback(
    (value: string) => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = setTimeout(() => {
        setNotesState("saving");
        void fetch(`/api/meet/${id}/notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        })
          .then((r) => setNotesState(r.ok ? "saved" : "idle"))
          .catch(() => setNotesState("idle"));
      }, 900);
    },
    [id],
  );

  useEffect(() => () => { if (notesTimer.current) clearTimeout(notesTimer.current); }, []);

  // ── Agenda mutations ──────────────────────────────────────────────────────
  const addItem = async () => {
    const title = newItem.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/meet/${id}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      const { item } = (await res.json()) as { item: AgendaItem };
      setItems((prev) => [...prev, item]);
      setNewItem("");
    } catch {
      toast.error("Could not add that item");
    } finally {
      setAdding(false);
    }
  };

  const toggleItem = async (item: AgendaItem) => {
    // Optimistic: ticking items off is the main interaction during a live
    // meeting, and it must not wait on a round trip.
    const next = !item.done;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: next } : i)));
    try {
      const res = await fetch(`/api/meet/${id}/agenda`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, done: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)));
      toast.error("Could not save that");
    }
  };

  const removeItem = async (item: AgendaItem) => {
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      const res = await fetch(`/api/meet/${id}/agenda?itemId=${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setItems(before);
      toast.error("Could not remove that item");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-subtle" />
      </div>
    );
  }

  if (notFound || !meeting) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4">
        <Video className="w-8 h-8 text-subtle" />
        <p className="text-sm text-subtle">This meeting doesn&apos;t exist, or you&apos;re not on it.</p>
        <button onClick={() => router.back()} className="text-xs text-accent hover:underline">Go back</button>
      </div>
    );
  }

  const done = items.filter((i) => i.done).length;
  const totalMinutes = items.reduce((sum, i) => sum + (i.minutes ?? 0), 0);
  const isLive = meeting.status === "LIVE";

  return (
    <div className="px-6 py-6 lg:px-8">
      <Link
        href="/meet"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-subtle transition-colors hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Meet
      </Link>

      {/* ── Header ── */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium tracking-wide text-subtle">Meeting</p>
          <h1 className="text-2xl font-semibold leading-snug tracking-[-0.02em] text-foreground">
            {meeting.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>{whenLabel(meeting.scheduledAt)}</span>
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded-full border border-crit/25 bg-crit-soft px-1.5 py-0.5 text-[10px] font-semibold text-crit">
                <Radio className="w-3 h-3" />
                LIVE
              </span>
            )}
            {meeting.status === "ENDED" && <span className="text-subtle">· ended</span>}
          </div>
        </div>

        {meeting.status !== "ENDED" && meeting.status !== "CANCELLED" && (
          <Link
            href={`/meet/${meeting.roomName}`}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <Video className="w-4 h-4" />
            {isLive ? "Join now" : "Open room"}
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Agenda ── */}
        <section className="lg:col-span-2 rounded-xl border border-border bg-surface shadow-sm">
          <header className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <ListChecks className="w-3.5 h-3.5 text-subtle" />
              Agenda
            </h2>
            {items.length > 0 && (
              <span className="text-[11px] tabular-nums text-subtle">
                {done}/{items.length} done
                {totalMinutes > 0 && ` · ${totalMinutes} min`}
              </span>
            )}
          </header>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-subtle">
              No agenda yet. Add the first item below.
            </p>
          ) : (
            <ul className="divide-y divide-border-soft">
              {items.map((item) => (
                <li key={item.id} className="group flex items-start gap-2.5 px-4 py-2.5">
                  <GripVertical className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-60" />

                  <button
                    type="button"
                    onClick={() => void toggleItem(item)}
                    aria-label={item.done ? "Mark not done" : "Mark done"}
                    className="mt-0.5 flex-shrink-0 text-subtle transition-colors hover:text-accent"
                  >
                    {item.done
                      ? <CheckSquare className="w-4 h-4 text-ok" />
                      : <Square className="w-4 h-4" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] ${item.done ? "text-subtle line-through" : "text-foreground"}`}>
                      {item.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-subtle">
                      {item.owner && (
                        <span className="flex items-center gap-1">
                          <Avatar person={item.owner} size={14} />
                          {item.owner.fullName}
                        </span>
                      )}
                      {item.minutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.minutes} min
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Per-item task creation is the reason the agenda is a table
                      and not a text blob. */}
                  <button
                    type="button"
                    onClick={() => setTaskFrom(item)}
                    title="Create a task from this item"
                    className="flex-shrink-0 rounded p-1 text-subtle opacity-0 transition-all hover:bg-hover hover:text-accent group-hover:opacity-100"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeItem(item)}
                    title="Remove item"
                    className="flex-shrink-0 rounded p-1 text-subtle opacity-0 transition-all hover:bg-hover hover:text-crit group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 border-t border-border-soft px-4 py-3">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addItem(); } }}
              placeholder="Add an agenda item…"
              className="flex-1 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-foreground transition-colors placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={() => void addItem()}
              disabled={adding || !newItem.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
        </section>

        {/* ── Participants ── */}
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Users className="w-3.5 h-3.5 text-subtle" />
            Participants
          </h2>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <Avatar person={meeting.organizer} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                {meeting.organizer.fullName}
              </span>
              <span className="flex-shrink-0 text-[10px] font-medium text-subtle">host</span>
            </li>
            {meeting.participants
              .filter((p) => p.userId !== meeting.organizer.id)
              .map((p) => (
                <li key={p.userId} className="flex items-center gap-2">
                  <Avatar person={p.user} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {p.user.fullName}
                  </span>
                </li>
              ))}
          </ul>
        </section>

        {/* ── Notes ── */}
        <section className="lg:col-span-3 rounded-xl border border-border bg-surface shadow-sm">
          <header className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <NotebookPen className="w-3.5 h-3.5 text-subtle" />
              Notes
            </h2>
            <span className="flex items-center gap-1 text-[11px] text-subtle">
              {notesState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" />Saving…</>}
              {notesState === "saved" && <><Check className="w-3 h-3 text-ok" />Saved</>}
            </span>
          </header>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); saveNotes(e.target.value); }}
            rows={10}
            placeholder="What was decided? What happens next?"
            className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-subtle focus:outline-none"
          />
        </section>
      </div>

      {taskFrom && (
        <CreateTaskDialog
          open
          onClose={() => setTaskFrom(null)}
          sourceType="meeting"
          // The meeting id, not its title — that's what makes the task's backlink
          // resolve to this page. See lib/task-source.ts.
          sourceId={meeting.id}
          defaultTitle={taskFrom.title}
          defaultDescription={`From the agenda of "${meeting.title}".`}
          sourceTitle={meeting.title}
        />
      )}
    </div>
  );
}
