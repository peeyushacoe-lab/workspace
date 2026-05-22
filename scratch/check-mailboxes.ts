import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const mailboxes = await prisma.mailbox.findMany({
    select: { email: true, displayName: true },
  });
  console.log("MAILBOXES:", mailboxes);

  const threadCount = await prisma.inboxThread.count();
  const messageCount = await prisma.inboxMessage.count();
  console.log("THREADS:", threadCount, "| MESSAGES:", messageCount);

  const recent = await prisma.inboxThread.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { subject: true, createdAt: true },
  });
  console.log("RECENT THREADS:", JSON.stringify(recent, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
