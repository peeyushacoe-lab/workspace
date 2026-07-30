"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ResolvedGroup } from "@/lib/nav-groups";

/**
 * Atrium contextual rail — the destinations inside the current app.
 *
 * Only rendered for apps that don't already provide their own second column
 * (see `railVisible`). Mail, Chat, Drive and Docs supply their own, so the rail
 * stays out of the way there rather than adding a redundant third column.
 */
export function NavRail({ group }: { group: ResolvedGroup }) {
  const pathname = usePathname() ?? "";

  // Group items by their optional section heading, preserving order.
  const sections: Array<{ heading: string | null; items: ResolvedGroup["items"] }> = [];
  for (const item of group.items) {
    const heading = item.section ?? null;
    const last = sections[sections.length - 1];
    if (last && last.heading === heading) last.items.push(item);
    else sections.push({ heading, items: [item] });
  }

  return (
    <div className="flex flex-col gap-1 py-3 pr-2 w-[212px] flex-shrink-0 overflow-y-auto">
      <h2 className="px-3 pb-2 text-[15px] font-semibold tracking-tight text-foreground">
        {group.label}
      </h2>

      {sections.map((section, si) => (
        <div key={si} className={section.heading ? "mt-3" : undefined}>
          {section.heading && (
            <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">
              {section.heading}
            </p>
          )}
          <nav className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.hint}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-[13px] transition-colors ${
                    active
                      ? "bg-accent-soft font-semibold text-accent"
                      : "text-muted hover:bg-hover hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}
