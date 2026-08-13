/**
 * Grounding trigger test.
 *
 * `shouldGround` decides whether a chat message runs six workspace queries. Both
 * failure directions are real:
 *
 *   - false NEGATIVE: the assistant confidently invents your schedule. This is
 *     the failure the whole grounding feature exists to remove, so the heuristic
 *     is tuned to over-trigger.
 *   - false POSITIVE: a few cheap indexed queries and some unused prompt context.
 *     Wasteful, not wrong.
 *
 * Pure logic, no DB. Run:  npx tsx scripts/test-ai-grounding.ts
 */
import { shouldGround } from "../src/lib/ai-grounding";

let failures = 0;

function check(question: string, want: boolean) {
  const got = shouldGround(question);
  const ok = got.ground === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${want ? "ground " : "skip   "} "${question}"  (${got.reason})`);
}

console.log("── Must ground: questions about the user's own data ──");
check("What meetings do I have tomorrow?", true);
check("what's on my calendar this week", true);
check("Summarise the emails I received about the Sentinel project", true);
check("what tasks are overdue", true);
check("do I have anything due today", true);
check("who is the CISO", true);
check("show me my recent documents", true);
check("what did we decide in Monday's meeting", true);
check("anything urgent in my inbox?", true);
check("who reports to me", true);

console.log("\n── Must NOT ground: generative asks that don't touch the workspace ──");
check("write a haiku about firewalls", false);
check("explain what DMARC does", false);
check("translate this to French", false);
check("what is a zero-day", false);
check("how do I configure SPF records", false);
check("hi", false);
check("thanks", false);

console.log("\n── The interesting boundary ──");
// "write an email" is generative even though it names a workspace noun — the
// user wants the model's writing, not a search of their inbox.
check("write an email to the security team about patching", false);
// ...but adding a possessive flips it: now they're asking about their own data.
check("summarise my emails from the security team", true);
// Temporal alone is enough — "what's happening tomorrow" is about their data.
check("what's happening tomorrow", true);

console.log(
  failures === 0
    ? "\n✓ ai-grounding: workspace questions ground, generative asks don't"
    : `\n✗ ai-grounding: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
