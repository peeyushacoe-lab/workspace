"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Brush, ClipboardCheck, Wrench, BedDouble, UserCheck } from "lucide-react";
import { iconSize } from "@/components/icons";
import { ROOM_STATUS_META, compareRoomNumbers, type RoomStatus } from "@/lib/hospitality/catalog";
import { HospPage, EmptyState, LoadingRows, api, notifyShell, waitLabel, inputCls, outlineBtn, primaryBtn } from "./ui";
import { useHotelTeam } from "./useHotelTeam";
import type { Room } from "./RoomsBoard";

const COLUMNS: { status: RoomStatus; title: string; empty: string; action?: { to: RoomStatus; label: string; icon: typeof Brush } }[] = [
  { status: "VACANT_DIRTY", title: "To clean", empty: "Nothing waiting — every vacant room is clean.", action: { to: "VACANT_CLEAN", label: "Mark clean", icon: Brush } },
  { status: "VACANT_CLEAN", title: "Awaiting inspection", empty: "No rooms waiting for a supervisor.", action: { to: "INSPECTED", label: "Inspect", icon: ClipboardCheck } },
  { status: "OUT_OF_ORDER", title: "Out of order", empty: "No rooms out of order.", action: { to: "VACANT_DIRTY", label: "Return to service", icon: Wrench } },
];

export function HousekeepingView() {
  const team = useHotelTeam();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const members = (team?.members ?? []).filter((m) => m.isActive);

  const byStatus = useMemo(() => {
    const list = (rooms ?? []).filter((r) => !mine || r.assignedToId === team?.meId);
    const group = (s: RoomStatus) =>
      list
        .filter((r) => r.status === s)
        .sort((a, b) => new Date(a.statusAt).getTime() - new Date(b.statusAt).getTime() || compareRoomNumbers(a.number, b.number));
    return { VACANT_DIRTY: group("VACANT_DIRTY"), VACANT_CLEAN: group("VACANT_CLEAN"), OUT_OF_ORDER: group("OUT_OF_ORDER") } as Record<string, Room[]>;
  }, [rooms, mine, team?.meId]);

  const dirty = (rooms ?? []).filter((r) => r.status === "VACANT_DIRTY");
  const unassigned = dirty.filter((r) => !r.assignedToId).length;

  const patch = async (room: Room, body: Record<string, unknown>, message: string) => {
    setBusy(room.id);
    try {
      await api(`/api/hospitality/rooms/${room.id}`, { method: "PATCH", json: body });
      toast.success(message);
      await load();
      notifyShell();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the room.");
    } finally {
      setBusy(null);
    }
  };

  /** Spread unassigned dirty rooms across housekeeping staff, fewest rooms first. */
  const autoAssign = async () => {
    const pool = members.filter((m) => m.department === "housekeeping");
    if (pool.length === 0) {
      toast.error("Add team members to the Housekeeping department first.");
      return;
    }
    const load_ = new Map(pool.map((m) => [m.id, dirty.filter((r) => r.assignedToId === m.id).length]));
    const todo = dirty.filter((r) => !r.assignedToId);
    for (const room of todo) {
      const [next] = [...load_.entries()].sort((a, b) => a[1] - b[1]);
      load_.set(next[0], next[1] + 1);
      await api(`/api/hospitality/rooms/${room.id}`, { method: "PATCH", json: { assignedToId: next[0] } }).catch(() => null);
    }
    toast.success(`Assigned ${todo.length} room${todo.length === 1 ? "" : "s"} across ${pool.length} housekeeper${pool.length === 1 ? "" : "s"}`);
    await load();
  };

  return (
    <HospPage
      title="Housekeeping"
      description="Rooms move left to right: clean, then inspect. Oldest waiting rooms come first."
      action={
        <>
          <button
            onClick={() => setMine((v) => !v)}
            aria-pressed={mine}
            className={`${outlineBtn} ${mine ? "border-accent/40 bg-accent-soft text-accent-strong" : ""}`}
          >
            <UserCheck className={iconSize("sm")} /> My rooms
          </button>
          {team?.isManager && unassigned > 0 && (
            <button onClick={autoAssign} className={primaryBtn}>Auto-assign {unassigned}</button>
          )}
        </>
      }
    >
      {rooms !== null && rooms.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { label: "To clean", value: dirty.length, tone: dirty.length ? "text-warn" : "text-foreground" },
            { label: "Unassigned", value: unassigned, tone: unassigned ? "text-crit" : "text-foreground" },
            { label: "Inspected", value: rooms.filter((r) => r.status === "INSPECTED").length, tone: "text-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs font-medium text-muted">{s.label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {rooms === null ? (
        <LoadingRows />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No rooms on the property yet"
          body="Housekeeping works from the room board. Add rooms first."
          action={<Link href="/hospitality/rooms?add=1" className={primaryBtn}>Go to rooms</Link>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <section key={col.status} className="flex flex-col rounded-xl border border-border bg-surface-sunken">
              <div className="flex items-center gap-2 px-4 py-3">
                <span className={`h-2 w-2 rounded-full ${ROOM_STATUS_META[col.status].dot}`} />
                <h2 className="flex-1 text-[13.5px] font-semibold tracking-tight text-foreground">{col.title}</h2>
                <span className="text-[12px] font-semibold tabular-nums text-muted">{byStatus[col.status].length}</span>
              </div>
              <div className="flex-1 space-y-2 px-3 pb-3">
                {byStatus[col.status].length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12.5px] text-subtle">{col.empty}</p>
                ) : (
                  byStatus[col.status].map((r) => (
                    <div key={r.id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[16px] font-semibold tabular-nums tracking-tight text-foreground">{r.number}</span>
                        <span className="text-[11.5px] tabular-nums text-subtle">{waitLabel(r.statusAt)}</span>
                      </div>
                      <p className="text-[11.5px] text-muted">{r.type}{r.floor ? ` · floor ${r.floor}` : ""}</p>
                      {r.notes && <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">{r.notes}</p>}
                      <div className="mt-2.5 flex items-center gap-2">
                        <select
                          aria-label={`Housekeeper for room ${r.number}`}
                          value={r.assignedToId ?? ""}
                          disabled={busy === r.id}
                          onChange={(e) => {
                            const name = members.find((m) => m.id === e.target.value)?.fullName;
                            patch(r, { assignedToId: e.target.value || null }, name ? `Room ${r.number} → ${name}` : `Room ${r.number} unassigned`);
                          }}
                          className={`${inputCls} flex-1 py-1.5 text-[12.5px]`}
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                        </select>
                        {col.action && (
                          <button
                            disabled={busy === r.id}
                            onClick={() => patch(r, { status: col.action!.to }, `Room ${r.number}: ${ROOM_STATUS_META[col.action!.to].label.toLowerCase()}`)}
                            className={`${outlineBtn} flex-shrink-0`}
                          >
                            <col.action.icon className={iconSize("sm")} /> {col.action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </HospPage>
  );
}
