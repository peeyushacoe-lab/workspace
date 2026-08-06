import Link from "next/link";
import { Compass, ArrowLeft } from "lucide-react";

/**
 * Connect's 404, scoped inside the (connect) layout so the shell stays mounted.
 *
 * This is what a stale deep link hits — the most common route being a bookmark
 * or a pasted URL for a team the person has since left, where
 * /connect/teams/[id] calls `notFound()`. Before this, that rendered Next's
 * default black-on-white 404 with no sidebar and no route back into the
 * product, which reads far more like an outage than a missing page.
 *
 * Note the wording: a team you can't see and a team that doesn't exist are
 * deliberately indistinguishable here, matching the API's own 404-not-403
 * stance — confirming a team exists to someone outside it is itself a leak.
 */
export default function ConnectNotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken">
        <Compass className="h-6 w-6 text-subtle" />
      </div>

      <h1 className="mt-4 text-base font-semibold tracking-tight text-foreground">
        We couldn&apos;t find that
      </h1>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
        The conversation, team or page you followed either doesn&apos;t exist or isn&apos;t
        shared with you.
      </p>

      <div className="mt-6 flex items-center gap-2">
        <Link
          href="/connect"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Connect
        </Link>
        <Link
          href="/connect/chat"
          className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          Open chat
        </Link>
      </div>
    </div>
  );
}
