/**
 * Per-app subdomains — the Google-Workspace split.
 *
 * Nexus is ONE Next.js deployment serving several hostnames. `docs.cybersage.uk`
 * is not a separate app: middleware reads the Host header and rewrites the URL
 * into the matching portal route, so `docs.cybersage.uk/` renders exactly what
 * `nexus.cybersage.uk/docs` renders — same code, same session, prettier URL.
 *
 * The split mirrors Google's: docs.google.com hosts Docs, Sheets AND Slides,
 * while Drive and Meet get their own hostnames.
 *
 *   docs.cybersage.uk          → /docs            (documents list)
 *   docs.cybersage.uk/sheets   → /apps/sheets
 *   docs.cybersage.uk/sheets/X → /apps/sheets/X
 *   docs.cybersage.uk/slides/X → /apps/slides/X
 *   drive.cybersage.uk         → /drive
 *   meet.cybersage.uk/room123  → /meet/room123
 *
 * `nexus.cybersage.uk` remains the hub (login, inbox, chat, admin, settings) and
 * still serves every path, so old links never break.
 *
 * Setup required outside the code — see docs/subdomains.md:
 *   1. Add each hostname as a domain on the Vercel project.
 *   2. Point a CNAME for each at Vercel.
 *   3. Set COOKIE_DOMAIN=.cybersage.uk so one login covers all subdomains.
 */

export type AppSubdomain = {
  /** Hostname label, e.g. "docs" in docs.cybersage.uk. */
  host: string;
  /** Human label. */
  label: string;
  /** Portal route served at the subdomain root. */
  home: string;
  /**
   * Portal path prefixes this subdomain serves. A request already using one of
   * these is passed through untouched, so `docs.cybersage.uk/apps/sheets/X`
   * works as well as the short `docs.cybersage.uk/sheets/X`.
   */
  owns: string[];
  /**
   * Short vanity prefixes → real portal paths, Google-style. Order matters:
   * longest prefix should come first.
   */
  aliases?: { from: string; to: string }[];
};

export const APP_SUBDOMAINS: AppSubdomain[] = [
  {
    host: "docs",
    label: "Docs",
    home: "/docs",
    owns: ["/docs", "/apps/sheets", "/apps/slides"],
    aliases: [
      { from: "/sheets", to: "/apps/sheets" },
      { from: "/slides", to: "/apps/slides" },
      { from: "/document", to: "/docs" },
    ],
  },
  { host: "drive", label: "Drive", home: "/drive", owns: ["/drive"] },
  { host: "meet",  label: "Meet",  home: "/meet",  owns: ["/meet"] },
];

/**
 * The slim nav an app subdomain shows instead of the full Nexus workspace
 * spine — the docs.google.com model, where the sidebar lists Docs / Sheets /
 * Slides and nothing else.
 */
export const SUBDOMAIN_NAV: Record<string, { href: string; label: string }[]> = {
  docs: [
    { href: "/docs", label: "Documents" },
    { href: "/apps/sheets", label: "Sheets" },
    { href: "/apps/slides", label: "Slides" },
  ],
  drive: [
    { href: "/drive", label: "My Drive" },
  ],
  meet: [
    { href: "/meet", label: "Meetings" },
    { href: "/meet/intelligence", label: "Meeting intelligence" },
  ],
};

/** Portal path → the subdomain that owns it, if any. */
export function subdomainForPath(path: string): AppSubdomain | null {
  return (
    APP_SUBDOMAINS.find(s =>
      s.owns.some(owned => path === owned || path.startsWith(`${owned}/`)),
    ) ?? null
  );
}

/**
 * Root domain shared by every hostname, e.g. "cybersage.uk".
 * Derived from NEXT_PUBLIC_APP_URL so local/staging deploys don't need it set.
 */
export function rootDomain(): string | null {
  const explicit = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (explicit) return explicit.replace(/^\./, "");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  try {
    const host = new URL(appUrl).hostname; // e.g. nexus.cybersage.uk
    const parts = host.split(".");
    // Strip the leading app label ("nexus") to get the registrable domain.
    // Two-label hosts (localhost, example.com) are returned unchanged.
    return parts.length > 2 ? parts.slice(1).join(".") : host;
  } catch {
    return null;
  }
}

/** Strips port and lowercases, so "Docs.cybersage.uk:3000" → "docs.cybersage.uk". */
export function normaliseHost(host: string | null | undefined): string {
  return (host ?? "").split(":")[0].trim().toLowerCase();
}

/**
 * Which app subdomain (if any) a request arrived on.
 * Returns null for the hub, for localhost, and for Vercel preview URLs — those
 * all serve the full path space unchanged.
 */
export function matchSubdomain(host: string | null | undefined): AppSubdomain | null {
  const clean = normaliseHost(host);
  if (!clean) return null;

  const label = clean.split(".")[0];
  const found = APP_SUBDOMAINS.find(s => s.host === label);
  if (!found) return null;

  // Only treat it as an app subdomain when it really is `<app>.<root>` —
  // otherwise a preview deployment whose URL happens to start with "docs-"
  // would hijack the entire deployment into /docs.
  const root = rootDomain();
  if (root && clean !== `${found.host}.${root}`) return null;

  return found;
}

/**
 * Absolute URL for a portal path, routed to its own subdomain when it has one.
 *
 * `appUrl("/docs")`            → "https://docs.cybersage.uk"
 * `appUrl("/apps/sheets/abc")` → "https://docs.cybersage.uk/sheets/abc"
 * `appUrl("/drive")`           → "https://drive.cybersage.uk"
 * `appUrl("/inbox")`           → "/inbox"   (hub path — left relative)
 *
 * Returns a relative path whenever no root domain is configured (local dev), so
 * everything keeps working on localhost:3000 with no subdomain setup at all.
 */
export function appUrl(path: string): string {
  const root = rootDomain();
  if (!root || root === "localhost") return path;

  const sub = subdomainForPath(path);
  if (!sub) return path;

  let rest: string;
  if (path === sub.home) {
    // The subdomain root. Checked FIRST: `docs` aliases /document → /docs, and
    // matching that alias here would turn /docs into docs.cybersage.uk/document.
    rest = "/";
  } else {
    // Prefer the short vanity form when one exists (/apps/sheets/X → /sheets/X).
    const alias = sub.aliases?.find(
      a => path === a.to || path.startsWith(`${a.to}/`),
    );
    if (alias) {
      rest = `${alias.from}${path.slice(alias.to.length)}`;
    } else if (sub.owns.length === 1 && path.startsWith(`${sub.home}/`)) {
      // Single-app subdomain: /meet/r1 → meet.cybersage.uk/r1. Without this the
      // host prefix is kept and subdomainToPath re-adds it, producing
      // /meet/meet/r1 — a 404.
      rest = path.slice(sub.home.length);
    } else {
      rest = path;
    }
  }

  return `https://${sub.host}.${root}${rest === "/" ? "" : rest}`;
}

/**
 * Inverse of the rewrite: given a subdomain and the incoming pathname, the
 * portal path to render. Used by middleware.
 */
export function subdomainToPath(sub: AppSubdomain, pathname: string): string {
  if (pathname === "/" || pathname === "") return sub.home;

  // Already a real portal path this subdomain serves — nothing to do.
  if (sub.owns.some(o => pathname === o || pathname.startsWith(`${o}/`))) {
    return pathname;
  }

  // Vanity alias, e.g. /sheets/abc → /apps/sheets/abc.
  for (const alias of sub.aliases ?? []) {
    if (pathname === alias.from || pathname.startsWith(`${alias.from}/`)) {
      return `${alias.to}${pathname.slice(alias.from.length)}`;
    }
  }

  // Single-app subdomain: treat the path as a suffix of its home, so
  // meet.cybersage.uk/room123 → /meet/room123.
  if (sub.owns.length === 1) {
    return `${sub.home}${pathname}`;
  }

  // Multi-app subdomain (docs) with an unrecognised path — leave it alone.
  // `shouldRedirectToHub` decides whether it belongs here at all.
  return pathname;
}

/**
 * Paths a subdomain will render even though it doesn't "own" them, because
 * they're part of being signed in anywhere.
 */
const SHARED_PATHS = [
  "/settings", "/profile", "/notifications", "/setup-passkey", "/download",
];

/**
 * True when a path should bounce to the hub rather than render on this
 * subdomain.
 *
 * Without this, every Nexus route resolved on every subdomain:
 * `docs.cybersage.uk/drive` rendered Drive, complete with the full workspace
 * sidebar, so the "app" was really the whole product wearing a different
 * hostname. An app subdomain should behave like docs.google.com — its own
 * apps and nothing else.
 */
export function shouldRedirectToHub(sub: AppSubdomain, pathname: string): boolean {
  if (pathname === "/") return false;
  if (isPassthrough(pathname)) return false;
  if (SHARED_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) return false;

  const owned = sub.owns.some(o => pathname === o || pathname.startsWith(`${o}/`));
  const aliased = (sub.aliases ?? []).some(
    a => pathname === a.from || pathname.startsWith(`${a.from}/`),
  );
  return !owned && !aliased;
}

/** Absolute hub URL for a path, used for those redirects. */
export function hubUrl(path: string): string | null {
  const root = rootDomain();
  if (!root || root === "localhost") return null;
  const appUrlEnv = process.env.NEXT_PUBLIC_APP_URL;
  try {
    const host = appUrlEnv ? new URL(appUrlEnv).host : `nexus.${root}`;
    return `https://${host}${path}`;
  } catch {
    return `https://nexus.${root}${path}`;
  }
}

/**
 * Paths that must NEVER be rewritten onto a subdomain's base path — they have
 * to resolve identically on every hostname.
 *
 * `/api` matters most: the Docs page running on docs.cybersage.uk fetches
 * `/api/docs`, which is same-origin there. Rewriting it would 404 every
 * request the app makes.
 */
const PASSTHROUGH_PREFIXES = [
  "/api",
  "/_next",
  "/login",
  "/logout",
  "/register",
  "/reset-password",
  "/mfa-challenge",
  "/setup-passkey",
  "/monitoring",
];

export function isPassthrough(pathname: string): boolean {
  if (PASSTHROUGH_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Static assets — anything with a file extension in the last segment.
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last.includes(".");
}
