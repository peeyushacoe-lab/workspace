import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

async function main() {
  if (!connectionString) {
    console.error("DATABASE_URL not found");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  console.log("Checking last 10 email logs...");
  const logs = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (logs.length === 0) {
    console.log("No email logs found.");
  } else {
    logs.forEach((log) => {
      console.log(`- [${log.createdAt.toISOString()}] To: ${log.recipient} | Status: ${log.status}`);
      if (log.error) console.log(`  Error: ${log.error}`);
      console.log(`  Subject: ${log.subject}`);
      console.log("---");
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
