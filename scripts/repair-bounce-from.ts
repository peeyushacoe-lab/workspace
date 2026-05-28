import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const bad = await prisma.inboxMessage.findMany({
    where: { from: { contains: "@send." } },
    select: { id: true, threadId: true, from: true, subject: true },
  });

  console.log(`Found ${bad.length} bad messages.`);
  if (bad.length > 0) {
    console.log(bad.map((m) => ({ id: m.id.slice(0, 8), from: m.from, subject: m.subject })));
  }

  for (const msg of bad) {
    await prisma.inboxMessage.delete({ where: { id: msg.id } });
    const remaining = await prisma.inboxMessage.count({ where: { threadId: msg.threadId } });
    if (remaining === 0) {
      await prisma.inboxThread.deleteMany({ where: { id: msg.threadId } });
      console.log("Deleted empty thread", msg.threadId.slice(0, 8));
    }
  }

  console.log(`Done. Purged ${bad.length} messages.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
