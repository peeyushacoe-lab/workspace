import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

interface MobileTokenPayload {
  userId: string;
  email: string;
  role: string;
}

export async function getMobileUser(request: Request): Promise<MobileTokenPayload | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "cybersage-mobile-secret";

  try {
    const payload = jwt.verify(token, secret) as MobileTokenPayload;
    // Lightweight active-user check
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true },
    });
    if (!user?.isActive) return null;
    // Update presence lastSeenAt fire-and-forget
    prisma.userPresence.upsert({
      where: { userId: payload.userId },
      update: { lastSeenAt: new Date(), status: "ONLINE" },
      create: { userId: payload.userId, status: "ONLINE", lastSeenAt: new Date() },
    }).catch(() => {});
    return payload;
  } catch {
    return null;
  }
}
