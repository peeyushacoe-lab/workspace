/**
 * Reset test data before launch.
 *
 * Deletes ALL chat channels (with their messages/members via cascade) and ALL
 * internship discussions + submissions. Use this to clear the testing-phase data
 * so you can start fresh for real users.
 *
 * Run:  npx tsx scripts/reset-test-data.ts
 *   or: npm run reset-test-data
 *
 * Pass --yes to skip the confirmation prompt.
 */
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({} as any);

async function main() {
  const auto = process.argv.includes("--yes");

  const channels = await prisma.chatChannel.count();
  const submissions = await prisma.internSubmission.count();
  const discussions = await prisma.internDiscussion.count();

  console.log("--- Reset test data ---");
  console.log(`  Chat channels:        ${channels}`);
  console.log(`  Intern submissions:   ${submissions}`);
  console.log(`  Intern discussions:   ${discussions}`);
  console.log("These will be PERMANENTLY deleted (channels include all their messages).");

  if (!auto) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question('Type "DELETE" to confirm: ');
    rl.close();
    if (answer.trim() !== "DELETE") {
      console.log("Aborted.");
      return;
    }
  }

  const ch = await prisma.chatChannel.deleteMany({});
  const sub = await prisma.internSubmission.deleteMany({});
  const disc = await prisma.internDiscussion.deleteMany({});

  console.log(`Deleted ${ch.count} channels, ${sub.count} submissions, ${disc.count} discussions.`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
