"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import type { UserRole } from "@/generated/prisma/enums";
import { roleLabels } from "@/lib/auth";

const roleTileColors: Record<UserRole, string> = {
  ADMIN:         "bg-crit/10 text-crit",
  CEO:           "bg-violet/10 text-violet",
  CISO:          "bg-accent/10 text-accent",
  R_AND_D:       "bg-violet/10 text-violet",
  COO:           "bg-violet/10 text-violet",
  OPS_MANAGER:   "bg-warn/10 text-warn",
  DEVELOPER:     "bg-accent/10 text-accent",
  CYBER_SECURITY:"bg-crit/10 text-crit",
  QA:            "bg-warn/10 text-warn",
  MARKETING:     "bg-ok/10 text-ok",
  RESEARCH:      "bg-ok/10 text-ok",
  FINANCE:       "bg-ok/10 text-ok",
  OPERATIONS:    "bg-warn/10 text-warn",
  SUPPORT:       "bg-accent/10 text-accent",
  BUSINESS_MANAGER: "bg-violet/10 text-violet",
  HR:            "bg-pink-500/10 text-pink-600",
  INTERNSHIP:    "bg-surface-sunken text-muted",
  MEMBER:        "bg-surface-sunken text-muted",
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
          <div className="mb-6 px-3 py-2 bg-crit/10 border border-crit/30 rounded-lg">
            <p className="text-sm text-crit">Invalid email or password. Please try again.</p>
          </div>
        )}

        {users.length > 6 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="search"
                placeholder="Search by name, email, or role"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm text-foreground bg-surface focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted">
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
                className="flex items-center gap-4 p-4 border border-border rounded-xl hover:border-accent/40 hover:shadow-md hover:bg-surface-sunken transition-all text-left"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold text-base ${roleTileColors[u.role]}`}>
                  {u.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-sm">{u.fullName}</p>
                  <p className="text-xs text-muted">{u.email}</p>
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
        className="flex items-center gap-2 text-sm text-accent hover:text-accent mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Choose different account
      </button>

      <div className="flex items-center gap-4 mb-6 p-4 bg-surface-sunken border border-border rounded-xl">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full font-semibold text-lg ${roleTileColors[selectedUser.role]}`}>
          {selectedUser.fullName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-foreground">{selectedUser.fullName}</p>
          <p className="text-sm text-muted">{selectedUser.email}</p>
          <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${roleTileColors[selectedUser.role]}`}>
            {roleLabels[selectedUser.role]}
          </span>
        </div>
      </div>

      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="email" value={selectedUser.email} />

      <div className="mb-5">
        <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
        <input
          name="password"
          type="password"
          autoFocus
          required
          className="block w-full py-2.5 px-3 border border-border rounded-md bg-surface text-foreground focus:ring-2 focus:ring-accent focus:border-accent text-sm outline-none"
        />
      </div>

      {error && (
        <div className="mb-5 px-3 py-2 bg-crit/10 border border-crit/30 rounded-lg">
          <p className="text-sm text-crit">Invalid password. Please try again.</p>
        </div>
      )}

      <button className="w-full flex justify-center py-2.5 px-4 rounded-md shadow-sm text-sm font-semibold text-accent-foreground bg-accent hover:bg-accent-hover transition-all active:scale-[0.98]">
        Sign in as {selectedUser.fullName}
      </button>
    </form>
  );
}
