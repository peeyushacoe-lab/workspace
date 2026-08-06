"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Loader2, Users, MessageSquare } from "lucide-react";
import { avatarGradient } from "@/lib/avatar";
import { roleLabels } from "@/lib/auth";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Contacts — the organisation directory, framed for starting a conversation.
 *
 * Nexus's /people is the reference view (profiles, departments, org structure).
 * The same data here answers a different question: who do I message? So the
 * primary action on every row is "Message", not "View profile".
 */

type Person = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  jobTitle: string | null;
  department: string | null;
};

type PeopleResponse = { departments: Record<string, Person[]>; total: number };

function PersonRow({ person }: { person: Person }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  /**
   * "Message" has to resolve to a channel id before it can go anywhere, and the
   * answer is either an existing DM or a new one — a plain href can't express
   * that, so this asks the server and then navigates.
   */
  const openDm = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch("/api/connect/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { channelId } = (await res.json()) as { channelId: string };
      router.push(`/connect/chat?channel=${encodeURIComponent(channelId)}`);
    } catch {
      toast.error(`Couldn't open a conversation with ${person.fullName}`);
      setOpening(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-hover">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase text-accent-foreground"
        style={{ background: avatarGradient(person.fullName) }}
      >
        {person.fullName.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-foreground">
          {person.fullName}
        </p>
        <p className="truncate text-xs leading-tight text-subtle">
          {person.jobTitle ?? roleLabels[person.role] ?? person.role}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          onClick={() => void openDm()}
          disabled={opening}
          title={`Message ${person.fullName}`}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground disabled:opacity-60"
        >
          {opening ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Message</span>
        </button>
        <Link
          href={`/people/${person.id}`}
          className="hidden rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground sm:block"
        >
          Profile
        </Link>
      </div>
    </div>
  );
}

export default function ConnectContactsPage() {
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/people", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as PeopleResponse);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter within departments so the grouping survives searching — collapsing
  // to a flat list on every keystroke loses the structure people navigate by.
  const departments = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();

    return Object.entries(data.departments)
      .map(([name, people]) => ({
        name,
        people: q
          ? people.filter(
              (p) =>
                p.fullName.toLowerCase().includes(q) ||
                p.email.toLowerCase().includes(q) ||
                (p.jobTitle ?? "").toLowerCase().includes(q),
            )
          : people,
      }))
      .filter((d) => d.people.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query]);

  const matched = departments.reduce((n, d) => n + d.people.length, 0);

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Contacts</h1>
        <p className="mt-1 text-[13px] text-muted">
          {data ? `${data.total} people across the organisation` : "Everyone you can reach"}
        </p>
      </header>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or title"
          aria-label="Search contacts"
          className="w-full rounded-lg border border-border bg-surface-sunken py-2 pl-9 pr-3 text-sm text-foreground transition-colors placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-subtle">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading directory…</span>
        </div>
      ) : failed ? (
        <div className="flex flex-col items-center gap-3 py-20">
          <Users className="h-8 w-8 text-subtle" />
          <p className="text-sm text-subtle">Couldn&apos;t load the directory.</p>
          <button
            onClick={() => void load()}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
          >
            Try again
          </button>
        </div>
      ) : matched === 0 ? (
        <p className="py-20 text-center text-xs text-subtle">
          No one matches “{query}”.
        </p>
      ) : (
        <div className="space-y-4">
          {departments.map((dept) => (
            <section key={dept.name} className="rounded-xl border border-border bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-border-soft px-4 py-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
                  {dept.name}
                </h2>
                <span className="text-[10px] text-subtle">{dept.people.length}</span>
              </div>
              <div className="p-1.5">
                {dept.people.map((p) => (
                  <PersonRow key={p.id} person={p} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
