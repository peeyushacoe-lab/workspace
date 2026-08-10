/**
 * Task provenance link test — the round trip's contract.
 *
 * `resolveTaskSource` decides whether a backlink chip is clickable and where it
 * goes. Getting it wrong is silent: the chip still renders, still looks like a
 * link, and lands nowhere. These cases pin the three rules that are easy to
 * regress:
 *
 *   1. A source is only linkable if the target view actually reads the param.
 *   2. Chat needs the composite "<channelId>#<messageId>" — a bare (legacy)
 *      message id must NOT link, because ?channel= would never match it.
 *   3. Meetings store a title string, not an id, so they never link.
 *
 * Pure logic, no DB. Run:  npx tsx scripts/test-task-source.ts
 */
import {
  resolveTaskSource,
  chatSourceId,
  chatSourceMessageId,
} from "../src/lib/task-source";

let failures = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) console.log(`    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
}

// ── Linkable sources ─────────────────────────────────────────────────────────
check("email links to the inbox thread",
  resolveTaskSource("email", "thr_123")?.href, "/inbox?thread=thr_123");
check("doc links to the docs editor",
  resolveTaskSource("doc", "doc_9")?.href, "/docs?open=doc_9");
check("chat composite links to the channel",
  resolveTaskSource("chat", chatSourceId("chan_1", "msg_2"))?.href,
  "/connect/chat?channel=chan_1");

// ── Deliberately NOT linkable ────────────────────────────────────────────────
check("legacy bare chat message id does not link",
  resolveTaskSource("chat", "msg_2")?.href, null);

// ── Meetings: id links, legacy title does not ────────────────────────────────
// Both arrive in the same column as plain strings, so shape is the only signal.
check("meeting id links to the meeting page",
  resolveTaskSource("meeting", "cmqwr7xxo000004jrmnbxfcqm")?.href,
  "/meetings/cmqwr7xxo000004jrmnbxfcqm");
check("legacy meeting TITLE does not link",
  resolveTaskSource("meeting", "Weekly Security Sync")?.href, null);
check("a short one-word title is not mistaken for an id",
  resolveTaskSource("meeting", "Standup")?.href, null);
check("a uuid is accepted as an id",
  resolveTaskSource("meeting", "3f2504e0-4f89-11d3-9a0c-0305e82c3301")?.href,
  "/meetings/3f2504e0-4f89-11d3-9a0c-0305e82c3301");
check("blank id does not link",
  resolveTaskSource("email", "   ")?.href, null);

// ── Not a source at all ──────────────────────────────────────────────────────
check("unknown sourceType resolves to null",
  resolveTaskSource("carrier-pigeon", "x"), null);
check("null sourceType resolves to null",
  resolveTaskSource(null, null), null);

// ── Composite encoding ───────────────────────────────────────────────────────
check("message id round-trips through the composite",
  chatSourceMessageId(chatSourceId("c", "m")), "m");
check("legacy id yields no message half",
  chatSourceMessageId("msg_2"), null);

// ── Injection safety ─────────────────────────────────────────────────────────
// Ids come from the DB, but the href is interpolated into a URL — encode anyway.
check("ids are url-encoded",
  resolveTaskSource("email", "a b&c")?.href, "/inbox?thread=a%20b%26c");

console.log(
  failures === 0
    ? "\n✓ task-source: every backlink either resolves or is honestly unlinkable"
    : `\n✗ task-source: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
