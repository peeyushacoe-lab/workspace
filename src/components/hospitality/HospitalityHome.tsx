"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BedDouble, Brush, Package, BellRing, ListChecks, UserPlus, PackagePlus,
  ChevronRight, CircleCheck, Circle, ArrowDownToLine, ArrowUpFromLine, RefreshCw,
} from "lucide-react";
import { iconSize } from "@/components/icons";
import {
  ROOM_STATUSES, ROOM_STATUS_META, HOTEL_DEPARTMENTS, labelOf, type RoomStatus,
} from "@/lib/hospitality/catalog";
import { api, relTime, waitLabel, formatMoney, formatQty, chipCls, outlineBtn, primaryBtn, LoadingRows } from "./ui";

type Overview = {
  property: { name: string; currency: string; totalRooms: number };
  isManager: boolean;
  rooms: { total: number; counts: Record<RoomStatus, number>; sellable: number; occupancy: number };
  housekeeping: { id: string; number: string; floor: string | null; statusAt: string; assignedToName: string | null }[];
  stock: {
    skus: number; low: number; out: number; value: number;
    items: { id: string; name: string; unit: string; quantity: number; parLevel: number; reorderPoint: number }[];
  };
  alerts: { id: string; title: string; priority: string; status: string; department: string | null; roomNumber: string | null; createdAt: string }[];
  tasks: { id: string; title: string; status: string; priority: string; dueDate: string | null; assignees: string[] }[];
  team: { total: number; departments: { key: string; count: number }[] };
  movements: { id: string; type: string; quantity: number; createdAt: string; item: { name: string; unit: string } }[];
  setup: { rooms: boolean; inventory: boolean; team: boolean };
};

const PRIORITY_CHIP: Record<string, string> = {
  CRITICAL: "bg-crit-soft text-crit border-crit/25",
  URGENT: "bg-crit-soft text-crit border-crit/25",
  HIGH: "bg-warn-soft text-warn border-warn/25",
  MEDIUM: "bg-accent-soft text-accent-strong border-accent/25",
  LOW: "bg-hover text-muted border-border",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Tile({ label, value, sub, href, tone }: { label: string; value: string; sub: string; href: string; tone?: "warn" | "crit" }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-hover"
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums ${
        tone === "crit" ? "text-crit" : tone === "warn" ? "text-warn" : "text-foreground"
      }`}>
        {value}
      </p>
      <p className="mt-1.5 flex items-center gap-1 text-[12px] text-subtle">
        {sub}
        <ChevronRight className={`${iconSize("xs")} opacity-0 transition-opacity group-hover:opacity-100`} />
      </p>
    </Link>
  );
}

function Panel({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">{title}</h2>
        <Link href={href} className="flex items-center gap-0.5 text-[12px] font-medium text-accent hover:underline">
          {linkLabel} <ChevronRight className={iconSize("xs")} />
        </Link>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-[13px] text-subtle">{children}</p>;
}

export function HospitalityHome({ firstName }: { firstName: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api<Overview>("/api/hospitality/overview"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the dashboard.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const setupDone = data ? [data.setup.rooms, data.setup.inventory, data.setup.team].filter(Boolean).length : 0;

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-soft px-5 pb-5 pt-6 lg:px-8">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted">{today}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground text-balance">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {data ? `${data.property.name} · ${data.rooms.total} rooms` : "Loading your property…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/hospitality/rooms" className={outlineBtn}>
            <BedDouble className={iconSize("sm")} /> Room board
          </Link>
          <Link href="/hospitality/inventory?action=receive" className={outlineBtn}>
            <ArrowDownToLine className={iconSize("sm")} /> Receive stock
          </Link>
          <Link href="/hospitality/tasks?new=1" className={primaryBtn}>
            <ListChecks className={iconSize("sm")} /> New task
          </Link>
          <button onClick={load} disabled={refreshing} aria-label="Refresh" className={outlineBtn}>
            <RefreshCw className={`${iconSize("sm")} ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="space-y-5 px-5 py-6 lg:px-8">
        {error && (
          <div className="rounded-xl border border-crit/25 bg-crit-soft px-4 py-3 text-[13px] text-crit">{error}</div>
        )}

        {!data && !error && <LoadingRows rows={5} />}

        {data && (
          <>
            {/* Setup checklist — only until the property is set up */}
            {setupDone < 3 && (
              <section className="rounded-xl border border-accent/25 bg-accent-soft px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[14px] font-semibold tracking-tight text-accent-strong">Set up {data.property.name}</h2>
                  <p className="text-[12px] font-medium text-accent-strong">{setupDone} of 3 done</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { done: data.setup.rooms, label: "Add your rooms", body: "Build the room board by floor.", href: "/hospitality/rooms?add=1", icon: BedDouble },
                    { done: data.setup.inventory, label: "Add stock items", body: "Linen, amenities, minibar and stores.", href: "/hospitality/inventory?add=1", icon: PackagePlus },
                    { done: data.setup.team, label: "Add your team", body: "Give each colleague their own login.", href: "/hospitality/team?add=1", icon: UserPlus },
                  ].map((s) => (
                    <Link
                      key={s.label}
                      href={s.href}
                      className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3 transition-colors hover:border-border-strong"
                    >
                      {s.done
                        ? <CircleCheck className={`${iconSize("lg")} mt-px flex-shrink-0 text-ok`} />
                        : <Circle className={`${iconSize("lg")} mt-px flex-shrink-0 text-subtle`} />}
                      <span className="min-w-0">
                        <span className={`block text-[13px] font-semibold ${s.done ? "text-muted line-through" : "text-foreground"}`}>{s.label}</span>
                        <span className="block text-[12px] text-muted">{s.body}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Headline figures */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Occupancy" value={`${data.rooms.occupancy}%`} sub={`${data.rooms.counts.OCCUPIED} of ${data.rooms.total - data.rooms.counts.OUT_OF_ORDER} in service`} href="/hospitality/rooms?status=OCCUPIED" />
              <Tile label="Ready to sell" value={String(data.rooms.sellable)} sub="Vacant clean + inspected" href="/hospitality/rooms?status=VACANT_CLEAN" />
              <Tile label="Rooms to clean" value={String(data.rooms.counts.VACANT_DIRTY)} sub="Housekeeping queue" href="/hospitality/housekeeping" tone={data.rooms.counts.VACANT_DIRTY > 0 ? "warn" : undefined} />
              <Tile label="Stock needing reorder" value={String(data.stock.low + data.stock.out)} sub={`${data.stock.out} out of stock`} href="/hospitality/inventory?state=low" tone={data.stock.out > 0 ? "crit" : data.stock.low > 0 ? "warn" : undefined} />
            </div>

            {/* Room status strip */}
            <section className="rounded-xl border border-border bg-surface px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">Room status</h2>
                <Link href="/hospitality/rooms" className="text-[12px] font-medium text-accent hover:underline">Open room board</Link>
              </div>
              {data.rooms.total === 0 ? (
                <p className="mt-3 text-[13px] text-subtle">No rooms yet — add them to see live room status.</p>
              ) : (
                <>
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label="Rooms by status">
                    {ROOM_STATUSES.map((s) =>
                      data.rooms.counts[s] > 0 ? (
                        <div key={s} className={ROOM_STATUS_META[s].dot} style={{ width: `${(data.rooms.counts[s] / data.rooms.total) * 100}%` }} />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {ROOM_STATUSES.map((s) => (
                      <Link key={s} href={`/hospitality/rooms?status=${s}`} className="flex items-center gap-2 text-[12.5px] text-muted hover:text-foreground">
                        <span className={`h-2 w-2 rounded-full ${ROOM_STATUS_META[s].dot}`} />
                        {ROOM_STATUS_META[s].label}
                        <span className="font-semibold tabular-nums text-foreground">{data.rooms.counts[s]}</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Housekeeping queue" href="/hospitality/housekeeping" linkLabel="Housekeeping">
                {data.housekeeping.length === 0 ? (
                  <Quiet>No rooms waiting to be cleaned.</Quiet>
                ) : (
                  <ul className="divide-y divide-border-soft">
                    {data.housekeeping.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-14 text-[14px] font-semibold tabular-nums text-foreground">{r.number}</span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                          {r.assignedToName ?? <span className="text-warn">Unassigned</span>}
                        </span>
                        <span className="text-[12px] tabular-nums text-subtle">waiting {waitLabel(r.statusAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Low stock" href="/hospitality/inventory?state=low" linkLabel="Inventory">
                {data.stock.items.length === 0 ? (
                  <Quiet>{data.stock.skus === 0 ? "No stock items yet." : "Everything is above its reorder point."}</Quiet>
                ) : (
                  <ul className="divide-y divide-border-soft">
                    {data.stock.items.map((i) => {
                      const pct = Math.min(100, (i.quantity / Math.max(i.parLevel, i.reorderPoint, 1)) * 100);
                      return (
                        <li key={i.id} className="px-4 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[13px] font-medium text-foreground">{i.name}</span>
                            <span className={`text-[12px] font-semibold tabular-nums ${i.quantity <= 0 ? "text-crit" : "text-warn"}`}>
                              {formatQty(i.quantity)} {i.unit}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                            <div className={`h-full rounded-full ${i.quantity <= 0 ? "bg-crit" : "bg-warn"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-[11.5px] text-subtle">Reorder at {formatQty(i.reorderPoint)} · par {formatQty(i.parLevel)}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Open alerts" href="/hospitality/alerts" linkLabel="All alerts">
                {data.alerts.length === 0 ? (
                  <Quiet>No open alerts.</Quiet>
                ) : (
                  <ul className="divide-y divide-border-soft">
                    {data.alerts.map((a) => (
                      <li key={a.id}>
                        <Link href={`/hospitality/alerts/${a.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-hover">
                          <span className={`${chipCls} mt-0.5 ${PRIORITY_CHIP[a.priority] ?? PRIORITY_CHIP.LOW}`}>{a.priority.toLowerCase()}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">{a.title}</span>
                            <span className="block text-[11.5px] text-subtle">
                              {[a.roomNumber && `Room ${a.roomNumber}`, a.department && labelOf(HOTEL_DEPARTMENTS, a.department), relTime(a.createdAt)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Open tasks" href="/hospitality/tasks" linkLabel="Task board">
                {data.tasks.length === 0 ? (
                  <Quiet>No open tasks.</Quiet>
                ) : (
                  <ul className="divide-y divide-border-soft">
                    {data.tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                        <span className={`${chipCls} mt-0.5 ${PRIORITY_CHIP[t.priority] ?? PRIORITY_CHIP.LOW}`}>{t.priority.toLowerCase()}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-foreground">{t.title}</span>
                          <span className="block text-[11.5px] text-subtle">
                            {[t.assignees.join(", ") || "Unassigned", t.status === "IN_PROGRESS" ? "In progress" : "To do",
                              t.dueDate && `due ${new Date(t.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Recent stock movements" href="/hospitality/inventory/movements" linkLabel="Ledger">
                {data.movements.length === 0 ? (
                  <Quiet>No stock has moved yet.</Quiet>
                ) : (
                  <ul className="divide-y divide-border-soft">
                    {data.movements.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                        {m.quantity >= 0
                          ? <ArrowDownToLine className={`${iconSize("sm")} flex-shrink-0 text-ok`} />
                          : <ArrowUpFromLine className={`${iconSize("sm")} flex-shrink-0 text-muted`} />}
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{m.item.name}</span>
                        <span className={`text-[12.5px] font-semibold tabular-nums ${m.quantity >= 0 ? "text-ok" : "text-foreground"}`}>
                          {m.quantity >= 0 ? "+" : ""}{formatQty(m.quantity)} {m.item.unit}
                        </span>
                        <span className="w-16 text-right text-[11.5px] text-subtle">{relTime(m.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Team" href="/hospitality/team" linkLabel="Manage team">
                <div className="px-4 py-3">
                  <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{data.team.total}</p>
                  <p className="mt-1 text-[12px] text-subtle">active team members</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.team.departments.map((d) => (
                      <span key={d.key} className={`${chipCls} border-border bg-surface-sunken text-muted`}>
                        {d.key === "unassigned" ? "No department" : labelOf(HOTEL_DEPARTMENTS, d.key)} · {d.count}
                      </span>
                    ))}
                  </div>
                  {data.isManager && (
                    <Link href="/hospitality/team?add=1" className={`${outlineBtn} mt-4`}>
                      <UserPlus className={iconSize("sm")} /> Add team member
                    </Link>
                  )}
                </div>
              </Panel>
            </div>

            {/* Footer shortcuts */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/hospitality/housekeeping" className={outlineBtn}><Brush className={iconSize("sm")} /> Housekeeping</Link>
              <Link href="/hospitality/inventory" className={outlineBtn}><Package className={iconSize("sm")} /> Inventory</Link>
              <Link href="/hospitality/alerts" className={outlineBtn}><BellRing className={iconSize("sm")} /> Alerts</Link>
              {data.stock.value > 0 && (
                <span className="ml-auto self-center text-[12px] text-subtle">
                  Stock on hand valued at {formatMoney(data.stock.value, data.property.currency)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
