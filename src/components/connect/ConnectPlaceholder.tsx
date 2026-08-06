import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { connectItem, isLive, CURRENT_PHASE } from "@/lib/connect";

/**
 * Stands in for a Connect section whose roadmap phase hasn't landed.
 *
 * The alternative — hiding unbuilt sections from the sidebar — makes the
 * product look finished when it isn't and quietly loses track of what's left.
 * Showing them, named and dated, keeps the shape of the finished product
 * visible and makes the next thing to build obvious from inside the app.
 */
export function ConnectPlaceholder({
  href,
  /** What this section will do, beyond the one-line hint in CONNECT_NAV. */
  detail,
  /** Where the capability lives in Nexus today, if it exists at all. */
  fallback,
}: {
  href: string;
  detail: string;
  fallback?: { href: string; label: string };
}) {
  const item = connectItem(href);
  if (!item) {
    throw new Error(
      `ConnectPlaceholder: "${href}" is not in CONNECT_NAV. Add it there first — ` +
        `the nav is what generates this section's route gate.`,
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-[10px] font-semibold text-muted">
        {isLive(item) ? "In progress" : `Phase ${item.phase}`}
      </span>

      <h1 className="text-lg font-semibold tracking-tight text-foreground">{item.label}</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">{detail}</p>

      <p className="mt-4 max-w-md text-xs text-subtle">
        Sage Connect is building in phases — this one arrives in phase {item.phase}
        {CURRENT_PHASE < item.phase ? `, after phase ${CURRENT_PHASE}` : ""}.
      </p>

      {fallback && (
        <Link
          href={fallback.href}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          {fallback.label}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
