import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const SCHEDULE_KEY = "attendance:schedule";
const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

interface PunchMeta {
  sessionId?: string;
  location?: { lat: number; lng: number; accuracy: number } | null;
  device?: string | null;
}
interface OverrideMeta {
  internId: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  reason: string | null;
  setBy: string;
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function minutesSinceMidnight(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function diffMinutes(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date") ?? toDateStr(new Date()); // YYYY-MM-DD
  const internIdParam = searchParams.get("internId");

  const isMentor = MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number]);

  // Restrict interns to their own data
  const targetInternId = isMentor ? internIdParam : user.id;

  // Date range for the requested date
  const dayStart = new Date(`${dateParam}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateParam}T23:59:59.999Z`);

  // Fetch schedule for late detection
  const rawSchedule = await redis.get(SCHEDULE_KEY);
  const schedule = rawSchedule
    ? { lateGraceMinutes: 15, startTime: "09:00", ...((typeof rawSchedule === "string" ? JSON.parse(rawSchedule) : rawSchedule) as Record<string, unknown>) }
    : { startTime: "09:00", endTime: "17:00", lateGraceMinutes: 15 };

  const scheduleStartMinutes = (() => {
    const [h, m] = (schedule.startTime as string).split(":").map(Number);
    return h * 60 + m;
  })();
  const graceMinutes = Number(schedule.lateGraceMinutes ?? 15);

  // Get all interns (mentor view: all; intern view: just self)
  let internUsers: { id: string; fullName: string; avatarUrl: string | null }[] = [];
  if (isMentor && !internIdParam) {
    internUsers = await prisma.user.findMany({
      where: { role: "INTERNSHIP", isActive: true },
      select: { id: true, fullName: true, avatarUrl: true },
      orderBy: { fullName: "asc" },
    });
  } else {
    const targetId = targetInternId ?? user.id;
    const u = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, fullName: true, avatarUrl: true },
    });
    if (u) internUsers = [u];
  }

  const internIds = internUsers.map(u => u.id);
  if (internIds.length === 0) return NextResponse.json([]);

  // Fetch punch events for the day
  const punchLogs = await prisma.auditLog.findMany({
    where: {
      actorId: { in: internIds },
      action: { in: ["INTERN_PUNCH_IN", "INTERN_PUNCH_OUT"] },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { createdAt: "asc" },
  });

  // Fetch override records for these interns on this date
  const overrides = await prisma.auditLog.findMany({
    where: {
      action: "INTERN_ATTENDANCE_OVERRIDE",
      targetType: "attendance",
      targetId: { in: internIds.map(id => `${id}:${dateParam}`) },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch activity counts (submissions + discussions) per intern for the day
  const [submissions, discussions] = await Promise.all([
    prisma.internSubmission.findMany({
      where: { submitterId: { in: internIds }, createdAt: { gte: dayStart, lte: dayEnd } },
      select: { submitterId: true },
    }),
    prisma.internDiscussion.findMany({
      where: { authorId: { in: internIds }, createdAt: { gte: dayStart, lte: dayEnd } },
      select: { authorId: true },
    }),
  ]);

  const activityByIntern: Record<string, number> = {};
  submissions.forEach(s => { activityByIntern[s.submitterId] = (activityByIntern[s.submitterId] ?? 0) + 1; });
  discussions.forEach(d => { activityByIntern[d.authorId] = (activityByIntern[d.authorId] ?? 0) + 1; });

  // Build result per intern
  const results = internUsers.map(intern => {
    // Check for override
    const override = overrides.find(o => (o.targetId as string) === `${intern.id}:${dateParam}`);
    const overrideMeta = override ? (override.metadata as unknown as OverrideMeta) : null;

    // Get punch events for this intern
    const myPunches = punchLogs.filter(p => p.actorId === intern.id);

    // Pair punches into sessions using sessionId
    const sessions: {
      punchIn: string;
      punchOut: string | null;
      sessionId: string;
      location: { lat: number; lng: number; accuracy: number } | null;
      device: string | null;
    }[] = [];
    const inEvents = myPunches.filter(p => p.action === "INTERN_PUNCH_IN");
    const outEvents = myPunches.filter(p => p.action === "INTERN_PUNCH_OUT");

    inEvents.forEach(inEvt => {
      const meta = inEvt.metadata as PunchMeta | null;
      const sid = meta?.sessionId ?? inEvt.id;
      const matchingOut = outEvents.find(o => {
        const om = o.metadata as PunchMeta | null;
        return om?.sessionId === sid;
      });
      sessions.push({
        punchIn: inEvt.createdAt.toISOString(),
        punchOut: matchingOut ? matchingOut.createdAt.toISOString() : null,
        sessionId: sid,
        location: meta?.location ?? null,
        device: meta?.device ?? null,
      });
    });

    // Apply override if present
    if (overrideMeta) {
      if (sessions.length === 0) {
        sessions.push({
          punchIn: overrideMeta.punchIn ?? new Date(dayStart).toISOString(),
          punchOut: overrideMeta.punchOut,
          sessionId: "override",
          location: null,
          device: null,
        });
      } else {
        // Override first session
        if (overrideMeta.punchIn) sessions[0].punchIn = overrideMeta.punchIn;
        if (overrideMeta.punchOut !== undefined) sessions[0].punchOut = overrideMeta.punchOut;
      }
    }

    const firstPunchIn = sessions[0]?.punchIn ?? null;
    const lastPunchOut = [...sessions].reverse().find(s => s.punchOut !== null)?.punchOut ?? null;

    const totalMinutes = sessions.reduce((acc, s) => {
      if (!s.punchOut) return acc;
      return acc + diffMinutes(s.punchIn, s.punchOut);
    }, 0);

    const isCurrentlyIn = sessions.some(s => !s.punchOut);
    const punchedIn = firstPunchIn !== null;

    const isLate = firstPunchIn
      ? minutesSinceMidnight(firstPunchIn) > scheduleStartMinutes + graceMinutes
      : false;

    const activityCount = activityByIntern[intern.id] ?? 0;
    // Idle flag: any session >90 minutes (including still-active) with zero activity
    const now = new Date().toISOString();
    const longestSession = Math.max(
      ...sessions.map(s => diffMinutes(s.punchIn, s.punchOut ?? now)),
      0
    );
    const idleFlag = punchedIn && longestSession > 90 && activityCount === 0;

    // Surface the first session's location + device at the top level for the mentor view
    const firstSession = sessions[0] ?? null;

    return {
      intern,
      date: dateParam,
      sessions,
      firstPunchIn,
      lastPunchOut,
      totalMinutes,
      isCurrentlyIn,
      isLate,
      idleFlag,
      activityCount,
      hasOverride: !!overrideMeta,
      overrideReason: overrideMeta?.reason ?? null,
      // Mentor-only fields (never rendered in intern UI)
      punchLocation: firstSession?.location ?? null,
      punchDevice: firstSession?.device ?? null,
    };
  });

  return NextResponse.json(results);
}
