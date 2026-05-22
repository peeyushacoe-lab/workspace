import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({} as any);

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("--- CyberSage Workspace: Create User ---");
    const fullName = await rl.question("Full Name: ");
    const email = await rl.question("Email: ");
    const roleInput = await rl.question("Role (ADMIN, CEO, CISO, MARKETING, INTERNSHIP, R_AND_D) [ADMIN]: ");
    const role = roleInput || "ADMIN";
    const password = await rl.question("Password: ");

    console.log("\nCreating user...");
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        role: role as any,
        passwordHash,
        isActive: true,
      },
    });

    console.log(`User created: ${user.id}`);

    console.log("\nCreating default mailbox...");
    const mailboxEmail = await rl.question(`Mailbox Email [${email}]: `);
    const mEmail = mailboxEmail || email;

    const mailbox = await prisma.mailbox.create({
      data: {
        email: mEmail,
        displayName: `${fullName}'s Mailbox`,
        isShared: false,
        isNoReply: false,
        allowedRoles: [role as any],
        accessLogs: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });
    console.log(`Mailbox created: ${mailbox.id}`);

    console.log("\nCreating default signature...");
    const signature = await prisma.signature.create({
      data: {
        userId: user.id,
        fullName,
        title: role,
        html: `<p><strong>${fullName}</strong><br>${role} at CyberSage</p>`,
        plainText: `${fullName}\n${role} at CyberSage`,
      },
    });
    console.log(`Signature created: ${signature.id}`);

    console.log("\nDone! User is ready.");
  } catch (error) {
    console.error("Error creating user:", error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();
