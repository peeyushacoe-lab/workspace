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
      return "bg-red-500/20 text-red-300 border-red-500/20";
    case "DEVELOPER":
    case "R_AND_D":
      return "bg-blue-500/20 text-blue-300 border-blue-500/20";
    case "CYBER_SECURITY":
      return "bg-[#00d2ff]/20 text-[#00d2ff] border-[#00d2ff]/20";
    case "FINANCE":
      return "bg-amber-500/20 text-amber-300 border-amber-500/20";
    default:
      return "bg-[#1b1f2e] text-[#9aa3b8] border-[rgba(255,255,255,0.06)]";
  }
}

function avatarBgClass(role: UserRole): string {
  switch (role) {
    case "ADMIN":
    case "CEO":
    case "CISO":
      return "bg-red-500/30 text-red-200";
    case "DEVELOPER":
    case "R_AND_D":
      return "bg-blue-500/30 text-blue-200";
    case "CYBER_SECURITY":
      return "bg-[#00d2ff]/20 text-[#00d2ff]";
    case "FINANCE":
      return "bg-amber-500/30 text-amber-200";
    default:
      return "bg-[#262939] text-[#9aa3b8]";
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
      className={`${sizeClasses[size]} ${avatarBgClass(person.role)} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
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
      className="group flex items-center gap-1 text-[#5d6579] hover:text-[#00d2ff] transition-colors"
    >
      <span className="text-xs truncate max-w-[160px]">{email}</span>
      {copied ? (
        <CheckCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
      )}
    </button>
  );
}

// ─── Person Card (Grid view) ───────────────────────────────────────────────────

function PersonCard({ person }: { person: PersonRecord }) {
  return (
    <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col gap-3 hover:border-[rgba(255,255,255,0.13)] transition-colors">
      <div className="flex items-start gap-3">
        <Avatar person={person} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#dfe1f6] truncate">{person.fullName}</p>
          {person.jobTitle && (
            <p className="text-xs text-[#5d6579] truncate mt-0.5">{person.jobTitle}</p>
          )}
          <span
            className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${roleBadgeClass(person.role)}`}
          >
            {roleLabels[person.role]}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.05)]">
        <CopyEmail email={person.email} />
        {person.department && (
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-[#0f1321] text-[#5d6579] border border-[rgba(255,255,255,0.05)] truncate max-w-[80px]">
            {person.department}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Person Row (List view) ────────────────────────────────────────────────────

function PersonRow({ person }: { person: PersonRecord }) {
  return (
    <tr className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[#262939]/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar person={person} size="sm" />
          <div className="min-w-0">
            <p className="text-sm text-[#dfe1f6] font-medium truncate">{person.fullName}</p>
            {person.jobTitle && (
              <p className="text-[10px] text-[#5d6579] truncate">{person.jobTitle}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full border ${roleBadgeClass(person.role)}`}
        >
          {roleLabels[person.role]}
        </span>
      </td>
      <td className="px-4 py-3">
        <CopyEmail email={person.email} />
      </td>
      <td className="px-4 py-3">
        {person.department ? (
          <span className="text-xs text-[#5d6579]">{person.department}</span>
        ) : (
          <span className="text-xs text-[#454e63]">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/inbox?compose=${encodeURIComponent(person.email)}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#00d2ff]/10 text-[#00d2ff] border border-[#00d2ff]/20 hover:bg-[#00d2ff]/20 transition-colors"
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
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Workspace"
        title="People Directory"
        description="Browse team members, departments, and contact information."
      />

      <div className="px-6 pb-10 max-w-6xl space-y-5">
        {/* Top bar: search + view toggle + total badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5d6579] pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-lg pl-9 pr-3 py-2 text-sm text-[#dfe1f6] placeholder-[#5d6579] focus:outline-none focus:border-[#00d2ff]/40 transition-colors"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`p-2 transition-colors ${
                view === "grid"
                  ? "bg-[#00d2ff]/15 text-[#00d2ff]"
                  : "text-[#5d6579] hover:text-[#9aa3b8]"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2 transition-colors ${
                view === "list"
                  ? "bg-[#00d2ff]/15 text-[#00d2ff]"
                  : "text-[#5d6579] hover:text-[#9aa3b8]"
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Total badge */}
          {data && (
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[#1b1f2e] text-[#00d2ff] border border-[#00d2ff]/20">
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
                  ? "bg-[#00d2ff]/15 text-[#00d2ff] border-[#00d2ff]/30"
                  : "bg-[#1b1f2e] text-[#5d6579] border-[rgba(255,255,255,0.06)] hover:text-[#9aa3b8] hover:border-[rgba(255,255,255,0.13)]"
              }`}
            >
              All
              <span className="ml-1.5 opacity-60">{data?.total ?? 0}</span>
            </button>
            {departmentCounts.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => setActiveDept(name)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeDept === name
                    ? "bg-[#00d2ff]/15 text-[#00d2ff] border-[#00d2ff]/30"
                    : "bg-[#1b1f2e] text-[#5d6579] border-[rgba(255,255,255,0.06)] hover:text-[#9aa3b8] hover:border-[rgba(255,255,255,0.13)]"
                }`}
              >
                {name}
                <span className="ml-1.5 opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-[#5d6579]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading directory…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Shield className="w-12 h-12 text-[#454e63]" />
            <p className="text-[#5d6579] text-sm font-medium">No team members found</p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-[#00d2ff] hover:underline"
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
          <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.04)] text-[#5d6579] text-xs">
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
