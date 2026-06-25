import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

const SCHEDULE_KEY = "attendance:schedule";
const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

export interface AttendanceSchedule {
  startTime: string;   // "HH:MM"
  endTime: string;     // "HH:MM"
  timezone: string;
  lateGraceMinutes: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

const DEFAULT_SCHEDULE: AttendanceSchedule = {
  startTime: "09:00",
  endTime: "17:00",
  timezone: "UTC",
  lateGraceMinutes: 15,
  updatedBy: null,
  updatedAt: null,
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const raw = await redis.get(SCHEDULE_KEY);
  if (!raw) return NextResponse.json(DEFAULT_SCHEDULE);

  const schedule = typeof raw === "string" ? JSON.parse(raw) : raw;
  return NextResponse.json({ ...DEFAULT_SCHEDULE, ...schedule });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can set working hours" }, { status: 403 });
  }

  const body = await request.json() as Partial<AttendanceSchedule>;
  const schedule: AttendanceSchedule = {
    startTime: body.startTime ?? DEFAULT_SCHEDULE.startTime,
    endTime: body.endTime ?? DEFAULT_SCHEDULE.endTime,
    timezone: body.timezone ?? DEFAULT_SCHEDULE.timezone,
    lateGraceMinutes: body.lateGraceMinutes ?? DEFAULT_SCHEDULE.lateGraceMinutes,
    updatedBy: user.id,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(SCHEDULE_KEY, JSON.stringify(schedule));

  // Notify all active interns of the updated schedule
  const interns = await prisma.user.findMany({
    where: { role: "INTERNSHIP", isActive: true },
    select: { id: true },
  });

  await Promise.all(
    interns.map(intern =>
      createNotification({
        userId: intern.id,
        type: "SYSTEM",
        title: `📅 Working hours updated: ${schedule.startTime} – ${schedule.endTime}`,
        body: `Your mentor updated the official internship working hours. New hours apply from today.`,
        link: "/internship",
      }).catch(() => {}),
    ),
  );

  return NextResponse.json({ success: true, schedule });
}
