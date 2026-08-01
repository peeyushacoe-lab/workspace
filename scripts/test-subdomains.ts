/**
 * Subdomain routing + app-boundary tests.  npm run test:subdomains
 *
 * The boundary rules are the point: an app subdomain must serve ITS apps and
 * bounce everything else to the hub. Without that, docs.cybersage.uk/drive
 * rendered Drive inside the full workspace sidebar.
 */
import {
  matchSubdomain, subdomainToPath, appUrl, isPassthrough, subdomainForPath,
  shouldRedirectToHub, SUBDOMAIN_NAV, APP_SUBDOMAINS,
} from "../src/lib/subdomains";

process.env.NEXT_PUBLIC_APP_URL ??= "https://nexus.cybersage.uk";

let pass = 0, fail = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++; else { fail++; console.log(`  ✗ ${label}: got ${a} want ${b}`); }
};

const docs = APP_SUBDOMAINS.find(s => s.host === "docs")!;
const drive = APP_SUBDOMAINS.find(s => s.host === "drive")!;
const meet = APP_SUBDOMAINS.find(s => s.host === "meet")!;

console.log("Host matching");
t("docs matches", matchSubdomain("docs.cybersage.uk")?.host, "docs");
t("hub is not a subdomain", matchSubdomain("nexus.cybersage.uk"), null);
t("vercel preview is not", matchSubdomain("docs-git-x.vercel.app"), null);

console.log("App boundary — the bug that prompted this");
t("docs must NOT serve /drive", shouldRedirectToHub(docs, "/drive"), true);
t("docs must NOT serve /inbox", shouldRedirectToHub(docs, "/inbox"), true);
t("docs must NOT serve /chat", shouldRedirectToHub(docs, "/chat"), true);
t("docs must NOT serve /apps", shouldRedirectToHub(docs, "/apps"), true);
t("docs must NOT serve /admin", shouldRedirectToHub(docs, "/admin"), true);
t("drive must NOT serve /docs", shouldRedirectToHub(drive, "/docs"), true);
t("meet must NOT serve /drive", shouldRedirectToHub(meet, "/drive"), true);

console.log("App boundary — what each subdomain DOES serve");
t("docs serves /docs", shouldRedirectToHub(docs, "/docs"), false);
t("docs serves /apps/sheets", shouldRedirectToHub(docs, "/apps/sheets"), false);
t("docs serves /apps/slides/abc", shouldRedirectToHub(docs, "/apps/slides/abc"), false);
t("docs serves the /sheets alias", shouldRedirectToHub(docs, "/sheets"), false);
t("docs serves /slides/abc alias", shouldRedirectToHub(docs, "/slides/abc"), false);
t("docs serves root", shouldRedirectToHub(docs, "/"), false);
t("drive serves /drive", shouldRedirectToHub(drive, "/drive"), false);
t("meet serves /meet/room1", shouldRedirectToHub(meet, "/meet/room1"), false);

console.log("Shared paths stay available everywhere");
for (const p of ["/settings", "/profile", "/notifications"]) {
  t(`docs serves ${p}`, shouldRedirectToHub(docs, p), false);
}
t("nested settings too", shouldRedirectToHub(docs, "/settings/delegation"), false);

console.log("API and assets are never redirected");
for (const p of ["/api/docs", "/_next/static/x.js", "/login", "/nexus.png"]) {
  t(`passthrough ${p}`, shouldRedirectToHub(docs, p), false);
}

console.log("Rewrites still correct");
t("docs root → /docs", subdomainToPath(docs, "/"), "/docs");
t("/sheets → /apps/sheets", subdomainToPath(docs, "/sheets"), "/apps/sheets");
t("/slides/x → /apps/slides/x", subdomainToPath(docs, "/slides/x"), "/apps/slides/x");
t("drive root → /drive", subdomainToPath(drive, "/"), "/drive");
t("meet/room → /meet/room", subdomainToPath(meet, "/room1"), "/meet/room1");

console.log("appUrl round-trips");
for (const p of ["/docs", "/apps/sheets", "/apps/sheets/abc", "/drive", "/meet", "/meet/r1"]) {
  const u = new URL(appUrl(p));
  const sub = matchSubdomain(u.host)!;
  t(`round-trip ${p}`, subdomainToPath(sub, u.pathname || "/"), p);
}
t("hub paths stay relative", appUrl("/inbox"), "/inbox");

console.log("Every subdomain has nav, and it only lists owned paths");
for (const sub of APP_SUBDOMAINS) {
  const items = SUBDOMAIN_NAV[sub.host];
  t(`${sub.host} has nav`, Array.isArray(items) && items.length > 0, true);
  for (const item of items ?? []) {
    t(`${sub.host} nav ${item.href} is owned`, shouldRedirectToHub(sub, item.href), false);
    t(`${sub.host} nav ${item.href} maps here`, subdomainForPath(item.href)?.host, sub.host);
  }
}

console.log("Sanity");
t("api passthrough", isPassthrough("/api/x"), true);
t("normal path not passthrough", isPassthrough("/docs"), false);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
