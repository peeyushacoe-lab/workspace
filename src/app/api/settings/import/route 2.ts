import { NextResponse } from "next/server";
import { z } from "zod";
import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto-secret";
import { importQueue } from "@/lib/queues/import.queue";

// GET /api/settings/import — list this user's import jobs (most recent first)
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.mailImportJob.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      provider: true,
      host: true,
      username: true,
      status: true,
      totalMessages: true,
      importedMessages: true,
      skippedMessages: true,
      failedMessages: true,
      currentFolder: true,
      errorLog: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ jobs });
}

// Blocks SSRF / internal-port-scan via user-supplied IMAP host — rejects
// loopback, private, link-local, and other internal/metadata hosts.
function isPrivateOrInternalHost(host: string): boolean {
  const hostname = host.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (hostname === "localhost" || hostname === "::1" || hostname === "0.0.0.0") return true;

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local/metadata
    if (a === 0) return true;
    return false;
  }

  // IPv6 unique-local / link-local
  if (hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80")) return true;

  return false;
}

const folderMappingSchema = z.array(
  z.object({
    source: z.string().min(1),
    target: z.enum(["inbox", "archive", "trash", "custom"]),
    label: z.string().optional().nullable(),
  }),
);

const connectSchema = z.object({
  action: z.literal("test"),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
});

const startSchema = z.object({
  action: z.literal("start"),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
  provider: z.enum(["GMAIL", "OUTLOOK", "YAHOO", "IMAP"]).default("IMAP"),
  folderMapping: folderMappingSchema.min(1, "Select at least one folder to import"),
});

// POST /api/settings/import
// action "test"  — connect and return the list of folders on the source server
// action "start" — persist credentials (encrypted) + folder mapping and enqueue the import job
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || !("action" in body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if ((body as { action: string }).action === "test") {
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { host, port, secure, username, password } = parsed.data;

    if (isPrivateOrInternalHost(host)) {
      return NextResponse.json({ error: "Could not connect to the specified server." }, { status: 400 });
    }

    const client = new ImapFlow({ host, port, secure, auth: { user: username, pass: password }, logger: false });
    try {
      await client.connect();
      const list = await client.list();
      const folders = list
        .filter((f) => !f.flags?.has("\\Noselect"))
        .map((f) => ({ path: f.path, name: f.name, specialUse: f.specialUse ?? null }));
      await client.logout().catch(() => {});
      return NextResponse.json({ ok: true, folders });
    } catch {
      await client.logout().catch(() => {});
      return NextResponse.json(
        { error: "Could not connect to the specified server." },
        { status: 400 },
      );
    }
  }

  if ((body as { action: string }).action === "start") {
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { host, port, secure, username, password, provider, folderMapping } = parsed.data;

    if (isPrivateOrInternalHost(host)) {
      return NextResponse.json({ error: "Could not connect to the specified server." }, { status: 400 });
    }

    const myMailbox = await prisma.mailbox.findUnique({
      where: { email: currentUser.email },
      select: { id: true },
    });
    if (!myMailbox) {
      return NextResponse.json({ error: "No mailbox found for your account" }, { status: 400 });
    }

    // Only one active import per user at a time — avoids duplicate/racing jobs
    const active = await prisma.mailImportJob.findFirst({
      where: { userId: currentUser.id, status: { in: ["PENDING", "CONNECTING", "IMPORTING"] } },
      select: { id: true },
    });
    if (active) {
      return NextResponse.json({ error: "An import is already in progress. Cancel it before starting a new one." }, { status: 409 });
    }

    const job = await prisma.mailImportJob.create({
      data: {
        userId: currentUser.id,
        mailboxId: myMailbox.id,
        provider,
        host,
        port,
        secure,
        username,
        encryptedPassword: encryptSecret(password),
        folderMapping,
        status: "PENDING",
      },
    });

    await importQueue.add("imap-import", { type: "IMAP_IMPORT", importJobId: job.id }, { jobId: job.id });

    return NextResponse.json({ ok: true, jobId: job.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
