import { prisma } from "./prisma";

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
};

export async function getTokensForUser(userId: string): Promise<string[]> {
  const rows = await prisma.mobilePushToken.findMany({
    where: { userId },
    select: { token: true },
  }).catch(() => []);
  return rows.map((r) => r.token);
}

export async function sendExpoPush(
  tokens: string[],
  payload: Omit<ExpoMessage, "to">,
): Promise<void> {
  if (!tokens.length) return;
  const messages: ExpoMessage[] = tokens.map((to) => ({
    to,
    sound: "default",
    ...payload,
  }));
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  }).catch((err: Error) => {
    console.error("[expo-push] send failed:", err.message);
  });
}
