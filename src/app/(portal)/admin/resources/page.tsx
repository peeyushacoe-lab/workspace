"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Wrench,
  Car,
  Plus,
  Trash2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Clock,
  MapPin,
  Users,
  X,
  CalendarDays,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResourceType = "room" | "equipment" | "vehicle";

type Resource = {
  id: string;
  name: string;
  type: ResourceType;
  capacity?: number;
  location?: string;
  description?: string;
  available: boolean;
  createdAt: string;
};

type Booking = {
  id: string;
  resourceId: string;
  bookedBy: string;
  bookedByName: string;
  title: string;
  startTime: string;
  endTime: string;
  createdAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08–20

const TYPE_ICONS: Record<ResourceType, typeof Building2> = {
  room: Building2,
  equipment: Wrench,
  vehicle: Car,
};

const TYPE_LABELS: Record<ResourceType, string> = {
  room: "Room",
  equipment: "Equipment",
  vehicle: "Vehicle",
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoToHhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Returns [leftPercent, widthPercent] for positioning a booking bar within the
 * 08:00–20:00 grid (720 minutes total).
 */
function slotPosition(startIso: string, endIso: string): { left: number; width: number } {
  const GRID_START = 8 * 60; // minutes since midnight
  const GRID_TOTAL = 12 * 60;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const clampedStart = Math.max(startMin, GRID_START);
  const clampedEnd = Math.min(endMin, GRID_START + GRID_TOTAL);
  const left = ((clampedStart - GRID_START) / GRID_TOTAL) * 100;
  const width = ((clampedEnd - clampedStart) / GRID_TOTAL) * 100;
  return { left, width };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResourceCard({
  resource,
  isAdmin,
  onToggle,
  onDelete,
}: {
  resource: Resource;
  isAdmin: boolean;
  onToggle: (id: string, available: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = TYPE_ICONS[resource.type];

  return (
    <div className="bg-white border border-[#e8eaed] rounded-xl p-4 hover:border-[#d0d5dd] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5 h-8 w-8 rounded-lg bg-[#1a56db]/10 border border-[#1a56db]/20 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-[#1a56db]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-[#202124] truncate">{resource.name}</h3>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#f1f3f4] text-[#5f6368]">
                {TYPE_LABELS[resource.type]}
              </span>
            </div>
            {resource.description && (
              <p className="text-xs text-[#9aa0a6] mt-0.5 line-clamp-1">{resource.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {resource.location && (
                <span className="flex items-center gap-1 text-xs text-[#5f6368]">
                  <MapPin className="h-3 w-3" />
                  {resource.location}
                </span>
              )}
              {resource.capacity != null && (
                <span className="flex items-center gap-1 text-xs text-[#5f6368]">
                  <Users className="h-3 w-3" />
                  Cap. {resource.capacity}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              resource.available
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-rose-500/10 text-rose-400"
            }`}
          >
            {resource.available ? "Available" : "Unavailable"}
          </span>
          {isAdmin && (
            <>
              <button
                onClick={() => onToggle(resource.id, !resource.available)}
                className="text-[#9aa0a6] hover:text-[#1a56db] transition-colors"
                title="Toggle availability"
              >
                {resource.available ? (
                  <ToggleRight className="h-5 w-5 text-emerald-400" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => onDelete(resource.id)}
                className="text-[#9aa0a6] hover:text-rose-400 transition-colors"
                title="Delete resource"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Resource Form ────────────────────────────────────────────────────────

function NewResourceForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    type: "room" as ResourceType,
    capacity: "",
    location: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          capacity: form.capacity ? parseInt(form.capacity) : undefined,
          location: form.location.trim() || undefined,
          description: form.description.trim() || undefined,
          available: true,
        }),
      });
      if (res.ok) {
        toast.success("Resource created");
        setForm({ name: "", type: "room", capacity: "", location: "", description: "" });
        onCreated();
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to create resource");
      }
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-white border border-[#e8eaed] rounded-lg text-sm text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/50 px-3 py-2";

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="bg-white border border-[#e8eaed] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[#202124] flex items-center gap-2">
        <Plus className="h-4 w-4 text-[#1a56db]" />
        Add New Resource
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#5f6368] mb-1">Name *</label>
          <input
            className={inputCls}
            placeholder="e.g. Conference Room A"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="block text-xs text-[#5f6368] mb-1">Type *</label>
          <div className="relative">
            <select
              className={`${inputCls} appearance-none pr-8`}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ResourceType }))}
            >
              <option value="room">Room</option>
              <option value="equipment">Equipment</option>
              <option value="vehicle">Vehicle</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9aa0a6]" />
          </div>
        </div>

        {form.type === "room" && (
          <div>
            <label className="block text-xs text-[#5f6368] mb-1">Capacity</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              placeholder="Max occupants"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-[#5f6368] mb-1">Location</label>
          <input
            className={inputCls}
            placeholder="e.g. Floor 3, East Wing"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </div>

        <div className={form.type === "room" ? "sm:col-span-2" : "sm:col-span-1"}>
          <label className="block text-xs text-[#5f6368] mb-1">Description</label>
          <input
            className={inputCls}
            placeholder="Optional notes"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create Resource"}
        </button>
      </div>
    </form>
  );
}

// ─── Booking Timeline Grid ────────────────────────────────────────────────────

function BookingTimeline({
  bookings,
  selectedDate: _selectedDate,
  onSlotClick,
  onCancelBooking,
  currentUserId,
  isAdmin,
}: {
  bookings: Booking[];
  selectedDate?: string;
  onSlotClick: (hour: number) => void;
  onCancelBooking: (booking: Booking) => void;
  currentUserId: string;
  isAdmin: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Hour header */}
        <div className="flex border-b border-[#e8eaed] mb-1">
          <div className="w-12 flex-shrink-0" />
          <div className="flex-1 relative h-6">
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute text-[10px] text-[#9aa0a6] -translate-x-1/2"
                style={{ left: `${((h - 8) / 12) * 100}%` }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </div>

        {/* Timeline row */}
        <div className="flex items-center gap-2">
          <div className="w-12 flex-shrink-0 text-xs text-[#9aa0a6] text-right pr-2">
            <CalendarDays className="h-3.5 w-3.5 inline" />
          </div>
          <div className="flex-1 relative h-12 bg-white rounded-lg border border-[#e8eaed] overflow-hidden">
            {/* Hour slot clickable regions */}
            {Array.from({ length: 12 }, (_, i) => (
              <button
                key={i}
                onClick={() => onSlotClick(i + 8)}
                className="absolute top-0 h-full border-r border-[#e8eaed] hover:bg-[#1a56db]/5 transition-colors"
                style={{ left: `${(i / 12) * 100}%`, width: `${(1 / 12) * 100}%` }}
                title={`Book ${String(i + 8).padStart(2, "0")}:00`}
              />
            ))}

            {/* Booking bars */}
            {bookings.map((b) => {
              const { left, width } = slotPosition(b.startTime, b.endTime);
              if (width <= 0) return null;
              const canCancel = isAdmin || b.bookedBy === currentUserId;
              return (
                <div
                  key={b.id}
                  className="absolute top-1 bottom-1 rounded bg-[#1a56db]/20 border border-[#1a56db]/40 px-1.5 flex items-center gap-1 group overflow-hidden"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${b.title} — ${b.bookedByName}\n${isoToHhmm(b.startTime)}–${isoToHhmm(b.endTime)}`}
                >
                  <span className="text-[10px] text-[#1a56db] font-medium truncate flex-1 leading-none">
                    {b.title}
                  </span>
                  {canCancel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelBooking(b);
                      }}
                      className="hidden group-hover:flex items-center justify-center flex-shrink-0 h-4 w-4 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10px] text-[#bdc1c6] mt-1.5 ml-14">
          Click an empty slot to book · Hover a booking to cancel
        </p>
      </div>
    </div>
  );
}

// ─── Book Slot Form ───────────────────────────────────────────────────────────

function BookSlotForm({
  resourceId,
  date,
  defaultHour,
  onBooked,
  onClose,
}: {
  resourceId: string;
  date: string;
  defaultHour: number;
  onBooked: () => void;
  onClose: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [title, setTitle] = useState("");
  const [startH, setStartH] = useState(defaultHour);
  const [startM, setStartM] = useState(0);
  const [endH, setEndH] = useState(Math.min(defaultHour + 1, 20));
  const [endM, setEndM] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }

    const startTime = `${date}T${pad(startH)}:${pad(startM)}:00`;
    const endTime = `${date}T${pad(endH)}:${pad(endM)}:00`;

    if (new Date(endTime) <= new Date(startTime)) {
      toast.error("End time must be after start time");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/resources/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId, title: title.trim(), startTime, endTime }),
      });
      if (res.ok) {
        toast.success("Booking created");
        onBooked();
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to create booking");
      }
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "bg-white border border-[#e8eaed] rounded-lg text-sm text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/50 px-3 py-2";

  const TimeSelect = ({
    h, m, onH, onM,
  }: { h: number; m: number; onH: (v: number) => void; onM: (v: number) => void }) => (
    <div className="flex items-center gap-1">
      <div className="relative">
        <select
          className={`${inputCls} w-16 appearance-none pr-5 text-center`}
          value={h}
          onChange={(e) => onH(parseInt(e.target.value))}
        >
          {Array.from({ length: 13 }, (_, i) => i + 8).map((hour) => (
            <option key={hour} value={hour}>{pad(hour)}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9aa0a6]" />
      </div>
      <span className="text-[#9aa0a6]">:</span>
      <div className="relative">
        <select
          className={`${inputCls} w-16 appearance-none pr-5 text-center`}
          value={m}
          onChange={(e) => onM(parseInt(e.target.value))}
        >
          {[0, 15, 30, 45].map((min) => (
            <option key={min} value={min}>{pad(min)}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9aa0a6]" />
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-[#e8eaed] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#202124] flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#1a56db]" />
          Book a Slot — {date}
        </h3>
        <button onClick={onClose} className="text-[#9aa0a6] hover:text-[#202124] transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
        <div>
          <label className="block text-xs text-[#5f6368] mb-1">Meeting / Event Title *</label>
          <input
            className="w-full bg-white border border-[#e8eaed] rounded-lg text-sm text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/50 px-3 py-2"
            placeholder="e.g. Security review"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-[#5f6368] mb-1">Start</label>
            <TimeSelect h={startH} m={startM} onH={setStartH} onM={setStartM} />
          </div>
          <div>
            <label className="block text-xs text-[#5f6368] mb-1">End</label>
            <TimeSelect h={endH} m={endM} onH={setEndH} onM={setEndM} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#f1f3f4] text-[#5f6368] border border-[#e8eaed] hover:bg-[#2e334a] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors disabled:opacity-50"
          >
            {saving ? "Booking…" : "Confirm Booking"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResourcesPage() {
  // Resources state
  const [resources, setResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ResourceType | "all">("all");

  // Booking viewer state
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Book slot form
  const [bookingFormHour, setBookingFormHour] = useState<number | null>(null);

  // Current user role (from a lightweight /api/me or parsed from cookie)
  // We infer admin status by checking if admin-only actions succeed.
  // We read it from the server via a dedicated state — use a simple approach:
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  // Load current user info on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = (await res.json()) as { id?: string; role?: string };
          setCurrentUserId(data.id ?? "");
          setIsAdmin(data.role === "ADMIN");
        }
      } catch {
        // best-effort
      }
    })();
  }, []);

  // ─── Load resources ─────────────────────────────────────────────────────────

  const loadResources = useCallback(async () => {
    setLoadingResources(true);
    try {
      const url =
        typeFilter !== "all"
          ? `/api/admin/resources?type=${typeFilter}`
          : "/api/admin/resources";
      const res = await fetch(url);
      if (res.ok) {
        setResources((await res.json()) as Resource[]);
      }
    } finally {
      setLoadingResources(false);
    }
  }, [typeFilter]);

  useEffect(() => { void loadResources(); }, [loadResources]);

  // ─── Load bookings ───────────────────────────────────────────────────────────

  const loadBookings = useCallback(async () => {
    if (!selectedResourceId) { setBookings([]); return; }
    setLoadingBookings(true);
    try {
      const res = await fetch(
        `/api/admin/resources/bookings?resourceId=${selectedResourceId}&date=${selectedDate}`
      );
      if (res.ok) {
        setBookings((await res.json()) as Booking[]);
      }
    } finally {
      setLoadingBookings(false);
    }
  }, [selectedResourceId, selectedDate]);

  useEffect(() => { void loadBookings(); }, [loadBookings]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const toggleAvailability = async (id: string, available: boolean) => {
    const res = await fetch("/api/admin/resources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, available }),
    });
    if (res.ok) {
      toast.success(`Marked ${available ? "available" : "unavailable"}`);
      void loadResources();
    } else {
      toast.error("Failed to update");
    }
  };

  const deleteResource = async (id: string) => {
    if (!confirm("Delete this resource? All its bookings will also be removed.")) return;
    const res = await fetch(`/api/admin/resources?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Resource deleted");
      if (selectedResourceId === id) setSelectedResourceId("");
      void loadResources();
    } else {
      toast.error("Failed to delete");
    }
  };

  const cancelBooking = async (booking: Booking) => {
    if (!confirm(`Cancel "${booking.title}"?`)) return;
    const res = await fetch(
      `/api/admin/resources/bookings?id=${booking.id}&resourceId=${booking.resourceId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Booking cancelled");
      void loadBookings();
    } else {
      const data = (await res.json()) as { error?: string };
      toast.error(data.error ?? "Failed to cancel");
    }
  };

  // ─── Filtered resource list ──────────────────────────────────────────────────

  const filteredResources = resources; // already filtered server-side

  const inputCls =
    "bg-white border border-[#e8eaed] rounded-lg text-sm text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/50 px-3 py-2";

  return (
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow="Admin"
        title="Resource Calendars"
        description="Manage bookable rooms, equipment, and vehicles for your workspace."
        action={
          <button
            onClick={() => { void loadResources(); }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <div className="px-6 py-6 max-w-5xl space-y-8">

        {/* ── Section: Resource Registry ─────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-[#202124]">Resource Registry</h2>

            {/* Type filter tabs */}
            <div className="flex items-center gap-1 bg-white border border-[#e8eaed] rounded-lg p-1">
              {(["all", "room", "equipment", "vehicle"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    typeFilter === t
                      ? "bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20"
                      : "text-[#9aa0a6] hover:text-[#5f6368]"
                  }`}
                >
                  {t === "all" ? "All" : TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {loadingResources ? (
            <div className="text-xs text-[#9aa0a6] py-8 text-center">Loading resources…</div>
          ) : filteredResources.length === 0 ? (
            <div className="text-xs text-[#9aa0a6] py-8 text-center bg-white rounded-xl border border-[#e8eaed]">
              No resources found. {isAdmin && "Add one below."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredResources.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  isAdmin={isAdmin}
                  onToggle={(id, available) => { void toggleAvailability(id, available); }}
                  onDelete={(id) => { void deleteResource(id); }}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Section: Add Resource (admin only) ────────────────────────────── */}
        {isAdmin && (
          <section>
            <NewResourceForm onCreated={() => { void loadResources(); }} />
          </section>
        )}

        {/* ── Section: Booking Viewer ────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[#202124]">Booking Viewer</h2>

          <div className="bg-white border border-[#e8eaed] rounded-xl p-5 space-y-5">
            {/* Resource + Date selectors */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-[#5f6368] mb-1">Select Resource</label>
                <div className="relative">
                  <select
                    className={`${inputCls} w-full appearance-none pr-8`}
                    value={selectedResourceId}
                    onChange={(e) => {
                      setSelectedResourceId(e.target.value);
                      setBookingFormHour(null);
                    }}
                  >
                    <option value="">— choose a resource —</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({TYPE_LABELS[r.type]})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9aa0a6]" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#5f6368] mb-1">Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setBookingFormHour(null);
                  }}
                />
              </div>

              <button
                onClick={() => { void loadBookings(); }}
                disabled={!selectedResourceId}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Load
              </button>
            </div>

            {/* Timeline */}
            {!selectedResourceId ? (
              <div className="text-xs text-[#9aa0a6] py-6 text-center">
                Select a resource above to view its bookings.
              </div>
            ) : loadingBookings ? (
              <div className="text-xs text-[#9aa0a6] py-6 text-center">Loading bookings…</div>
            ) : (
              <>
                <BookingTimeline
                  bookings={bookings}
                  selectedDate={selectedDate}
                  onSlotClick={(hour) => setBookingFormHour(hour)}
                  onCancelBooking={(b) => { void cancelBooking(b); }}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />

                {/* Booking summary list */}
                {bookings.length > 0 && (
                  <div className="space-y-2 border-t border-[#e8eaed] pt-4">
                    <p className="text-xs font-semibold text-[#5f6368]">
                      {bookings.length} booking{bookings.length !== 1 ? "s" : ""} on {selectedDate}
                    </p>
                    {bookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 bg-white rounded-lg border border-[#e8eaed]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="h-3.5 w-3.5 text-[#1a56db] flex-shrink-0" />
                          <span className="text-xs font-medium text-[#202124] truncate">{b.title}</span>
                          <span className="text-xs text-[#9aa0a6] flex-shrink-0">
                            {isoToHhmm(b.startTime)}–{isoToHhmm(b.endTime)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-[#5f6368]">{b.bookedByName}</span>
                          {(isAdmin || b.bookedBy === currentUserId) && (
                            <button
                              onClick={() => { void cancelBooking(b); }}
                              className="text-[#9aa0a6] hover:text-rose-400 transition-colors"
                              title="Cancel booking"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── Section: Book a Slot ───────────────────────────────────────────── */}
        {bookingFormHour !== null && selectedResourceId && (
          <section>
            <BookSlotForm
              resourceId={selectedResourceId}
              date={selectedDate}
              defaultHour={bookingFormHour}
              onBooked={() => {
                setBookingFormHour(null);
                void loadBookings();
              }}
              onClose={() => setBookingFormHour(null)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
