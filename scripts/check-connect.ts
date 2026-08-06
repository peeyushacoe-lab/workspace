import { existsSync } from "node:fs";
import { join } from "node:path";
import * as lucide from "lucide-react";
import { CONNECT_NAV, connectSectionFor, isLive } from "../src/lib/connect";
import { pathAccess, routePermission, canAccessPathByPerms } from "../src/lib/auth";
import { PERMISSION_KEYS } from "../src/lib/rbac/catalog";
import { matchSubdomain, subdomainToPath, shouldRedirectToHub, rootDomain, appUrl, APP_SUBDOMAINS } from "../src/lib/subdomains";

/**
 * Sage Connect surface check.
 *
 * CONNECT_NAV is the single source of truth for Connect's sections, but three
 * other things have to agree with it or the product breaks in ways that only
 * show up at runtime: the role gate (pathAccess), the permission gate
 * (routePermission), and the filesystem router. This asserts all three, plus
 * the subdomain rewrite.
 *
 *   npm run check:connect
 *
 * Pure logic — no database, no network.
 */

const failures: string[] = [];
const fail = (msg: string) => {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
};

const APP_DIR = join(process.cwd(), "src", "app", "(connect)");

// ── 1. Every section is admitted by the role gate ────────────────────────────
function checkRoleGate() {
  console.log("\nRole gate (pathAccess)");
  for (const item of CONNECT_NAV) {
    const match = pathAccess.find(
      (p) => item.href === p.prefix || item.href.startsWith(`${p.prefix}/`),
    );
    if (!match) {
      fail(`${item.href} matches no pathAccess prefix — default-deny will 403 it`);
    } else if (match.roles.length === 0) {
      fail(`${item.href} is gated on an empty role list — nobody can reach it`);
    }
  }
  if (failures.length === 0) console.log(`  ✓ ${CONNECT_NAV.length} sections admitted`);
}

// ── 2. Every section has a real, catalogued permission ───────────────────────
function checkPermissionGate() {
  console.log("\nPermission gate (routePermission)");
  for (const item of CONNECT_NAV) {
    if (!PERMISSION_KEYS.has(item.permission)) {
      fail(`${item.href} declares "${item.permission}", which is not in PERMISSION_CATALOG`);
    }

    const entry = routePermission.find((r) => r.prefix === item.href);
    if (!entry) {
      fail(`${item.href} has no routePermission entry — connectRoutePermissions() not spread into auth.ts?`);
      continue;
    }
    if (entry.permission !== item.permission) {
      fail(`${item.href} gate drift: nav says "${item.permission}", routePermission says "${entry.permission}"`);
    }

    // Holding the permission grants; holding nothing denies. This is the
    // behaviour middleware relies on once RBAC_ENFORCE is set.
    if (canAccessPathByPerms([item.permission], item.href) !== true) {
      fail(`${item.href} denies a user who holds "${item.permission}"`);
    }
    if (canAccessPathByPerms([], item.href) !== false) {
      fail(`${item.href} admits a user holding no permissions`);
    }
  }
  console.log(`  ✓ ${CONNECT_NAV.length} sections gated on catalogued permissions`);
}

// ── 3. Longest-prefix routing resolves nested paths to the right section ─────
function checkSectionResolution() {
  console.log("\nSection resolution");
  const home = connectSectionFor("/connect");
  if (home?.href !== "/connect") fail(`/connect resolves to ${home?.href ?? "nothing"}`);

  for (const item of CONNECT_NAV) {
    if (item.href === "/connect") continue;
    const nested = connectSectionFor(`${item.href}/abc123`);
    if (nested?.href !== item.href) {
      fail(`${item.href}/abc123 resolves to ${nested?.href ?? "nothing"} — longest-prefix match broken`);
    }
  }
  console.log("  ✓ nested paths resolve to their own section, not Home");
}

// ── 4. Every live section has a page on disk ─────────────────────────────────
function checkPagesExist() {
  console.log("\nFilesystem routes");
  for (const item of CONNECT_NAV) {
    const rel = item.href.replace(/^\//, "");
    const file = join(APP_DIR, rel, "page.tsx");
    if (!existsSync(file)) {
      fail(`${item.href} has no page at src/app/(connect)/${rel}/page.tsx — sidebar link 404s`);
    }
  }
  console.log(`  ✓ ${CONNECT_NAV.length} sections have pages`);
}

// ── 5. Nav icons resolve to real lucide glyphs ───────────────────────────────
function checkIcons() {
  console.log("\nNav icons");
  const glyphs = lucide as unknown as Record<string, unknown>;
  for (const item of CONNECT_NAV) {
    if (typeof glyphs[item.icon] === "undefined") {
      fail(`${item.href} declares icon "${item.icon}", which lucide-react does not export`);
    }
  }
  console.log("  ✓ every nav icon exists in lucide-react");
}

// ── 6. connect.cybersage.uk rewrites onto the Connect route tree ─────────────
function checkSubdomain() {
  console.log("\nSubdomain rewrite");
  const sub = APP_SUBDOMAINS.find((s) => s.host === "connect");
  if (!sub) {
    fail("no `connect` entry in APP_SUBDOMAINS — connect.cybersage.uk serves the hub");
    return;
  }

  // matchSubdomain needs a root domain; without NEXT_PUBLIC_APP_URL set it
  // returns null by design (local dev), so assert against an explicit host.
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "cybersage.uk";
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = root;

  const matched = matchSubdomain(`connect.${root}`);
  if (matched?.host !== "connect") {
    fail(`connect.${root} did not match the connect subdomain`);
  }

  // Root and each section's vanity path must land on the real portal route.
  if (subdomainToPath(sub, "/") !== "/connect") {
    fail(`connect.${root}/ maps to ${subdomainToPath(sub, "/")}, expected /connect`);
  }
  for (const item of CONNECT_NAV) {
    if (item.href === "/connect") continue;
    const vanity = item.href.slice("/connect".length); // "/chat"
    const mapped = subdomainToPath(sub, vanity);
    if (mapped !== item.href) {
      fail(`connect.${root}${vanity} maps to ${mapped}, expected ${item.href}`);
    }
    if (shouldRedirectToHub(sub, vanity)) {
      fail(`connect.${root}${vanity} bounces to the hub instead of rendering`);
    }
  }

  // Shared signed-in paths must render as themselves, not be suffixed onto
  // /connect — the regression that sent meet.cybersage.uk/settings to a 404.
  for (const shared of ["/settings", "/profile", "/notifications"]) {
    if (subdomainToPath(sub, shared) !== shared) {
      fail(`connect.${root}${shared} maps to ${subdomainToPath(sub, shared)}, expected ${shared}`);
    }
  }

  // Hub routes pasted at Connect must bounce to Nexus, not rewrite into a
  // /connect/* path that has no page. Connect declares its whole surface as
  // aliases precisely so this falls through instead of being suffixed.
  for (const hubPath of ["/inbox", "/drive", "/calendar", "/admin", "/docs"]) {
    if (!shouldRedirectToHub(sub, hubPath)) {
      fail(
        `connect.${root}${hubPath} does not bounce to the hub — it maps to ` +
          `${subdomainToPath(sub, hubPath)}, which has no page`,
      );
    }
  }

  console.log("  ✓ root, sections, shared paths and hub bounces all correct");
}

// ── 7. Preview deployments must not emit links to hostnames we don't own ─────
function checkPlatformHostGuard() {
  console.log("\nPreview-deploy guard");
  const savedRoot = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const savedApp = process.env.NEXT_PUBLIC_APP_URL;

  delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  process.env.NEXT_PUBLIC_APP_URL = "https://cybersage-mail.vercel.app";

  const derived = rootDomain();
  if (derived !== null) {
    fail(
      `a vercel.app deploy derives rootDomain() = "${derived}" — cross-product ` +
        `links would point at connect.${derived}, a hostname we do not own`,
    );
  }
  const link = appUrl("/connect");
  if (link !== "/connect") {
    fail(`appUrl("/connect") on a preview returned "${link}", expected the relative "/connect"`);
  }

  if (savedRoot === undefined) delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  else process.env.NEXT_PUBLIC_ROOT_DOMAIN = savedRoot;
  if (savedApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedApp;

  console.log("  ✓ preview hostnames fall back to relative links");
}

function main() {
  console.log("Sage Connect surface check");
  console.log("═".repeat(60));

  checkRoleGate();
  checkPermissionGate();
  checkSectionResolution();
  checkPagesExist();
  checkIcons();
  checkSubdomain();
  checkPlatformHostGuard();

  const live = CONNECT_NAV.filter(isLive).length;
  console.log("\n" + "═".repeat(60));
  console.log(`${live}/${CONNECT_NAV.length} sections live at the current phase.`);

  if (failures.length > 0) {
    console.log(`FAILED — ${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log("PASSED — nav, gates, routes and subdomain all agree.");
}

main();
