"use client";

import { useEffect, useState, use } from "react";
// currentUser removed — provided by (portal)/layout.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import type { UserRole } from "@/generated/prisma/enums";

interface LoginEvent {
  id: string;
  email: string;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface TargetUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export default function UserLoginsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [user, setUser] = useState<TargetUser | null>(null);
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/users/${id}/logins`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: { user: TargetUser; events: LoginEvent[] }) => {
        setUser(data.user);
        setEvents(data.events);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <PageHeader
        eyebrow="User Management"
        title={user ? `Login activity — ${user.name}` : "Login activity"}
        description={user ? `Recent sign-in attempts for ${user.email}` : "Recent sign-in attempts."}
      />

      <div className="space-y-6 px-6 py-8 lg:px-10">
        <div>
          <Link href="/users">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to users
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email used</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>User agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No login attempts recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(event.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {event.success ? (
                            <Badge className="bg-green-500/15 text-green-300">Success</Badge>
                          ) : (
                            <Badge className="bg-red-500/15 text-red-300">Failed</Badge>
                          )}
                        </TableCell>
                        <TableCell>{event.email}</TableCell>
                        <TableCell>{event.ip ?? "—"}</TableCell>
                        <TableCell className="max-w-[420px] truncate" title={event.userAgent ?? ""}>
                          {event.userAgent ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
