import { prisma } from "@/lib/prisma";

function parseDeviceInfo(ua: string): string {
  const mobile = /Mobile|iPhone|Android|iPad|iPod/i.test(ua);

  let browser = "Unknown Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";

  let os = "Unknown OS";
  if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "Mac";
  else if (/Linux/i.test(ua)) os = "Linux";

  const deviceType = mobile ? "Mobile" : "Desktop";
  return `${browser} on ${os} (${deviceType})`;
}

function getIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export async function createSession(
  userId: string,
  token: string,
  request: Request,
): Promise<void> {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    const deviceInfo = ua ? parseDeviceInfo(ua) : "Unknown Device";
    const ipAddress = getIp(request);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8h matches cookie

    await prisma.userSession.upsert({
      where: { token },
      update: { lastSeenAt: now },
      create: { userId, token, deviceInfo, ipAddress, userAgent: ua || null, lastSeenAt: now, expiresAt },
    });
  } catch {
  }
}
