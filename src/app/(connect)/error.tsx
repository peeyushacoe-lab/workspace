"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw, ArrowLeft } from "lucide-react";

/**
 * Connect's error boundary.
 *
 * The route group had none, so any throw — a failed Prisma call, a client
 * component blowing up on unexpected data — escaped to the root boundary and
 * took the entire Connect shell with it: no sidebar, no way back, a bare
 * error page on a subdomain that no longer looked like the product. Because
 * this sits *inside* the (connect) layout, the shell stays mounted and the
 * failure is contained to the panel it happened in.
 *
 * Deliberately doesn't print the raw error. The message can carry a query
 * fragment or an id, and this is a security product; `digest` is the handle
 * to correlate with the server log, which is what's actually useful.
 */
export default function ConnectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[connect] render error:", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-crit-soft">
        <AlertTriangle className="h-6 w-6 text-crit" />
      </div>

      <h1 className="mt-4 text-base font-semibold tracking-tight text-foreground">
        This page didn&apos;t load
      </h1>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
        Something went wrong on our side. Your messages are safe — nothing was lost.
      </p>

      {error.digest && (
        <p className="mt-3 rounded-md bg-surface-sunken px-2.5 py-1 font-mono text-[11px] text-subtle">
          Reference: {error.digest}
        </p>
      )}

      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <RotateCw className="h-4 w-4" />
          Try again
        </button>
        <Link
          href="/connect"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Connect
        </Link>
      </div>
    </div>
  );
}
