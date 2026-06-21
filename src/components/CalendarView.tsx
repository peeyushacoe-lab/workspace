"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  MapPin,
  Users,
  Clock,
  Loader2,
  Trash2,
  Check,
  Minus,
  Edit3,
  RefreshCw,
  Globe,
  Eye,
  CalendarSearch,
  Link2,
  Video,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  parseISO,
  setHours,
  setMinutes,
  getHours,
  getMinutes,
  differenceInMinutes,
  startOfDay,
  endOfDay,
} from "date-fns";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color?: string;
  meetingUrl?: string;
  organizerId: string;
  isRecurring: boolean;
  recurrenceRule?: string | null;
  visibility?: string;
  timezone?: string;
  organizer: { id: string; fullName: string };
  attendees: Array<{
    id: string;
    email: string;
    name?: string;
    status: string;
    userId?: string;
  }>;
};

type EventFormState = {
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  color: string;
  meetingUrl: string;
  attendeeEmails: string;
  recurrenceType: string;
  weeklyDays: string[];
  visibility: "PUBLIC" | "TEAM" | "PRIVATE";
  category: "" | "OUT_OF_OFFICE";
};

// ─── Availability types ───────────────────────────────────────────────────────

type AvailabilityResult = {
  slots: string[];
  availability: Record<string, ("free" | "busy")[]>;
  names: Record<string, string>;
};

// Sentinel stored in description to mark OOO events
const OOO_MARKER = "[OUT_OF_OFFICE]";
const _OOO_COLOR = "#F97316"; // orange-500

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { value: "#3B82F6", label: "Blue" },
  { value: "#10B981", label: "Green" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#EF4444", label: "Red" },
  { value: "#8B5CF6", label: "Purple" },
  { value: "#EC4899", label: "Pink" },
  { value: "#14B8A6", label: "Teal" },
  { value: "#F97316", label: "Orange" },
];

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "China (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const WEEKDAYS = [
  { short: "SU", label: "Sun", rrule: "SU" },
  { short: "MO", label: "Mon", rrule: "MO" },
  { short: "TU", label: "Tue", rrule: "TU" },
  { short: "WE", label: "Wed", rrule: "WE" },
  { short: "TH", label: "Thu", rrule: "TH" },
  { short: "FR", label: "Fri", rrule: "FR" },
  { short: "SA", label: "Sat", rrule: "SA" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8am–6pm
const HOUR_HEIGHT = 60;
const GRID_START = 8;

// Strip virtual recurring suffix to get the real DB event ID
const getRealId = (id: string) => id.split("__")[0];

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Build an rgba tint from a hex event colour for event backgrounds.
function hexToTint(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(0,194,255,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildRecurrenceRule(type: string, weeklyDays: string[]): string {
  switch (type) {
    case "DAILY":
      return "FREQ=DAILY";
    case "WEEKLY": {
      const days = weeklyDays.length > 0 ? weeklyDays.join(",") : "MO";
      return `FREQ=WEEKLY;BYDAY=${days}`;
    }
    case "MONTHLY":
      return "FREQ=MONTHLY";
    case "YEARLY":
      return "FREQ=YEARLY";
    default:
      return "";
  }
}

function parseRecurrenceType(rule: string | null | undefined): { type: string; weeklyDays: string[] } {
  if (!rule) return { type: "", weeklyDays: [] };
  if (rule.startsWith("FREQ=DAILY")) return { type: "DAILY", weeklyDays: [] };
  if (rule.startsWith("FREQ=WEEKLY")) {
    const match = rule.match(/BYDAY=([^;]+)/);
    const days = match ? match[1].split(",") : [];
    return { type: "WEEKLY", weeklyDays: days };
  }
  if (rule.startsWith("FREQ=MONTHLY")) return { type: "MONTHLY", weeklyDays: [] };
  if (rule.startsWith("FREQ=YEARLY")) return { type: "YEARLY", weeklyDays: [] };
  // Legacy simple format
  if (rule === "DAILY") return { type: "DAILY", weeklyDays: [] };
  if (rule === "WEEKLY") return { type: "WEEKLY", weeklyDays: [] };
  if (rule === "MONTHLY") return { type: "MONTHLY", weeklyDays: [] };
  if (rule === "YEARLY") return { type: "YEARLY", weeklyDays: [] };
  return { type: "", weeklyDays: [] };
}

function describeRecurrence(rule: string | null | undefined): string {
  if (!rule) return "";
  const { type, weeklyDays } = parseRecurrenceType(rule);
  if (type === "DAILY") return "Daily";
  if (type === "WEEKLY") {
    if (weeklyDays.length === 0) return "Weekly";
    const names = weeklyDays.map((d) => WEEKDAYS.find((w) => w.rrule === d)?.label ?? d);
    return `Weekly on ${names.join(", ")}`;
  }
  if (type === "MONTHLY") return "Monthly";
  if (type === "YEARLY") return "Yearly";
  return rule;
}

function blankForm(date?: Date): EventFormState {
  const base = date ?? new Date();
  const start = setMinutes(setHours(base, 9), 0);
  const end = setMinutes(setHours(base, 10), 0);
  return {
    title: "",
    description: "",
    location: "",
    startAt: format(start, "yyyy-MM-dd'T'HH:mm"),
    endAt: format(end, "yyyy-MM-dd'T'HH:mm"),
    allDay: false,
    timezone: "UTC",
    color: "#3B82F6",
    meetingUrl: "",
    attendeeEmails: "",
    recurrenceType: "",
    weeklyDays: [],
    visibility: "PUBLIC",
    category: "",
  };
}

/** Check whether an existing CalendarEvent is an OOO event. */
function isOOOEvent(event: CalendarEvent): boolean {
  return !!(event.description?.includes(OOO_MARKER));
}

function eventToForm(ev: CalendarEvent): EventFormState {
  const { type, weeklyDays } = parseRecurrenceType(ev.recurrenceRule);
  const isOOO = isOOOEvent(ev);
  // Strip the OOO marker from the displayed description
  const displayDesc = (ev.description ?? "").replace(OOO_MARKER, "").trim();
  return {
    title: ev.title,
    description: displayDesc,
    location: ev.location ?? "",
    startAt: format(parseISO(ev.startAt), "yyyy-MM-dd'T'HH:mm"),
    endAt: format(parseISO(ev.endAt), "yyyy-MM-dd'T'HH:mm"),
    allDay: ev.allDay,
    timezone: ev.timezone ?? "UTC",
    color: ev.color ?? "#3B82F6",
    meetingUrl: ev.meetingUrl ?? "",
    attendeeEmails: "",
    recurrenceType: type,
    weeklyDays,
    visibility: (ev.visibility as EventFormState["visibility"]) ?? "PUBLIC",
    category: isOOO ? "OUT_OF_OFFICE" : "",
  };
}

// ─── AttendeeChip ─────────────────────────────────────────────────────────────

function AttendeeChip({ email, name, status }: { email: string; name?: string; status?: string }) {
  const statusColors: Record<string, string> = {
    ACCEPTED: "bg-green-500/15 text-green-400",
    DECLINED: "bg-red-500/15 text-red-400",
    MAYBE: "bg-yellow-500/15 text-yellow-400",
    TENTATIVE: "bg-yellow-500/15 text-yellow-400",
    PENDING: "bg-[#12151D] text-[#8A92A6]",
  };
  const label = status ? statusColors[status] ?? "bg-[#12151D] text-[#8A92A6]" : "bg-[#00C2FF]/10 text-[#00C2FF]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${label}`}>
      {name ?? email}
      {status && <span className="opacity-70">· {status.toLowerCase()}</span>}
    </span>
  );
}

// ─── EventPill ────────────────────────────────────────────────────────────────

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-full bg-[#00C2FF]/10 text-[#00C2FF] rounded px-1 py-0.5 text-xs font-medium truncate cursor-pointer hover:bg-[#00C2FF]/20 text-left flex items-center gap-1 transition-colors"
      style={event.color && event.color !== "#3B82F6" ? { backgroundColor: event.color, color: "white" } : undefined}
      title={event.title}
    >
      {event.isRecurring && <RefreshCw className="w-2.5 h-2.5 flex-shrink-0 opacity-80" />}
      {event.allDay && <Globe className="w-2.5 h-2.5 flex-shrink-0 opacity-80" />}
      <span className="truncate">{event.title}</span>
    </button>
  );
}

// ─── Shared form fields ───────────────────────────────────────────────────────

function EventFormFields({
  form,
  setForm,
  showAttendees = false,
  existingAttendees = [],
}: {
  form: EventFormState;
  setForm: React.Dispatch<React.SetStateAction<EventFormState>>;
  showAttendees?: boolean;
  existingAttendees?: CalendarEvent["attendees"];
}) {
  const toggleWeekday = (day: string) => {
    setForm((f) => ({
      ...f,
      weeklyDays: f.weeklyDays.includes(day)
        ? f.weeklyDays.filter((d) => d !== day)
        : [...f.weeklyDays, day],
    }));
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Title *</label>
        <input
          autoFocus
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Event title"
          className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
        />
      </div>

      {/* All-day toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, allDay: !f.allDay }))}
          className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${form.allDay ? "bg-[#00C2FF] text-[#06121A]" : "bg-[#1B1F2A]"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-[#12151D] shadow transition-transform ${form.allDay ? "translate-x-4" : "translate-x-0"}`}
          />
        </button>
        <span className="text-xs font-medium text-[#8A92A6]">All day</span>
      </div>

      {/* Date/Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Start</label>
          {form.allDay ? (
            <input
              type="date"
              value={form.startAt.slice(0, 10)}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value + "T09:00" }))}
              className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
            />
          ) : (
            <input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
              className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#8A92A6]">End</label>
          {form.allDay ? (
            <input
              type="date"
              value={form.endAt.slice(0, 10)}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value + "T10:00" }))}
              className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
            />
          ) : (
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
            />
          )}
        </div>
      </div>

      {/* Timezone */}
      {!form.allDay && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Timezone</label>
          <select
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Recurrence */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Repeat</label>
        <select
          value={form.recurrenceType}
          onChange={(e) => setForm((f) => ({ ...f, recurrenceType: e.target.value, weeklyDays: [] }))}
          className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
        >
          <option value="">Does not repeat</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </select>
        {form.recurrenceType === "WEEKLY" && (
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {WEEKDAYS.map((day) => (
              <button
                key={day.rrule}
                type="button"
                onClick={() => toggleWeekday(day.rrule)}
                className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                  form.weeklyDays.includes(day.rrule)
                    ? "bg-[#00C2FF] text-[#06121A]"
                    : "bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A]"
                }`}
              >
                {day.short}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="Optional description"
          className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0] resize-none"
        />
      </div>

      {/* Location */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Location</label>
        <input
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Optional location (room, address, etc.)"
          className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
        />
      </div>

      {/* Visibility */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[#8A92A6]">Visibility</label>
        <div className="flex gap-2">
          {(["PUBLIC", "TEAM", "PRIVATE"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setForm((f) => ({ ...f, visibility: v }))}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                form.visibility === v
                  ? "bg-[#00C2FF] text-[#06121A] border-[#00C2FF]"
                  : "bg-[#12151D] text-[#8A92A6] border-[#262A35] hover:bg-[#12151D]"
              }`}
            >
              {v.charAt(0) + v.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Attendees */}
      {showAttendees && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[#8A92A6]">
            Invite by email (comma-separated)
          </label>
          <input
            value={form.attendeeEmails}
            onChange={(e) => setForm((f) => ({ ...f, attendeeEmails: e.target.value }))}
            placeholder="alice@example.com, bob@example.com"
            className="w-full bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
          />
        </div>
      )}

      {/* Existing attendees (edit mode) */}
      {existingAttendees.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#8A92A6]">Attendees</label>
          <div className="flex flex-wrap gap-1.5">
            {existingAttendees.map((a) => (
              <AttendeeChip key={a.id} email={a.email} name={a.name} status={a.status} />
            ))}
          </div>
        </div>
      )}

      {/* Color picker */}
      <div>
        <label className="mb-2 block text-xs font-medium text-[#8A92A6]">Color</label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map(({ value: color }) => (
            <button
              key={color}
              type="button"
              onClick={() => setForm((f) => ({ ...f, color }))}
              className="h-7 w-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
              style={{ backgroundColor: color }}
              title={color}
            >
              {form.color === color && <Check className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Meeting URL */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[#8A92A6]">Meeting URL</label>
        <div className="flex gap-2">
          <input
            value={form.meetingUrl}
            onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))}
            placeholder="https://… or auto-generate"
            className="flex-1 bg-[#12151D] border-transparent rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00C2FF] focus:bg-[#1B1F2A] text-[#E6E9F0]"
          />
          <button
            type="button"
            onClick={() => {
              const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
              const room = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
              setForm((f) => ({ ...f, meetingUrl: `${window.location.origin}/meet/${room}` }));
            }}
            className="flex-shrink-0 flex items-center gap-1.5 bg-[#12151D] border border-[#262A35] rounded-lg px-3 py-2 text-xs font-medium text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
          >
            <Video className="h-3 w-3" />
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Event Modal ───────────────────────────────────────────────────────

function AvailabilityGrid({ result }: { result: AvailabilityResult }) {
  if (!result.slots.length) return <p className="text-xs text-[#8A92A6]">No slots to display.</p>;

  const userIds = Object.keys(result.availability);
  // Group slots by date
  const byDate: Record<string, string[]> = {};
  for (const slot of result.slots) {
    const d = new Date(slot);
    const key = `${d.getMonth()}-${d.getDate()}`;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(slot);
  }
  const dateKeys = Object.keys(byDate);

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="text-[10px] font-semibold text-[#8A92A6] mb-2">
        Availability (9am–5pm)
      </div>
      <div className="min-w-max">
        {/* Header row: dates */}
        <div className="flex gap-px mb-1">
          <div className="w-20 flex-shrink-0" />
          {dateKeys.map((dk) => {
            const d = new Date(byDate[dk][0]);
            return (
              <div key={dk} className="w-8 text-center text-[9px] text-[#8A92A6] font-medium">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
                <br />
                {d.getDate()}
              </div>
            );
          })}
        </div>
        {/* Per-user rows */}
        {userIds.map((uid) => {
          const slots = result.availability[uid];
          let slotIdx = 0;
          return (
            <div key={uid} className="flex items-center gap-px mb-0.5">
              <div className="w-20 text-[10px] text-[#8A92A6] truncate pr-2 flex-shrink-0">
                {result.names[uid] ?? uid}
              </div>
              {dateKeys.map((dk) => (
                <div key={dk} className="flex gap-px">
                  {byDate[dk].map((slot) => {
                    const status = slots[slotIdx++];
                    return (
                      <div
                        key={slot}
                        title={`${new Date(slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${status}`}
                        className={`w-8 h-4 rounded-sm ${status === "busy" ? "bg-red-400" : "bg-green-400"}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
        {/* Legend */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-green-400" /><span className="text-[10px] text-[#8A92A6]">Free</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-400" /><span className="text-[10px] text-[#8A92A6]">Busy</span></div>
        </div>
      </div>
    </div>
  );
}

function CreateEventModal({
  defaultDate,
  onClose,
  onCreate,
}: {
  defaultDate: Date;
  onClose: () => void;
  onCreate: () => void;
}) {
  const [form, setForm] = useState<EventFormState>(blankForm(defaultDate));
  const [submitting, setSubmitting] = useState(false);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [availResult, setAvailResult] = useState<AvailabilityResult | null>(null);

  const handleCheckAvailability = async () => {
    const emails = form.attendeeEmails.split(",").map((e) => e.trim()).filter(Boolean);
    if (!emails.length) { toast.error("Add at least one attendee email"); return; }
    setCheckingAvail(true);
    try {
      const start = new Date(form.startAt);
      const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
      const res = await fetch(
        `/api/calendar/availability?emails=${encodeURIComponent(emails.join(","))}&start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json() as AvailabilityResult;
      setAvailResult(data);
    } catch {
      toast.error("Could not load availability");
    } finally {
      setCheckingAvail(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const attendees = form.attendeeEmails.split(",").map((e) => e.trim()).filter(Boolean);
      const recurrenceRule = form.recurrenceType
        ? buildRecurrenceRule(form.recurrenceType, form.weeklyDays)
        : undefined;

      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          location: form.location.trim() || undefined,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          allDay: form.allDay,
          timezone: form.timezone,
          visibility: form.visibility,
          color: form.color,
          meetingUrl: form.meetingUrl.trim() || undefined,
          attendeeEmails: attendees,
          recurrenceRule,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Event created");
      onCreate();
      onClose();
    } catch {
      toast.error("Could not create event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ">
      <div className="bg-[#12151D] rounded-xl shadow-2xl border border-[#262A35] p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#E6E9F0]">New Event</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[#1B1F2A] transition-colors">
            <X className="h-4 w-4 text-[#8A92A6]" />
          </button>
        </div>
        <EventFormFields form={form} setForm={setForm} showAttendees />

        {/* Availability check */}
        {form.attendeeEmails.trim() && (
          <div className="mt-3 border border-[#262A35] rounded-xl p-3 bg-[#12151D]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-[#E6E9F0]">Teammate Availability</span>
              <button
                type="button"
                onClick={handleCheckAvailability}
                disabled={checkingAvail}
                className="flex items-center gap-1.5 bg-[#12151D] text-[#8A92A6] hover:bg-[#12151D] border border-[#262A35] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {checkingAvail ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarSearch className="h-3 w-3" />}
                Check availability
              </button>
            </div>
            {availResult && <AvailabilityGrid result={availResult} />}
            {!availResult && !checkingAvail && (
              <p className="text-[11px] text-[#8A92A6]">Click &quot;Check availability&quot; to see free/busy slots for attendees.</p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-[#12151D] text-[#8A92A6] hover:bg-[#12151D] border border-[#262A35] rounded-lg px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#00C2FF] text-[#06121A] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Event
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Event Modal ─────────────────────────────────────────────────────────

function EditEventModal({
  event,
  onClose,
  onSaved,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<EventFormState>(eventToForm(event));
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const recurrenceRule = form.recurrenceType
        ? buildRecurrenceRule(form.recurrenceType, form.weeklyDays)
        : null;

      const res = await fetch(`/api/calendar/events/${getRealId(event.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          location: form.location.trim() || null,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          color: form.color,
          meetingUrl: form.meetingUrl.trim() || null,
          recurrenceRule,
          visibility: form.visibility,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Event updated");
      onSaved();
      onClose();
    } catch {
      toast.error("Could not update event");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events/${getRealId(event.id)}`, { method: "DELETE" });
      if (res.status === 403) { toast.error("You can only delete events you organize"); return; }
      if (!res.ok) throw new Error("Failed");
      toast.success("Event deleted");
      onDelete();
      onClose();
    } catch {
      toast.error("Could not delete event");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ">
      <div className="bg-[#12151D] rounded-xl shadow-2xl border border-[#262A35] p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#E6E9F0]">Edit Event</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[#1B1F2A] transition-colors">
            <X className="h-4 w-4 text-[#8A92A6]" />
          </button>
        </div>
        <EventFormFields form={form} setForm={setForm} existingAttendees={event.attendees} />
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-lg border border-red-700 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-60"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="bg-[#12151D] text-[#8A92A6] hover:bg-[#12151D] border border-[#262A35] rounded-lg px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="bg-[#00C2FF] text-[#06121A] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Event Detail Modal ───────────────────────────────────────────────────────

function EventDetailModal({
  event,
  currentUserId,
  onClose,
  onEdit,
  onDelete,
  onRSVP,
}: {
  event: CalendarEvent;
  currentUserId: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRSVP: (eventId: string, status: string) => void;
}) {
  const isOrganizer = event.organizerId === currentUserId;
  const currentAttendee = event.attendees.find((a) => a.userId === currentUserId);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events/${getRealId(event.id)}`, { method: "DELETE" });
      if (res.status === 403) { toast.error("You can only delete events you organize"); return; }
      if (!res.ok) throw new Error("Failed");
      toast.success("Event deleted");
      onDelete();
      onClose();
    } catch {
      toast.error("Could not delete event");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ">
      <div className="bg-[#12151D] rounded-xl shadow-2xl border border-[#262A35] w-full max-w-md overflow-hidden">
        {/* Header strip */}
        <div className="px-6 py-4" style={{ backgroundColor: event.color || "#3B82F6" }}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white truncate">{event.title}</h2>
                {event.isRecurring && (
                  <span title="Recurring event"><RefreshCw className="w-4 h-4 text-white/70 flex-shrink-0" /></span>
                )}
                {event.allDay && (
                  <span title="All day"><Globe className="w-4 h-4 text-white/70 flex-shrink-0" /></span>
                )}
              </div>
              <p className="mt-1 text-sm text-white/80">
                {event.allDay
                  ? format(parseISO(event.startAt), "PPP")
                  : `${format(parseISO(event.startAt), "PPP p")} – ${format(parseISO(event.endAt), "p")}`}
              </p>
              {event.visibility && event.visibility !== "PUBLIC" && (
                <p className="mt-0.5 text-xs text-white/60 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {event.visibility.charAt(0) + event.visibility.slice(1).toLowerCase()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isOrganizer && (
                <button
                  onClick={onEdit}
                  className="rounded-lg p-1.5 hover:bg-[#12151D]/20 transition-colors text-white"
                  title="Edit event"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              )}
              {/* Non-organizer attendees see "Edit RSVP" */}
              {!isOrganizer && currentAttendee && (
                <button
                  onClick={() => onRSVP(event.id, currentAttendee.status === "ACCEPTED" ? "DECLINED" : "ACCEPTED")}
                  className="rounded-lg p-1.5 hover:bg-[#12151D]/20 transition-colors text-white"
                  title="Toggle RSVP"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 hover:bg-[#12151D]/20 transition-colors"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          <div className="space-y-4">
            {event.description && (
              <p className="text-sm text-[#8A92A6]">{event.description}</p>
            )}
            {event.location && (
              <div className="flex items-center gap-2 text-sm text-[#8A92A6]">
                <MapPin className="h-4 w-4 text-[#8A92A6] shrink-0" />
                {event.location}
              </div>
            )}
            {event.meetingUrl && (
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-[#00C2FF] shrink-0" />
                <a
                  href={event.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00C2FF] hover:underline truncate"
                >
                  {event.meetingUrl.startsWith(window.location.origin)
                    ? "Join Meeting"
                    : event.meetingUrl}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-[#8A92A6]">
              <Clock className="h-4 w-4 text-[#8A92A6] shrink-0" />
              Organized by {event.organizer.fullName}
            </div>
            {event.isRecurring && event.recurrenceRule && (
              <div className="flex items-center gap-2 text-sm text-[#8A92A6]">
                <RefreshCw className="h-4 w-4 text-[#8A92A6] shrink-0" />
                {describeRecurrence(event.recurrenceRule)}
              </div>
            )}
            {event.attendees.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-[#8A92A6]" />
                  <span className="text-sm font-medium text-[#E6E9F0]">
                    {event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {event.attendees.map((a) => (
                    <AttendeeChip key={a.id} email={a.email} name={a.name} status={a.status} />
                  ))}
                </div>
              </div>
            )}

            {/* RSVP section for attendees */}
            {!isOrganizer && currentAttendee && (
              <div className="rounded-2xl bg-[#00C2FF]/10 p-4">
                <p className="mb-2 text-xs font-semibold text-[#00C2FF]">Your RSVP</p>
                <div className="flex gap-2">
                  {[
                    {
                      status: "ACCEPTED",
                      label: "Accept",
                      icon: Check,
                      activeClass: "bg-emerald-500 text-white hover:bg-emerald-600 rounded-md px-3 py-1.5 text-sm font-medium",
                      inactiveClass: "bg-[#12151D] border border-[#262A35] text-[#8A92A6] rounded-md px-3 py-1.5 text-sm font-medium",
                    },
                    {
                      status: "MAYBE",
                      label: "Maybe",
                      icon: Minus,
                      activeClass: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 border border-amber-500/20 rounded-md px-3 py-1.5 text-sm font-medium",
                      inactiveClass: "bg-[#12151D] border border-[#262A35] text-[#8A92A6] rounded-md px-3 py-1.5 text-sm font-medium",
                    },
                    {
                      status: "DECLINED",
                      label: "Decline",
                      icon: X,
                      activeClass: "bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/20 rounded-md px-3 py-1.5 text-sm font-medium",
                      inactiveClass: "bg-[#12151D] border border-[#262A35] text-[#8A92A6] rounded-md px-3 py-1.5 text-sm font-medium",
                    },
                  ].map(({ status, label, icon: Icon, activeClass, inactiveClass }) => (
                    <button
                      key={status}
                      onClick={() => onRSVP(event.id, status)}
                      className={`flex items-center gap-1.5 transition-colors ${
                        currentAttendee.status === status ? activeClass : inactiveClass
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {(isOrganizer || currentAttendee) && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg border border-[#ea4335]/50 px-3 py-2 text-sm font-medium text-[#ea4335] hover:bg-[#ea4335]/10 transition-colors disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Event
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mini Month Widget ────────────────────────────────────────────────────────

function MiniMonth({
  referenceDate,
  selectedDate,
  onSelectDate,
}: {
  referenceDate: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const [miniDate, setMiniDate] = useState(referenceDate);

  useEffect(() => {
    setMiniDate(referenceDate);
  }, [referenceDate]);

  const miniStart = startOfWeek(startOfMonth(miniDate));
  const miniEnd = endOfWeek(endOfMonth(miniDate));
  const miniDays = eachDayOfInterval({ start: miniStart, end: miniEnd });

  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-3 m-3">
      {/* Mini header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setMiniDate((d) => subMonths(d, 1))}
          className="p-2 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-lg transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-semibold text-[#E6E9F0]">{format(miniDate, "MMM yyyy")}</span>
        <button
          onClick={() => setMiniDate((d) => addMonths(d, 1))}
          className="p-2 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-lg transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-[#8A92A6]">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {miniDays.map((day) => {
          const inMonth = isSameMonth(day, miniDate);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`flex h-6 w-6 mx-auto items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                selected
                  ? "bg-[#00C2FF] text-[#06121A]"
                  : today
                  ? "bg-[#00C2FF]/10 text-[#00C2FF]"
                  : inMonth
                  ? "text-[#E6E9F0] hover:bg-[#12151D]"
                  : "text-[#8A92A6]"
              }`}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Grid (shared for week & day) ───────────────────────────────────────

function TimeGrid({
  days,
  events,
  now,
  onCellClick,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  now: Date;
  onCellClick: (day: Date, hour: number) => void;
  onEventClick: (ev: CalendarEvent) => void;
}) {
  const currentHour = getHours(now) + getMinutes(now) / 60;
  const nowTop = (currentHour - GRID_START) * HOUR_HEIGHT;
  const isSingleDay = days.length === 1;

  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className={`relative grid ${isSingleDay ? "grid-cols-[56px_1fr]" : "grid-cols-[56px_repeat(7,1fr)]"}`}>
        {/* Hour labels column */}
        <div className="col-span-1">
          {HOURS.map((h) => (
            <div
              key={h}
              className="pr-[9px] text-right font-mono text-[10.5px] text-[#5A6275] -translate-y-1.5"
              style={{ height: HOUR_HEIGHT }}
            >
              {formatHour(h)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const _dayStart = startOfDay(day);
          const _dayEnd = endOfDay(day);
          const dayEvs = events.filter((e) => {
            try {
              const evStart = parseISO(e.startAt);
              const evEnd = parseISO(e.endAt);
              return evStart <= _dayEnd && evEnd > _dayStart;
            } catch { return false; }
          });
          const isCurrentDay = isToday(day);

          return (
            <div key={day.toISOString()} className="relative border-l border-[#1C1F28]">
              {/* Hour cells — 30-min sub-rows */}
              {HOURS.map((h) => (
                <div key={h} className="border-b border-[#1C1F28]" style={{ height: HOUR_HEIGHT }}>
                  <div
                    className="h-1/2 hover:bg-[#00C2FF]/10 transition-colors cursor-pointer"
                    onClick={() => onCellClick(day, h)}
                  />
                  <div
                    className="h-1/2 hover:bg-[#00C2FF]/10 transition-colors cursor-pointer"
                    onClick={() => onCellClick(day, h)}
                  />
                </div>
              ))}

              {/* Current time indicator */}
              {isCurrentDay && nowTop >= 0 && nowTop <= HOUR_HEIGHT * HOURS.length && (
                <div
                  className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                  style={{ top: nowTop }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                  <div className="flex-1 h-px bg-red-500" />
                </div>
              )}

              {/* Events */}
              {dayEvs.map((event) => {
                try {
                  const start = parseISO(event.startAt);
                  const end = parseISO(event.endAt);
                  const startH = getHours(start) + getMinutes(start) / 60;
                  const topOffset = Math.max(0, (startH - GRID_START) * HOUR_HEIGHT);
                  const durationMins = Math.max(30, differenceInMinutes(end, start));
                  const height = (durationMins / 60) * HOUR_HEIGHT - 4;
                  const accent = event.color || "#00C2FF";

                  return (
                    <button
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                      className="absolute left-1 right-1 rounded-[7px] px-[9px] py-1.5 text-left overflow-hidden hover:brightness-110 transition-all"
                      style={{
                        top: topOffset,
                        height,
                        background: hexToTint(accent, 0.16),
                        borderLeft: `3px solid ${accent}`,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {event.isRecurring && <RefreshCw className="w-2.5 h-2.5 flex-shrink-0" style={{ color: accent }} />}
                        <p className="truncate text-xs font-bold" style={{ color: accent }}>{event.title}</p>
                      </div>
                      {!event.allDay && (
                        <p className="truncate font-mono text-[10.5px] mt-px" style={{ color: accent, opacity: 0.85 }}>
                          {format(start, "h:mm")} – {format(end, "h:mm a")}
                        </p>
                      )}
                    </button>
                  );
                } catch {
                  return null;
                }
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main CalendarView ────────────────────────────────────────────────────────

export function CalendarView({ currentUserId }: { currentUserId: string }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  const [newEventDate, setNewEventDate] = useState<Date>(new Date());
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Tick every minute for the time indicator
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      let from: Date, to: Date;
      if (view === "month") {
        from = startOfWeek(startOfMonth(currentDate));
        to = endOfWeek(endOfMonth(currentDate));
      } else if (view === "week") {
        from = startOfWeek(currentDate);
        to = endOfWeek(currentDate);
      } else {
        from = startOfDay(currentDate);
        to = endOfDay(currentDate);
      }
      const res = await fetch(
        `/api/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}`
      );
      if (res.ok) setEvents((await res.json()) as CalendarEvent[]);
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [currentDate, view]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const openNewEventModal = (date: Date, hour?: number) => {
    const base = hour !== undefined ? setMinutes(setHours(date, hour), 0) : date;
    setNewEventDate(base);
    setShowNewEvent(true);
  };

  const handleRSVP = async (eventId: string, status: string) => {
    try {
      const res = await fetch(`/api/calendar/events/${getRealId(eventId)}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`RSVP updated`);
      fetchEvents();
    } catch {
      toast.error("Could not update RSVP");
    }
  };

  const navigate = (dir: "prev" | "next") => {
    if (view === "month") setCurrentDate(dir === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(dir === "prev" ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    else setCurrentDate(dir === "prev" ? subDays(currentDate, 1) : addDays(currentDate, 1));
  };

  const headerTitle = () => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    if (view === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    const ws = startOfWeek(currentDate);
    return `${format(ws, "MMM d")} – ${format(addDays(ws, 6), "MMM d, yyyy")}`;
  };

  // Month view data
  const calDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  // Week view data
  const weekStart = startOfWeek(currentDate);
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  return (
    <div className="flex h-full bg-[#12151D]">
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-52 flex-col bg-[#12151D] border-r border-[#262A35] flex-shrink-0">
        {/* New Event button */}
        <div className="p-3 border-b border-[#262A35]">
          <button
            onClick={() => openNewEventModal(currentDate)}
            className="w-full bg-[#00C2FF] text-[#06121A] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Event
          </button>
        </div>

        {/* Mini month */}
        <MiniMonth
          referenceDate={currentDate}
          selectedDate={currentDate}
          onSelectDate={(date) => {
            setCurrentDate(date);
            if (view === "month") {
              // stay in month but jump to that month
              setCurrentDate(date);
            } else {
              setCurrentDate(date);
            }
          }}
        />

        {/* Color legend */}
        <div className="px-3 pt-2 pb-4">
          <p className="text-xs font-semibold text-[#8A92A6] px-4 py-2 -mx-3">Legend</p>
          <div className="space-y-1.5">
            {[
              { color: "#3B82F6", label: "Personal" },
              { color: "#10B981", label: "Team" },
              { color: "#F97316", label: "Out of Office" },
              { color: "#8B5CF6", label: "Appointment" },
            ].map(({ color, label }) => (
              <div key={color} className="flex items-center gap-2 text-sm text-[#8A92A6] py-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-[#8A92A6]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ─── Main Calendar Area ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="h-14 px-[22px] border-b border-[#262A35] bg-[#12151D] flex items-center gap-4 flex-shrink-0">
          <h2 className="text-[17px] font-bold text-[#E6E9F0] tracking-[-0.3px] whitespace-nowrap">{headerTitle()}</h2>

          {/* Prev / next joined pair */}
          <div className="flex">
            <button
              onClick={() => navigate("prev")}
              className="w-8 h-8 flex items-center justify-center border border-[#262A35] rounded-l-lg bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
            >
              <ChevronLeft className="h-[15px] w-[15px]" />
            </button>
            <button
              onClick={() => navigate("next")}
              className="w-8 h-8 flex items-center justify-center border border-l-0 border-[#262A35] rounded-r-lg bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
            >
              <ChevronRight className="h-[15px] w-[15px]" />
            </button>
          </div>

          {/* Today */}
          <button
            onClick={() => setCurrentDate(new Date())}
            className="h-8 px-3.5 border border-[#262A35] rounded-lg bg-[#12151D] text-[12.5px] font-semibold text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors"
          >
            Today
          </button>

          {loading && <Loader2 className="h-4 w-4 animate-spin text-[#00C2FF]" />}

          <div className="flex-1" />

          {/* View switcher — segmented control */}
          <div className="flex p-[3px] gap-0.5 bg-[#12151D] border border-[#262A35] rounded-[9px]">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`h-7 px-4 rounded-md text-[12.5px] font-semibold capitalize transition-colors ${
                  view === v
                    ? "bg-[#00C2FF] text-[#06121A]"
                    : "text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* + Event primary */}
          <button
            onClick={() => openNewEventModal(currentDate)}
            className="h-[34px] px-4 rounded-lg text-[12.5px] font-bold text-[#06121A] flex items-center gap-[7px] hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #00C2FF, #0098E6)" }}
          >
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.6} />
            Event
          </button>
        </div>

        {/* Calendar body */}
        <div className="flex-1 overflow-hidden">
          {/* ── Month view ── */}
          {view === "month" && (
            <div className="flex h-full flex-col">
              <div className="grid grid-cols-7 border-b border-[#262A35] bg-[#12151D]">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-[#6B7385] text-center py-3">
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
                  {calDays.map((day) => {
                    const dayStart = startOfDay(day);
                    const dayEnd = endOfDay(day);
                    const dayEvents = events.filter((e) => {
                      try {
                        const evStart = parseISO(e.startAt);
                        const evEnd = parseISO(e.endAt);
                        // Show on every day the event spans (startAt ≤ dayEnd AND endAt > dayStart)
                        return evStart <= dayEnd && evEnd > dayStart;
                      } catch { return false; }
                    });
                    const inMonth = isSameMonth(day, currentDate);
                    const today = isToday(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className={`border border-[#1C1F28] p-1.5 min-h-[80px] cursor-pointer hover:bg-[#1B1F2A] transition-colors ${
                          today ? "bg-[#00C2FF]/[0.06]" : "bg-[#12151D]"
                        }`}
                        onClick={() => openNewEventModal(day)}
                      >
                        <div className="mb-1 flex justify-start">
                          {today ? (
                            <span className="bg-[#00C2FF] text-[#06121A] rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold mx-auto">
                              {format(day, "d")}
                            </span>
                          ) : (
                            <span
                              className={inMonth ? "text-xs text-[#E6E9F0] text-center" : "text-xs text-[#8A92A6]/40"}
                            >
                              {format(day, "d")}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map((event) => (
                            <EventPill
                              key={event.id}
                              event={event}
                              onClick={() => setSelectedEvent(event)}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <p className="px-1 text-[10px] text-[#8A92A6]">
                              +{dayEvents.length - 3} more
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Week view ── */}
          {view === "week" && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-[#262A35] bg-[#12151D] flex-shrink-0">
                <div />
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="pt-3 pb-[11px] text-center cursor-pointer border-l border-[#1C1F28] hover:bg-[#1B1F2A] transition-colors"
                    onClick={() => { setCurrentDate(day); setView("day"); }}
                  >
                    <div className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-[#6B7385]">
                      {format(day, "EEE")}
                    </div>
                    <div
                      className={`mx-auto mt-[5px] inline-flex h-[30px] w-[30px] items-center justify-center rounded-full text-[15px] font-bold ${
                        isToday(day) ? "bg-[#00C2FF] text-[#06121A]" : "text-[#E6E9F0]"
                      }`}
                    >
                      {format(day, "d")}
                    </div>
                  </div>
                ))}
              </div>
              <TimeGrid
                days={weekDays}
                events={events}
                now={now}
                onCellClick={(day, hour) => openNewEventModal(day, hour)}
                onEventClick={setSelectedEvent}
              />
            </div>
          )}

          {/* ── Day view ── */}
          {view === "day" && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="grid grid-cols-[56px_1fr] border-b border-[#262A35] bg-[#12151D] flex-shrink-0">
                <div />
                <div className="pt-3 pb-[11px] text-center border-l border-[#1C1F28]">
                  <div className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-[#6B7385]">
                    {format(currentDate, "EEE")}
                  </div>
                  <div
                    className={`mx-auto mt-[5px] inline-flex h-[30px] w-[30px] items-center justify-center rounded-full text-[15px] font-bold ${
                      isToday(currentDate) ? "bg-[#00C2FF] text-[#06121A]" : "text-[#E6E9F0]"
                    }`}
                  >
                    {format(currentDate, "d")}
                  </div>
                </div>
              </div>
              <TimeGrid
                days={[currentDate]}
                events={events}
                now={now}
                onCellClick={(day, hour) => openNewEventModal(day, hour)}
                onEventClick={setSelectedEvent}
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Modals ───────────────────────────────────────────────────────── */}
      {showNewEvent && (
        <CreateEventModal
          defaultDate={newEventDate}
          onClose={() => setShowNewEvent(false)}
          onCreate={fetchEvents}
        />
      )}

      {selectedEvent && !editingEvent && (
        <EventDetailModal
          event={selectedEvent}
          currentUserId={currentUserId}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => {
            setEditingEvent(selectedEvent);
            setSelectedEvent(null);
          }}
          onDelete={fetchEvents}
          onRSVP={handleRSVP}
        />
      )}

      {editingEvent && (
        <EditEventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={fetchEvents}
          onDelete={fetchEvents}
        />
      )}
    </div>
  );
}
