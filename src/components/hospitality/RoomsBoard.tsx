"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BedDouble, Plus, Search, Trash2, LogOut, Brush, ClipboardCheck, Wrench } from "lucide-react";
import { iconSize } from "@/components/icons";
import {
  ROOM_STATUSES, ROOM_STATUS_META, ROOM_TYPES, compareRoomNumbers, type RoomStatus,
} from "@/lib/hospitality/catalog";
import {
  HospPage, Modal, Field, EmptyState, LoadingRows, api, notifyShell, readQuery, waitLabel,
  inputCls, primaryBtn, outlineBtn, ghostBtn, chipCls,
} from "./ui";
import { useHotelTeam } from "./useHotelTeam";

export type Room = {
  id: string;
  number: string;
  floor: string | null;
  type: string;
  status: RoomStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  guestName: string | null;
  notes: string | null;
  statusAt: string;
};

/** The one-tap transitions front office and housekeeping actually use. */
const QUICK: Partial<Record<RoomStatus, { to: RoomStatus; label: string; icon: typeof Brush }>> = {
  OCCUPIED: { to: "VACANT_DIRTY", label: "Check out", icon: LogOut },
  VACANT_DIRTY: { to: "VACANT_CLEAN", label: "Mark clean", icon: Brush },
  VACANT_CLEAN: { to: "INSPECTED", label: "Inspect", icon: ClipboardCheck },
  OUT_OF_ORDER: { to: "VACANT_DIRTY", label: "Return to service", icon: Wrench },
};

export function RoomsBoard() {
  const team = useHotelTeam();
  const isManager = team?.isManager ?? false;
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [filter, setFilter] = useState<RoomStatus | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Room | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ rooms: Room[] }>("/api/hospitality/rooms");
      setRooms(d.rooms);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load rooms.");
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    load();
    const s = readQuery("status");
    if (s && (ROOM_STATUSES as readonly string[]).includes(s)) setFilter(s as RoomStatus);
    if (readQuery("add")) setAdding(true);
  }, [load]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(ROOM_STATUSES.map((s) => [s, 0])) as Record<RoomStatus, number>;
    for (const r of rooms ?? []) c[r.status] += 1;
    return c;
  }, [rooms]);

  const floors = useMemo(() => {
    const term = q.trim().toLowerCase();
    const visible = (rooms ?? []).filter(
      (r) =>
        (filter === "ALL" || r.status === filter) &&
        (!term || r.number.toLowerCase().includes(term) || r.guestName?.toLowerCase().includes(term) || r.type.toLowerCase().includes(term)),
    );
    const map = new Map<string, Room[]>();
    for (const r of visible) {
      const key = r.floor ?? "—";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => compareRoomNumbers(a, b))
      .map(([floor, list]) => ({ floor, list: list.sort((a, b) => compareRoomNumbers(a.number, b.number)) }));
  }, [rooms, filter, q]);

  const patch = async (room: Room, body: Record<string, unknown>, message?: string) => {
    try {
      await api(`/api/hospitality/rooms/${room.id}`, { method: "PATCH", json: body });
      if (message) toast.success(message);
      await load();
      notifyShell();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the room.");
      return false;
    }
  };

  return (
    <HospPage
      title="Rooms"
      description="Live room status across the property. Tap a room to change its status, guest or housekeeper."
      action={
        isManager && (
          <button className={primaryBtn} onClick={() => setAdding(true)}>
            <Plus className={iconSize("sm")} /> Add rooms
          </button>
        )
      }
    >
      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("ALL")}
          className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
            filter === "ALL" ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-muted hover:bg-hover"
          }`}
        >
          All <span className="tabular-nums">{rooms?.length ?? 0}</span>
        </button>
        {ROOM_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
              filter === s ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-muted hover:bg-hover"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${ROOM_STATUS_META[s].dot}`} />
            {ROOM_STATUS_META[s].label} <span className="tabular-nums">{counts[s]}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-56">
          <Search className={`${iconSize("sm")} pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle`} />
          <input
            id="room-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Room, guest or type"
            className={`${inputCls} pl-9`}
          />
        </div>
      </div>

      <div className="mt-5">
        {rooms === null ? (
          <LoadingRows />
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            body={isManager ? "Add your rooms — a whole floor at once with a range like 101 to 120." : "Your manager hasn't added the property's rooms yet."}
            action={isManager && <button className={primaryBtn} onClick={() => setAdding(true)}><Plus className={iconSize("sm")} /> Add rooms</button>}
          />
        ) : floors.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-subtle">No rooms match this filter.</p>
        ) : (
          <div className="space-y-6">
            {floors.map(({ floor, list }) => (
              <section key={floor}>
                <h2 className="mb-2 text-xs font-medium text-muted">
                  {floor === "—" ? "No floor set" : floor === "0" ? "Ground floor" : `Floor ${floor}`}
                  <span className="text-subtle"> · {list.length}</span>
                </h2>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8">
                  {list.map((r) => {
                    const meta = ROOM_STATUS_META[r.status];
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`flex min-h-[84px] flex-col rounded-xl border px-3 py-2.5 text-left transition-shadow hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${meta.tile}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-[17px] font-semibold tabular-nums tracking-tight text-foreground">{r.number}</span>
                          <span className="text-[10px] font-semibold text-muted">{meta.code}</span>
                        </span>
                        <span className="mt-auto truncate text-[11px] text-muted">{r.guestName ?? r.type}</span>
                        {r.assignedToName && <span className="truncate text-[11px] text-subtle">{r.assignedToName}</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <RoomDetail
          room={selected}
          isManager={isManager}
          members={(team?.members ?? []).filter((m) => m.isActive)}
          onClose={() => setSelected(null)}
          onPatch={async (body, message) => {
            const ok = await patch(selected, body, message);
            if (ok) setSelected(null);
          }}
          onDeleted={async () => {
            setSelected(null);
            await load();
            notifyShell();
          }}
        />
      )}

      <AddRoomsModal open={adding} onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await load(); }} />
    </HospPage>
  );
}

function RoomDetail({
  room,
  isManager,
  members,
  onClose,
  onPatch,
  onDeleted,
}: {
  room: Room;
  isManager: boolean;
  members: { id: string; fullName: string }[];
  onClose: () => void;
  onPatch: (body: Record<string, unknown>, message?: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [status, setStatus] = useState<RoomStatus>(room.status);
  const [guestName, setGuestName] = useState(room.guestName ?? "");
  const [assignedToId, setAssignedToId] = useState(room.assignedToId ?? "");
  const [notes, setNotes] = useState(room.notes ?? "");
  const [type, setType] = useState(room.type);
  const [floor, setFloor] = useState(room.floor ?? "");
  const [saving, setSaving] = useState(false);
  const quick = QUICK[room.status];

  const save = async () => {
    setSaving(true);
    const body: Record<string, unknown> = { status, assignedToId: assignedToId || null, notes };
    if (status === "OCCUPIED") body.guestName = guestName;
    if (isManager) { body.type = type; body.floor = floor; }
    await onPatch(body, `Room ${room.number} updated`);
    setSaving(false);
  };

  const remove = async () => {
    if (!window.confirm(`Remove room ${room.number} from the property?`)) return;
    try {
      await api(`/api/hospitality/rooms/${room.id}`, { method: "DELETE" });
      toast.success(`Room ${room.number} removed`);
      await onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the room.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Room ${room.number}`}
      description={`${room.type}${room.floor ? ` · floor ${room.floor}` : ""} · ${ROOM_STATUS_META[room.status].label.toLowerCase()} for ${waitLabel(room.statusAt)}`}
      footer={
        <>
          {isManager && (
            <button onClick={remove} className={`${ghostBtn} mr-auto text-crit hover:bg-crit-soft hover:text-crit`}>
              <Trash2 className={iconSize("sm")} /> Remove
            </button>
          )}
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button onClick={save} disabled={saving} className={primaryBtn}>{saving ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <div className="space-y-4">
        {quick && (
          <button
            onClick={() => onPatch({ status: quick.to }, `Room ${room.number}: ${ROOM_STATUS_META[quick.to].label.toLowerCase()}`)}
            className={`${outlineBtn} w-full justify-center py-2`}
          >
            <quick.icon className={iconSize("sm")} /> {quick.label}
          </button>
        )}

        <Field label="Status">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {ROOM_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors ${
                  status === s ? "border-accent/50 bg-accent-soft text-accent-strong" : "border-border text-foreground hover:bg-hover"
                }`}
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${ROOM_STATUS_META[s].dot}`} />
                <span className="flex-1">{ROOM_STATUS_META[s].label}</span>
                <span className="text-[10.5px] font-semibold text-subtle">{ROOM_STATUS_META[s].code}</span>
              </button>
            ))}
          </div>
        </Field>

        {status === "OCCUPIED" && (
          <Field label="Guest name" htmlFor="room-guest">
            <input id="room-guest" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Mr & Mrs Shah" className={inputCls} />
          </Field>
        )}

        <Field label="Housekeeper" htmlFor="room-hk">
          <select id="room-hk" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inputCls}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
          </select>
        </Field>

        <Field label="Notes" htmlFor="room-notes" hint="Maintenance issues, guest requests, lost property.">
          <textarea id="room-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} />
        </Field>

        {isManager && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Room type" htmlFor="room-type">
              <select id="room-type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {Array.from(new Set([...ROOM_TYPES, type])).map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Floor" htmlFor="room-floor">
              <input id="room-floor" value={floor} onChange={(e) => setFloor(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}

        <p className={`${chipCls} ${ROOM_STATUS_META[room.status].chip}`}>
          Currently {ROOM_STATUS_META[room.status].label.toLowerCase()} · {ROOM_STATUS_META[room.status].hint.toLowerCase()}
        </p>
      </div>
    </Modal>
  );
}

function AddRoomsModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"range" | "single">("range");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [number, setNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [type, setType] = useState("Standard");
  const [saving, setSaving] = useState(false);

  const count = mode === "range" && from && to && Number(to) >= Number(from) ? Number(to) - Number(from) + 1 : mode === "single" && number ? 1 : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = mode === "range" ? { from, to, floor, type } : { number, floor, type };
      const res = await api<{ created: number; skipped: number }>("/api/hospitality/rooms", { method: "POST", json: body });
      toast.success(
        res.skipped > 0 ? `Added ${res.created} rooms · ${res.skipped} already existed` : `Added ${res.created} room${res.created === 1 ? "" : "s"}`,
      );
      setFrom(""); setTo(""); setNumber("");
      await onDone();
      notifyShell();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add rooms.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add rooms"
      description="Floors are worked out from the number (412 → floor 4) unless you set one."
      footer={
        <>
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button form="add-rooms-form" type="submit" disabled={saving || count === 0} className={primaryBtn}>
            {saving ? "Adding…" : count > 1 ? `Add ${count} rooms` : "Add room"}
          </button>
        </>
      }
    >
      <form id="add-rooms-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-sunken p-1">
          {(["range", "single"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md py-1.5 text-[13px] font-medium transition-colors ${mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
            >
              {m === "range" ? "A range of rooms" : "One room"}
            </button>
          ))}
        </div>
        {mode === "range" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="rooms-from">
              <input id="rooms-from" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} placeholder="101" className={inputCls} required />
            </Field>
            <Field label="To" htmlFor="rooms-to">
              <input id="rooms-to" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} placeholder="120" className={inputCls} required />
            </Field>
          </div>
        ) : (
          <Field label="Room number" htmlFor="rooms-number" hint="Letters are fine too, e.g. G01 or Villa 3.">
            <input id="rooms-number" value={number} onChange={(e) => setNumber(e.target.value)} className={inputCls} required />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room type" htmlFor="rooms-type">
            <select id="rooms-type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Floor (optional)" htmlFor="rooms-floor">
            <input id="rooms-floor" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Auto" className={inputCls} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
