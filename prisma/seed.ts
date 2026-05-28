import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcrypt";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/cybersage_mail?schema=public";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  console.log("Seeding database — admin account only.");
  console.log("All other users (CEO, CISO, etc.) are created via the Admin dashboard after login.");

  // Remove non-admin users so the system starts fresh
  await prisma.user.deleteMany({ where: { role: { not: "ADMIN" } } });

  const adminEmail = "admin@cybersage.uk";
  const adminPassword = "CyberSage@2025!"; // Change immediately after first login

  const adminHash = await bcrypt.hash(adminPassword, 10);

  // Bootstrap default organization
  const org = await prisma.organization.upsert({
    where: { slug: "cybersage" },
    update: {},
    create: {
      name: "CyberSage",
      slug: "cybersage",
      plan: "ENTERPRISE",
      maxUsers: 500,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash, mustResetPassword: false, organizationId: org.id, orgRole: "OWNER" },
    create: {
      email: adminEmail,
      fullName: "System Administrator",
      passwordHash: adminHash,
      role: "ADMIN",
      mustResetPassword: false,
      organizationId: org.id,
      orgRole: "OWNER",
    },
  });

  // Ensure the admin mailbox exists
  const adminMailbox = await prisma.mailbox.upsert({
    where: { email: adminEmail },
    update: { displayName: "System Admin", isShared: true },
    create: {
      email: adminEmail,
      displayName: "System Admin",
      isShared: true,
    },
  });

  await prisma.mailboxAccess.upsert({
    where: { mailboxId_userId: { mailboxId: adminMailbox.id, userId: admin.id } },
    update: { role: "OWNER" },
    create: { mailboxId: adminMailbox.id, userId: admin.id, role: "OWNER" },
  });

  // Ensure the noreply mailbox exists
  await prisma.mailbox.upsert({
    where: { email: "noreply@cybersage.uk" },
    update: {},
    create: {
      email: "noreply@cybersage.uk",
      displayName: "CyberSage Automation",
      isNoReply: true,
    },
  });

  console.log("\n✅ Seed complete.");
  console.log(`   Admin email:    ${adminEmail}`);
  console.log(`   Admin password: ${adminPassword}`);
  console.log("\n⚠️  IMPORTANT: Change the admin password immediately after first login.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
