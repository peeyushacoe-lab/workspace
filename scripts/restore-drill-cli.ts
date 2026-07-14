/**
 * CLI entrypoint for the restore drill. Run manually or on a schedule
 * (e.g. a weekly cron) so `/admin/backups` always shows a recent, real
 * restore-drill result instead of "not tested".
 *
 * Usage: npm run restore-drill
 */
import { prisma } from "@/lib/prisma";
import { runAndRecordRestoreDrill } from "../src/lib/restore-drill";

async function main() {
  console.log("[restore-drill] Starting…");
  const result = await runAndRecordRestoreDrill();

  console.log(`[restore-drill] ${result.ok ? "PASSED" : "FAILED"} — ${result.tablesVerified} tables, ${result.rowsVerified} rows`);
  console.log(JSON.stringify(result.details, null, 2));
  if (result.error) console.error(`[restore-drill] Error: ${result.error}`);

  process.exit(result.ok ? 0 : 1);
}

main()
  .catch((err) => { console.error("[restore-drill] Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
