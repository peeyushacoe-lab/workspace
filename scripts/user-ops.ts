import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcrypt";
import type { UserRole } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function createUser(email: string, fullName: string, password: string, role: UserRole) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { fullName, passwordHash, role, isActive: true },
    create: { email, fullName, passwordHash, role },
  });
  console.log(`User created/updated: ${user.email} (${user.role})`);
}

async function disableUser(email: string) {
  await prisma.user.update({
    where: { email },
    data: { isActive: false },
  });
  console.log(`User disabled: ${email}`);
}

async function resetPassword(email: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });
  console.log(`Password reset for user: ${email}`);
}

const action = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  switch (action) {
    case "create":
      if (args.length < 4) {
        console.log("Usage: create <email> <fullName> <password> <role>");
        return;
      }
      await createUser(args[0], args[1], args[2], args[3] as UserRole);
      break;
    case "disable":
      if (args.length < 1) {
        console.log("Usage: disable <email>");
        return;
      }
      await disableUser(args[0]);
      break;
    case "reset-password":
      if (args.length < 2) {
        console.log("Usage: reset-password <email> <newPassword>");
        return;
      }
      await resetPassword(args[0], args[1]);
      break;
    default:
      console.log("Available actions: create, disable, reset-password");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
