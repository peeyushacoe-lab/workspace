import bcrypt from "bcrypt";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const tempPassword = "HRAdmin@2026!";
  const hash = await bcrypt.hash(tempPassword, 12);

  const existing = await prisma.user.findUnique({ where: { email: "hr@cybersage.uk" } });
  let user;
  if (existing) {
    user = await prisma.user.update({
      where: { email: "hr@cybersage.uk" },
      data: { role: "HR" as any, passwordHash: hash, mustResetPassword: true, isActive: true, fullName: "HR Admin" },
    });
    console.log("Updated existing user:", user.id);
  } else {
    user = await prisma.user.create({
      data: { fullName: "HR Admin", email: "hr@cybersage.uk", role: "HR" as any, passwordHash: hash, mustResetPassword: true, isActive: true },
    });
    console.log("Created user:", user.id);
  }

  // Upsert mailbox
  const existingMb = await prisma.mailbox.findUnique({ where: { email: "hr@cybersage.uk" } });
  if (!existingMb) {
    const mb = await prisma.mailbox.create({
      data: {
        email: "hr@cybersage.uk",
        displayName: "HR Admin",
        isShared: false,
        isNoReply: false,
        allowedRoles: ["HR", "ADMIN"] as any,
        accessLogs: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    console.log("Created mailbox:", mb.id);
  } else {
    console.log("Mailbox already exists:", existingMb.id);
  }

  console.log("\n✅ hr@cybersage.uk is ready");
  console.log("   Email:    hr@cybersage.uk");
  console.log("   Password: " + tempPassword + "  (must reset on first login)");
}

main().catch(console.error).finally(() => prisma.$disconnect());
