import { NextResponse } from "next/server";

/**
 * REMOVED — superseded by /api/documents/[id]/comments.
 *
 * This route checked only that the caller was *logged in*, never that they had
 * any access to the document being commented on. Any authenticated user could
 * read every comment thread on every document in the workspace, and post into
 * them, just by guessing or enumerating a document id.
 *
 * It is kept as a stub returning 410 rather than deleted outright so that any
 * stale client still calling it fails loudly and safely instead of silently
 * hitting a rebuilt handler. Nothing in the app referenced it at the time of
 * removal.
 *
 * The replacement enforces access via resolveDocAccess() and works for Docs,
 * Sheets and Slides alike.
 */

const GONE = {
  error: "This endpoint has been removed. Use /api/documents/[id]/comments.",
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
