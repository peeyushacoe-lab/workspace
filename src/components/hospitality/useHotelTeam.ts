"use client";

import { useEffect, useState } from "react";

export type HotelMember = {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  isActive: boolean;
  isOwner: boolean;
  access: "manager" | "staff";
  createdAt: string;
};

export type TeamPayload = { meId: string; isManager: boolean; maxUsers: number | null; members: HotelMember[] };

/** The hotel's team — used for assignee pickers across rooms, housekeeping and tasks. */
export function useHotelTeam() {
  const [team, setTeam] = useState<TeamPayload | null>(null);
  useEffect(() => {
    fetch("/api/hospitality/team", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TeamPayload | null) => { if (d) setTeam(d); })
      .catch(() => {});
  }, []);
  return team;
}
