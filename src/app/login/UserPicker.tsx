"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import type { UserRole } from "@/generated/prisma/enums";
import { roleLabels } from "@/lib/auth";

const roleTileColors: Record<UserRole, string> = {
  ADMIN:         "bg-[#ff4d6d]/10 text-[#ff4d6d]",
  CEO:           "bg-purple-500/10 text-purple-300",
  CISO:          "bg-[#00d2ff]/10 text-[#00d2ff]",
  R_AND_D:       "bg-indigo-500/10 text-indigo-300",
  COO:           "bg-violet-500/10 text-violet-300",
  OPS_MANAGER:   "bg-orange-500/10 text-orange-300",
  DEVELOPER:     "bg-[#00d2ff]/10 text-[#a5e7ff]",
  CYBER_SECURITY:"bg-[#ff4d6d]/10 text-[#ff4d6d]",
  QA:            "bg-yellow-500/10 text-yellow-300",
  MARKETING:     "bg-[#00feb2]/10 text-[#00feb2]",
  RESEARCH:      "bg-teal-500/10 text-teal-300",
  FINANCE:       "bg-[#00feb2]/10 text-[#00feb2]",
  OPERATIONS:    "bg-amber-500/10 text-amber-300",
  SUPPORT:       "bg-sky-500/10 text-sky-300",
  INTERNSHIP:    "bg-[#262939] text-[#bbc9cf]",
};

export type LoginUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
};

export function UserPicker({
  users,
  next,
  error,
}: {
  users: LoginUser[];
  next: string;
  error: boolean;
}) {
  const [selectedUser, setSelectedUser] = useState<LoginUser | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        roleLabels[u.role].toLowerCase().includes(q),
    );
  }, [users, query]);

  if (!selectedUser) {
    return (
      <div>
        {error && (
          <div className="mb-6 px-3 py-2 bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg">
            <p className="text-sm text-[#ff4d6d]">Invalid email or password. Please try again.</p>
          </div>
        )}

        {users.length > 6 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#bbc9cf]" />
              <input
                type="search"
                placeholder="Search by name, email, or role"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-[rgba(0,255,255,0.1)] rounded-lg text-sm text-[#dfe1f6] bg-[#1b1f2e] focus:ring-2 focus:ring-[#00d2ff] focus:border-[#00d2ff] outline-none"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#bbc9cf]">
                {users.length === 0
                  ? "No users exist yet. Contact an administrator."
                  : "No users match your search."}
              </p>
            </div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedUser(u)}
                className="flex items-center gap-4 p-4 border border-[rgba(0,255,255,0.1)] rounded-xl hover:border-[#00d2ff]/40 hover:shadow-md hover:bg-[#262939] transition-all text-left"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold text-base ${roleTileColors[u.role]}`}>
                  {u.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#dfe1f6] text-sm">{u.fullName}</p>
                  <p className="text-xs text-[#bbc9cf]">{u.email}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${roleTileColors[u.role]}`}>
                    {roleLabels[u.role]}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <form action="/api/auth/login" method="post">
      <button
        type="button"
        onClick={() => setSelectedUser(null)}
        className="flex items-center gap-2 text-sm text-[#00d2ff] hover:text-[#47d6ff] mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Choose different account
      </button>

      <div className="flex items-center gap-4 mb-6 p-4 bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-xl">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full font-semibold text-lg ${roleTileColors[selectedUser.role]}`}>
          {selectedUser.fullName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-bold text-[#dfe1f6]">{selectedUser.fullName}</p>
          <p className="text-sm text-[#bbc9cf]">{selectedUser.email}</p>
          <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${roleTileColors[selectedUser.role]}`}>
            {roleLabels[selectedUser.role]}
          </span>
        </div>
      </div>

      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="email" value={selectedUser.email} />

      <div className="mb-5">
        <label className="block text-sm font-medium text-[#dfe1f6] mb-1.5">Password</label>
        <input
          name="password"
          type="password"
          autoFocus
          required
          className="block w-full py-2.5 px-3 border border-[rgba(0,255,255,0.1)] rounded-md bg-[#1b1f2e] text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff] focus:border-[#00d2ff] text-sm outline-none"
        />
      </div>

      {error && (
        <div className="mb-5 px-3 py-2 bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg">
          <p className="text-sm text-[#ff4d6d]">Invalid password. Please try again.</p>
        </div>
      )}

      <button className="w-full flex justify-center py-2.5 px-4 rounded-md shadow-sm text-sm font-semibold text-[#003543] bg-[#00d2ff] hover:bg-[#47d6ff] transition-all active:scale-[0.98]">
        Sign in as {selectedUser.fullName}
      </button>
    </form>
  );
}
