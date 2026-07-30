"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Shield,
  Search,
  LayoutGrid,
  List,
  Mail,
  Copy,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { roleLabels } from "@/lib/auth";
import { avatarGradient } from "@/lib/avatar";
import type { UserRole } from "@/generated/prisma/enums";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PersonRecord = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  jobTitle: string | null;
  department: string | null;
};

type PeopleResponse = {
  departments: Record<string, PersonRecord[]>;
  total: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case "ADMIN":
    case "CEO":
    case "CISO":
      return "bg-crit/20 text-crit border-crit/20";
    case "DEVELOPER":
    case "R_AND_D":
      return "bg-accent/20 text-accent border-accent/20";
    case "CYBER_SECURITY":
      return "bg-accent/20 text-accent border-accent/20";
    case "FINANCE":
      return "bg-warn/20 text-warn border-warn/20";
    default:
      return "bg-surface text-muted border-border";
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  person,
  size = "md",
}: {
  person: PersonRecord;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-8 h-8 text-[10px]",
    md: "w-10 h-10 text-xs",
    lg: "w-14 h-14 text-base",
  };

  if (person.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatarUrl}
        alt={person.fullName}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
      style={{ background: avatarGradient(person.email || person.fullName) }}
    >
      {initials(person.fullName)}
    </div>
  );
}

// ─── Copy Email Button ─────────────────────────────────────────────────────────

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy email"
      className="group flex items-center gap-1 text-subtle hover:text-accent transition-colors"
    >
      <span className="text-xs font-mono truncate max-w-[160px]">{email}</span>
      {copied ? (
        <CheckCheck className="w-3 h-3 text-ok flex-shrink-0" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
      )}
    </button>
  );
}

// ─── Person Card (Grid view) ───────────────────────────────────────────────────

function PersonCard({ person }: { person: PersonRecord }) {
  return (
    <Link href={`/people/${person.id}`} className="block bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-border transition-colors cursor-pointer">
      <div className="flex items-start gap-3">
        <Avatar person={person} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{person.fullName}</p>
          {person.jobTitle && (
            <p className="text-xs text-subtle truncate mt-0.5">{person.jobTitle}</p>
          )}
          <span
            className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full border ${roleBadgeClass(person.role)}`}
          >
            {roleLabels[person.role]}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <CopyEmail email={person.email} />
        {person.department && (
          <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-surface-sunken text-muted border border-border truncate max-w-[80px]">
            {person.department}
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Person Row (List view) ────────────────────────────────────────────────────

function PersonRow({ person }: { person: PersonRecord }) {
  return (
    <tr className="border-b border-border-soft hover:bg-surface-sunken/30 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/people/${person.id}`} className="flex items-center gap-3 group">
          <Avatar person={person} size="sm" />
          <div className="min-w-0">
            <p className="text-sm text-foreground font-medium truncate group-hover:text-accent transition-colors">{person.fullName}</p>
            {person.jobTitle && (
              <p className="text-[10px] text-subtle truncate">{person.jobTitle}</p>
            )}
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full border ${roleBadgeClass(person.role)}`}
        >
          {roleLabels[person.role]}
        </span>
      </td>
      <td className="px-4 py-3">
        <CopyEmail email={person.email} />
      </td>
      <td className="px-4 py-3">
        {person.department ? (
          <span className="text-xs font-mono text-muted">{person.department}</span>
        ) : (
          <span className="text-xs text-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/inbox?compose=${encodeURIComponent(person.email)}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
        >
          <Mail className="w-3 h-3" />
          Send Mail
        </Link>
      </td>
    </tr>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PeoplePage() {
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [activeDept, setActiveDept] = useState<string>("All");

  // Fetch people
  useEffect(() => {
    setLoading(true);
    fetch("/api/people")
      .then((r) => r.json())
      .then((d: PeopleResponse) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Flat list of all people
  const allPeople = useMemo<PersonRecord[]>(() => {
    if (!data) return [];
    return Object.values(data.departments).flat();
  }, [data]);

  // Department list with counts
  const departmentCounts = useMemo<{ name: string; count: number }[]>(() => {
    if (!data) return [];
    return Object.entries(data.departments)
      .map(([name, members]) => ({ name, count: members.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Filtered people
  const filtered = useMemo<PersonRecord[]>(() => {
    let list = activeDept === "All" ? allPeople : (data?.departments[activeDept] ?? []);

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          roleLabels[p.role].toLowerCase().includes(q) ||
          (p.department ?? "").toLowerCase().includes(q) ||
          (p.jobTitle ?? "").toLowerCase().includes(q),
      );
    }

    return list;
  }, [allPeople, activeDept, data, search]);

  return (
    <div className="min-h-full bg-surface text-foreground">
      <PageHeader
        eyebrow="Workspace"
        title="People Directory"
        description="Browse team members, departments, and contact information."
      />

      <div className="px-6 pb-10 max-w-6xl space-y-5">
        {/* Top bar: search + view toggle + total badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-sunken border border-border-strong rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder-subtle focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-surface border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`p-2 transition-colors ${
                view === "grid"
                  ? "bg-accent/15 text-accent"
                  : "text-subtle hover:text-muted"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2 transition-colors ${
                view === "list"
                  ? "bg-accent/15 text-accent"
                  : "text-subtle hover:text-muted"
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Total badge */}
          {data && (
            <span className="px-3 py-1 text-xs font-mono font-semibold rounded-full bg-accent/10 text-accent border border-accent/20">
              {data.total} {data.total === 1 ? "member" : "members"}
            </span>
          )}
        </div>

        {/* Department filter pills */}
        {departmentCounts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveDept("All")}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                activeDept === "All"
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-surface text-subtle border-border hover:text-muted hover:border-border"
              }`}
            >
              All
              <span className="ml-1.5 font-mono opacity-60">{data?.total ?? 0}</span>
            </button>
            {departmentCounts.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => setActiveDept(name)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeDept === name
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-surface text-subtle border-border hover:text-muted hover:border-border"
                }`}
              >
                {name}
                <span className="ml-1.5 font-mono opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-subtle">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading directory…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Shield className="w-12 h-12 text-subtle" />
            <p className="text-subtle text-sm font-medium">No team members found</p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-accent hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-subtle text-xs">
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Department</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((person) => (
                    <PersonRow key={person.id} person={person} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
