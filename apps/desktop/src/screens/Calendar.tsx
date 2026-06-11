import { useState, useEffect, useMemo } from "react";
import {
  getCalendarEvents, createCalendarEvent, getCalendarEvent, updateCalendarEvent, deleteCalendarEvent, rsvpEvent,
  getWorkspaceMembers,
  type CalendarEvent, type WorkspaceMember,
} from "@/api/client";
import { useAuth } from "@/store/auth";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COLORS = ["#00d2ff", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4"];

type View = "month" | "week" | "day";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function startOfWeek(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  n.setDate(n.getDate() - n.getDay());
  return n;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toLocalDatetimeInput(d: Date): string {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

export function Calendar() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());  // The day around which the view is centred
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [showNew, setShowNew] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    if (view === "month") {
      const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      from.setDate(from.getDate() - from.getDay());
      to.setDate(to.getDate() + (6 - to.getDay()));
      return { from, to };
    }
    if (view === "week") {
      const from = startOfWeek(anchor);
      const to = addDays(from, 7);
      return { from, to };
    }
    const from = new Date(anchor); from.setHours(0, 0, 0, 0);
    const to = addDays(from, 1);
    return { from, to };
  }, [view, anchor]);

  async function reload() {
    setLoading(true);
    try {
      const evs = await getCalendarEvents(range.from.toISOString(), range.to.toISOString());
      setEvents(evs);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, [range.from.getTime(), range.to.getTime()]);

  function navigate(direction: -1 | 1) {
    setAnchor(d => {
      const n = new Date(d);
      if (view === "month") n.setMonth(n.getMonth() + direction);
      else if (view === "week") n.setDate(n.getDate() + 7 * direction);
      else n.setDate(n.getDate() + direction);
      return n;
    });
  }

  function goToday() {
    const t = new Date();
    setAnchor(t);
    setSelected(t);
  }

  const title = useMemo(() => {
    if (view === "month") return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = addDays(s, 6);
      const sameMonth = s.getMonth() === e.getMonth();
      return sameMonth
        ? `${s.getDate()} – ${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
        : `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
    }
    return anchor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, [view, anchor]);

  return (
    <div className="flex h-full overflow-hidden relative">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 h-[52px] px-5 border-b border-brand-border no-select">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <div className="flex items-center gap-1 ml-auto">
            {(["month", "week", "day"] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-fast capitalize ${
                  view === v ? "bg-brand-dim text-brand" : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                {v}
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-brand-border" />
            <button
              onClick={goToday}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary border border-brand-border hover:bg-bg-hover transition-fast"
            >
              Today
            </button>
            <button onClick={() => navigate(-1)} className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover transition-fast">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button onClick={() => navigate(1)} className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover transition-fast">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-bg-deep transition-fast"
              style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              New Event
            </button>
          </div>
        </div>

        {loading && events.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-text-muted text-sm">Loading…</div>
        )}

        {view === "month" && <MonthView anchor={anchor} now={now} events={events} selected={selected} onSelectDay={setSelected} onOpenEvent={setOpenEvent} />}
        {view === "week" && <WeekView anchor={anchor} now={now} events={events} onOpenEvent={setOpenEvent} />}
        {view === "day" && <DayView anchor={anchor} now={now} events={events} onOpenEvent={setOpenEvent} />}
      </div>

      {/* Right detail panel (month view only) */}
      {view === "month" && (
        <DayDetailPanel
          day={selected}
          events={events.filter(ev => sameDay(new Date(ev.startAt), selected))}
          onOpenEvent={setOpenEvent}
        />
      )}

      {showNew && (
        <NewEventModal
          initialStart={selected}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); reload(); }}
        />
      )}

      {openEvent && (
        <EventDetailModal
          eventId={openEvent}
          currentUserId={user?.id}
          onClose={() => setOpenEvent(null)}
          onChanged={() => reload()}
        />
      )}
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({
  anchor, now, events, selected, onSelectDay, onOpenEvent,
}: {
  anchor: Date; now: Date; events: CalendarEvent[]; selected: Date;
  onSelectDay: (d: Date) => void; onOpenEvent: (id: string) => void;
}) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - monthStart.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <>
      <div className="grid grid-cols-7 border-b border-brand-border no-select">
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-text-muted">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {cells.map((cell, i) => {
          const inMonth = cell.getMonth() === anchor.getMonth();
          const isToday = sameDay(cell, now);
          const isSelected = sameDay(cell, selected);
          const dayEvents = events.filter(ev => sameDay(new Date(ev.startAt), cell));
          return (
            <button
              key={i}
              onClick={() => onSelectDay(cell)}
              className={`relative border-r border-b border-brand-border/40 p-1.5 text-left transition-fast hover:bg-bg-hover min-h-0 flex flex-col ${
                !inMonth ? "opacity-30" : ""
              } ${isSelected ? "bg-brand-dim" : ""}`}
            >
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium no-select ${
                isToday ? "bg-brand text-bg-deep font-bold" : "text-text-secondary"
              }`}>
                {cell.getDate()}
              </span>
              <div className="mt-0.5 flex-1 overflow-hidden space-y-px">
                {dayEvents.slice(0, 3).map(ev => (
                  <button
                    key={ev.id}
                    onClick={e => { e.stopPropagation(); onOpenEvent(ev.id); }}
                    className="block w-full truncate rounded px-1 text-[9px] font-medium leading-4 text-left hover:opacity-80 transition-fast"
                    style={{
                      background: `${ev.color ?? "#3B82F6"}25`,
                      color: ev.color ?? "#3B82F6",
                      borderLeft: `2px solid ${ev.color ?? "#3B82F6"}`,
                    }}
                  >
                    {ev.allDay ? ev.title : `${formatTime(ev.startAt)} ${ev.title}`}
                  </button>
                ))}
                {dayEvents.length > 3 && <span className="text-[9px] text-text-muted px-1">+{dayEvents.length - 3} more</span>}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────

function WeekView({ anchor, now, events, onOpenEvent }: { anchor: Date; now: Date; events: CalendarEvent[]; onOpenEvent: (id: string) => void }) {
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-12 flex-shrink-0 border-r border-brand-border pt-[28px]">
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="h-12 text-[9px] text-text-muted text-right pr-1.5 border-b border-brand-border/30 leading-3 pt-0.5">
            {h.toString().padStart(2, "0")}:00
          </div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 overflow-hidden">
        {days.map(d => {
          const isToday = sameDay(d, now);
          const dayEvents = events.filter(ev => sameDay(new Date(ev.startAt), d));
          return (
            <div key={d.toISOString()} className="relative border-r border-brand-border/40 overflow-hidden">
              <div className={`h-[28px] flex items-center justify-center gap-1.5 border-b border-brand-border no-select text-[11px] font-semibold ${isToday ? "text-brand bg-brand-dim/40" : "text-text-secondary"}`}>
                <span>{DAYS[d.getDay()]}</span>
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${isToday ? "bg-brand text-bg-deep" : ""}`}>
                  {d.getDate()}
                </span>
              </div>
              <div className="relative" style={{ height: 24 * 48 }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="absolute left-0 right-0 border-b border-brand-border/30" style={{ top: h * 48, height: 48 }} />
                ))}
                {dayEvents.map(ev => {
                  const start = new Date(ev.startAt);
                  const end = new Date(ev.endAt);
                  const top = start.getHours() * 48 + (start.getMinutes() / 60) * 48;
                  const height = Math.max(20, ((end.getTime() - start.getTime()) / 60_000 / 60) * 48);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onOpenEvent(ev.id)}
                      className="absolute left-1 right-1 rounded p-1 text-left text-[10px] leading-tight overflow-hidden hover:opacity-90 transition-fast"
                      style={{
                        top, height,
                        background: `${ev.color ?? "#3B82F6"}30`,
                        borderLeft: `2px solid ${ev.color ?? "#3B82F6"}`,
                        color: ev.color ?? "#3B82F6",
                      }}
                    >
                      <p className="font-semibold truncate">{ev.title}</p>
                      <p className="text-text-muted">{formatTime(ev.startAt)}–{formatTime(ev.endAt)}</p>
                    </button>
                  );
                })}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 h-[2px] bg-red-500 z-10 pointer-events-none"
                    style={{ top: now.getHours() * 48 + (now.getMinutes() / 60) * 48 }}
                  >
                    <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ anchor, now, events, onOpenEvent }: { anchor: Date; now: Date; events: CalendarEvent[]; onOpenEvent: (id: string) => void }) {
  const dayEvents = events.filter(ev => sameDay(new Date(ev.startAt), anchor));
  const isToday = sameDay(anchor, now);
  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-16 flex-shrink-0 border-r border-brand-border pt-2">
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="h-16 text-[10px] text-text-muted text-right pr-2 border-b border-brand-border/30 pt-0.5">
            {h.toString().padStart(2, "0")}:00
          </div>
        ))}
      </div>
      <div className="flex-1 relative overflow-y-auto" style={{ height: 24 * 64 + 8 }}>
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="absolute left-0 right-0 border-b border-brand-border/30" style={{ top: h * 64 + 8, height: 64 }} />
        ))}
        {dayEvents.map(ev => {
          const start = new Date(ev.startAt);
          const end = new Date(ev.endAt);
          const top = start.getHours() * 64 + (start.getMinutes() / 60) * 64 + 8;
          const height = Math.max(28, ((end.getTime() - start.getTime()) / 60_000 / 60) * 64);
          return (
            <button
              key={ev.id}
              onClick={() => onOpenEvent(ev.id)}
              className="absolute left-3 right-3 rounded-lg p-2 text-left overflow-hidden hover:opacity-90 transition-fast"
              style={{
                top, height,
                background: `${ev.color ?? "#3B82F6"}25`,
                borderLeft: `3px solid ${ev.color ?? "#3B82F6"}`,
                color: ev.color ?? "#3B82F6",
              }}
            >
              <p className="text-sm font-semibold truncate">{ev.title}</p>
              <p className="text-xs text-text-muted">{formatTime(ev.startAt)} – {formatTime(ev.endAt)}</p>
              {ev.location && <p className="text-[11px] text-text-muted truncate mt-1">📍 {ev.location}</p>}
            </button>
          );
        })}
        {isToday && (
          <div
            className="absolute left-0 right-0 h-[2px] bg-red-500 z-10 pointer-events-none"
            style={{ top: now.getHours() * 64 + (now.getMinutes() / 60) * 64 + 8 }}
          >
            <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Day detail (month view sidebar) ───────────────────────────────────────────

function DayDetailPanel({ day, events, onOpenEvent }: { day: Date; events: CalendarEvent[]; onOpenEvent: (id: string) => void }) {
  return (
    <div className="w-[280px] flex-shrink-0 border-l border-brand-border flex flex-col overflow-hidden">
      <div className="h-[52px] flex-shrink-0 flex items-center px-4 border-b border-brand-border no-select">
        <p className="text-sm font-semibold text-text-primary">
          {day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-text-muted">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-25">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <p className="text-xs">No events</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(ev => (
              <button
                key={ev.id}
                onClick={() => onOpenEvent(ev.id)}
                className="block w-full text-left rounded-lg border border-brand-border bg-bg-card p-3 hover:border-brand/40 transition-fast"
                style={{ borderLeftColor: ev.color ?? "#3B82F6", borderLeftWidth: "3px" }}
              >
                <p className="text-[13px] font-semibold text-text-primary leading-tight">{ev.title}</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {ev.allDay ? "All day" : `${formatTime(ev.startAt)} – ${formatTime(ev.endAt)}`}
                </p>
                {ev.location && <p className="text-[11px] text-text-muted mt-1">📍 {ev.location}</p>}
                {ev.meetingUrl && <p className="text-[11px] text-brand mt-1">🎥 Video meeting</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Event detail modal ────────────────────────────────────────────────────────

function EventDetailModal({
  eventId, currentUserId, onClose, onChanged,
}: {
  eventId: string;
  currentUserId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  type FullEvent = Awaited<ReturnType<typeof getCalendarEvent>>;
  const [event, setEvent] = useState<FullEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<{ title: string; description: string; location: string; startAt: string; endAt: string; meetingUrl: string }>({
    title: "", description: "", location: "", startAt: "", endAt: "", meetingUrl: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCalendarEvent(eventId)
      .then(ev => {
        setEvent(ev);
        setEdit({
          title: ev.title,
          description: ev.description ?? "",
          location: ev.location ?? "",
          startAt: toLocalDatetimeInput(new Date(ev.startAt)),
          endAt: toLocalDatetimeInput(new Date(ev.endAt)),
          meetingUrl: ev.meetingUrl ?? "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  const isOrganizer = event?.organizer?.id === currentUserId;
  const myAttendee = event?.attendees?.find(a => a.userId === currentUserId);

  async function handleSave() {
    if (!event) return;
    setSaving(true);
    try {
      await updateCalendarEvent(event.id, {
        title: edit.title,
        description: edit.description || null,
        location: edit.location || null,
        startAt: new Date(edit.startAt).toISOString(),
        endAt: new Date(edit.endAt).toISOString(),
        meetingUrl: edit.meetingUrl || null,
      });
      setEditing(false);
      onChanged();
      const refreshed = await getCalendarEvent(event.id);
      setEvent(refreshed);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!event || !confirm("Delete this event?")) return;
    try {
      await deleteCalendarEvent(event.id);
      onChanged();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleRsvp(status: "ACCEPTED" | "DECLINED" | "MAYBE") {
    if (!event) return;
    try {
      await rsvpEvent(event.id, status);
      const refreshed = await getCalendarEvent(event.id);
      setEvent(refreshed);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "RSVP failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 no-select">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[520px] max-h-[80vh] rounded-xl border border-brand-border bg-bg-card shadow-2xl flex flex-col overflow-hidden">
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-brand-border px-4">
          <h3 className="text-sm font-semibold text-text-primary">{editing ? "Edit event" : "Event details"}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading || !event ? (
            <div className="text-text-muted text-sm">Loading…</div>
          ) : editing ? (
            <>
              <Field label="Title">
                <input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start"><input type="datetime-local" value={edit.startAt} onChange={e => setEdit({ ...edit, startAt: e.target.value })} className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
                <Field label="End"><input type="datetime-local" value={edit.endAt} onChange={e => setEdit({ ...edit, endAt: e.target.value })} className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
              </div>
              <Field label="Location"><input value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} placeholder="Optional" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
              <Field label="Meeting URL"><input value={edit.meetingUrl} onChange={e => setEdit({ ...edit, meetingUrl: e.target.value })} placeholder="https://…" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
              <Field label="Description"><textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} rows={4} className="w-full resize-none rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: event.color ?? "#3B82F6" }} />
                  <h2 className="text-base font-semibold text-text-primary">{event.title}</h2>
                </div>
                <p className="text-sm text-text-muted">
                  {new Date(event.startAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · {formatTime(event.startAt)} – {formatTime(event.endAt)}
                </p>
              </div>

              {event.location && (
                <Info label="Location" icon="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z">
                  {event.location}
                </Info>
              )}

              {event.meetingUrl && (
                <button
                  onClick={() => window.nexus.system.openExternal(event.meetingUrl!)}
                  className="w-full rounded-md py-2 text-sm font-semibold text-bg-deep transition-fast"
                  style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}
                >
                  🎥 Join meeting
                </button>
              )}

              {event.description && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Description</p>
                  <p className="text-sm text-text-secondary whitespace-pre-wrap">{event.description}</p>
                </div>
              )}

              {event.organizer && (
                <Info label="Organizer" icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z">
                  {event.organizer.fullName}
                </Info>
              )}

              {event.attendees && event.attendees.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Attendees ({event.attendees.length})</p>
                  <div className="space-y-1">
                    {event.attendees.map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <div className="h-5 w-5 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-[10px] font-bold text-brand">
                          {(a.user?.fullName ?? a.name ?? a.email)[0]?.toUpperCase()}
                        </div>
                        <span className="text-text-secondary flex-1 truncate">{a.user?.fullName ?? a.name ?? a.email}</span>
                        <span className={`text-[10px] uppercase ${
                          a.status === "ACCEPTED" ? "text-green-400" :
                          a.status === "DECLINED" ? "text-red-400" :
                          a.status === "MAYBE" ? "text-amber-400" :
                          "text-text-muted"
                        }`}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RSVP buttons */}
              {myAttendee && !isOrganizer && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Your response</p>
                  <div className="flex gap-2">
                    {(["ACCEPTED", "MAYBE", "DECLINED"] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => handleRsvp(s)}
                        className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-fast border ${
                          myAttendee.status === s
                            ? s === "ACCEPTED" ? "bg-green-500/20 border-green-500/50 text-green-400"
                              : s === "DECLINED" ? "bg-red-500/20 border-red-500/50 text-red-400"
                              : "bg-amber-500/20 border-amber-500/50 text-amber-400"
                            : "border-brand-border text-text-secondary hover:bg-bg-hover"
                        }`}
                      >
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between border-t border-brand-border px-4 py-3">
          <div>
            {!editing && isOrganizer && (
              <button onClick={handleDelete} className="text-xs text-danger hover:underline">Delete</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} disabled={saving} className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-fast">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="rounded-md px-4 py-1.5 text-xs font-semibold text-bg-deep disabled:opacity-50" style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : isOrganizer ? (
              <button onClick={() => setEditing(true)} className="rounded-md px-3 py-1.5 text-xs font-semibold border border-brand-border text-text-primary hover:bg-bg-hover transition-fast">Edit</button>
            ) : (
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-fast">Close</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New event modal ───────────────────────────────────────────────────────────

function NewEventModal({ initialStart, onClose, onCreated }: { initialStart: Date; onClose: () => void; onCreated: () => void }) {
  const defaultStart = new Date(initialStart);
  defaultStart.setHours(9, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(10, 0, 0, 0);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState(toLocalDatetimeInput(defaultStart));
  const [endAt, setEndAt] = useState(toLocalDatetimeInput(defaultEnd));
  const [color, setColor] = useState(COLORS[0]);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { getWorkspaceMembers().then(setMembers).catch(() => {}); }, []);

  async function handleCreate() {
    if (!title.trim() || !startAt || !endAt) return;
    setSaving(true);
    try {
      await createCalendarEvent({
        title,
        description: description || undefined,
        location: location || undefined,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        color,
        meetingUrl: meetingUrl || undefined,
        attendeeIds: Array.from(attendeeIds),
      });
      onCreated();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  const filtered = members.filter(m => m.fullName.toLowerCase().includes(memberSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 no-select">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[480px] max-h-[85vh] rounded-xl border border-brand-border bg-bg-card shadow-2xl flex flex-col overflow-hidden">
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-brand-border px-4">
          <h3 className="text-sm font-semibold text-text-primary">New event</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <Field label="Title">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
            <Field label="End"><input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
          </div>
          <Field label="Location (optional)"><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room, address, or link" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
          <Field label="Meeting URL (optional)"><input value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="https://meet.cybersage.uk/…" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>

          <Field label="Color">
            <div className="flex gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full transition-fast ${color === c ? "ring-2 ring-offset-2 ring-offset-bg-card ring-brand" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </Field>

          <Field label="Attendees">
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search workspace" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40 mb-2" />
            <div className="max-h-[140px] overflow-y-auto rounded-md border border-brand-border bg-bg-deep">
              {filtered.slice(0, 30).map(m => (
                <button
                  key={m.id}
                  onClick={() => setAttendeeIds(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover transition-fast ${attendeeIds.has(m.id) ? "bg-brand-dim/40" : ""}`}
                >
                  <div className="h-5 w-5 flex-shrink-0 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-[10px] font-bold text-brand">
                    {m.fullName[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-[12px] text-text-primary truncate">{m.fullName}</span>
                  {attendeeIds.has(m.id) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Description (optional)"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full resize-none rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" /></Field>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 border-t border-brand-border px-4 py-3">
          <button onClick={onClose} disabled={saving} className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-fast">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !title.trim()} className="rounded-md px-4 py-1.5 text-xs font-semibold text-bg-deep disabled:opacity-50" style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}>
            {saving ? "Creating…" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

function Info({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted mt-0.5 flex-shrink-0">
        <path d={icon} />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
        <p className="text-sm text-text-secondary">{children}</p>
      </div>
    </div>
  );
}
