"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type ComponentProps, type ReactNode } from "react";
import { appUrl, subdomainForPath, matchSubdomain } from "@/lib/subdomains";

/**
 * Link that crosses to an app subdomain when the target lives on one.
 *
 * Clicking "Sheets" in the sidebar should land on docs.cybersage.uk/sheets, not
 * nexus.cybersage.uk/apps/sheets. A next/link can't do that — client-side
 * navigation cannot change origin — so this renders a plain <a> for
 * cross-origin targets and a <Link> (with prefetch, no reload) for same-origin
 * ones.
 *
 * On localhost, or when the target already belongs to the current subdomain,
 * this behaves exactly like next/link.
 */
export function AppLink({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<ComponentProps<typeof Link>, "href" | "children">) {
  const resolved = useResolvedHref(href);

  if (resolved.external) {
    return <a href={resolved.href} {...(rest as ComponentProps<"a">)}>{children}</a>;
  }
  return <Link href={resolved.href} {...rest}>{children}</Link>;
}

/**
 * Resolves a portal path against the current hostname.
 *
 * `external` is true only when the target is on a DIFFERENT origin than the
 * page doing the linking — staying on docs.cybersage.uk to move between Docs
 * and Sheets keeps fast client-side routing.
 */
export function useResolvedHref(href: string): { href: string; external: boolean } {
  if (typeof window === "undefined" || !href.startsWith("/")) {
    return { href, external: false };
  }

  const absolute = appUrl(href);
  if (!absolute.startsWith("http")) return { href, external: false };

  const currentSub = matchSubdomain(window.location.host);
  const targetSub = subdomainForPath(href);

  // Same subdomain already — use the short in-app path and client routing.
  if (currentSub && targetSub && currentSub.host === targetSub.host) {
    return { href, external: false };
  }

  try {
    const target = new URL(absolute);
    if (target.host === window.location.host) {
      return { href, external: false };
    }
    return { href: absolute, external: true };
  } catch {
    return { href, external: false };
  }
}

/**
 * Programmatic equivalent of AppLink for onClick handlers — router.push() can't
 * change origin, so cross-subdomain navigation has to go through location.
 */
export function useAppNavigate(): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      if (typeof window === "undefined" || !href.startsWith("/")) {
        router.push(href);
        return;
      }
      const absolute = appUrl(href);
      if (!absolute.startsWith("http")) { router.push(href); return; }

      const currentSub = matchSubdomain(window.location.host);
      const targetSub = subdomainForPath(href);
      if (currentSub && targetSub && currentSub.host === targetSub.host) {
        router.push(href);
        return;
      }
      try {
        if (new URL(absolute).host === window.location.host) { router.push(href); return; }
        window.location.href = absolute;
      } catch {
        router.push(href);
      }
    },
    [router],
  );
}
