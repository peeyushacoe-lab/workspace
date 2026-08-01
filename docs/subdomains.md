# Per-app subdomains

Nexus serves several hostnames from **one** Vercel deployment. There is no second
app, no second build, no second database. Middleware reads the `Host` header and
rewrites the URL into the matching portal route.

The split mirrors Google Workspace: `docs.google.com` hosts Docs, Sheets *and*
Slides, while Drive and Meet get their own hostnames.

| Hostname | Serves | Portal route |
|---|---|---|
| `nexus.cybersage.uk` | Hub — login, inbox, chat, calendar, admin, settings, everything | all paths |
| `docs.cybersage.uk` | Docs, Sheets, Slides | `/docs`, `/apps/sheets`, `/apps/slides` |
| `drive.cybersage.uk` | Drive | `/drive` |
| `meet.cybersage.uk` | Meet | `/meet` |

Source of truth: `src/lib/subdomains.ts` (`APP_SUBDOMAINS`).

## URL shapes

```
docs.cybersage.uk               → /docs              (document list)
docs.cybersage.uk/sheets        → /apps/sheets
docs.cybersage.uk/sheets/abc123 → /apps/sheets/abc123
docs.cybersage.uk/slides/abc123 → /apps/slides/abc123
docs.cybersage.uk/apps/sheets   → /apps/sheets       (long form still works)
drive.cybersage.uk              → /drive
meet.cybersage.uk/room-42       → /meet/room-42
```

The hub keeps serving every path, so `nexus.cybersage.uk/docs` still works and no
existing link or bookmark breaks.

## Setup — do these three things

### 1. DNS

Add a CNAME per subdomain, pointing at Vercel:

```
docs   CNAME  cname.vercel-dns.com.
drive  CNAME  cname.vercel-dns.com.
meet   CNAME  cname.vercel-dns.com.
```

If `cybersage.uk` is on Cloudflare, set these records to **DNS only** (grey
cloud), not proxied — a proxied record hides the real `Host` header behaviour
Vercel needs for domain matching.

### 2. Vercel

In the project → Settings → Domains, add all three:

```
docs.cybersage.uk
drive.cybersage.uk
meet.cybersage.uk
```

Add them as **separate domains on the same project**, not as redirects. Vercel
issues a certificate for each. Do not set a "Redirect to" target — the rewrite
happens in middleware, not at the edge config level.

### 3. Environment variables

```bash
COOKIE_DOMAIN=.cybersage.uk
NEXT_PUBLIC_ROOT_DOMAIN=cybersage.uk   # optional; otherwise derived from NEXT_PUBLIC_APP_URL
```

`COOKIE_DOMAIN` is the one that matters. Session cookies are currently host-only,
meaning a cookie set on `nexus.cybersage.uk` is **not** sent to
`docs.cybersage.uk` — without this variable, opening Docs would bounce the user
straight back to the login page.

> ⚠️ **Everyone gets logged out once** on the deploy that introduces
> `COOKIE_DOMAIN`. The old host-only cookie and the new domain-wide cookie are
> different cookies as far as the browser is concerned. This is a one-time
> effect; announce it or ship it off-hours.

Leave `COOKIE_DOMAIN` unset locally — `localhost` has no subdomains and
host-only cookies are the correct default there.

## How it works

**Rewrite** — `src/middleware.ts` resolves the subdomain *before* auth gating, so
the rewritten path is what gets permission-checked. A logged-out user hitting
`docs.cybersage.uk/sheets/abc` is sent to login with `next=/apps/sheets/abc` and
lands back in the right place.

**Passthrough** — `/api`, `/_next`, `/login` and static assets are never
rewritten. This matters most for `/api`: the Docs page running on
`docs.cybersage.uk` fetches `/api/docs` same-origin, and rewriting that to
`/docs/api/docs` would 404 every request the app makes.

**Links** — `next/link` cannot navigate across origins. `src/components/AppLink.tsx`
resolves each nav target with `appUrl()` and renders a plain `<a>` when the
target is on a different host, or a normal `<Link>` (fast client-side routing)
when it isn't. Moving between Docs and Sheets stays client-side because both live
on `docs.cybersage.uk`. `useAppNavigate()` is the equivalent for `onClick`
handlers.

**Preview deployments** — `matchSubdomain()` only matches an exact
`<app>.<root>` hostname, so a Vercel preview URL beginning with `docs-` is not
mistaken for the Docs subdomain and previews keep serving the full path space.

## Adding another subdomain later

1. Add an entry to `APP_SUBDOMAINS` in `src/lib/subdomains.ts`.
2. Add the DNS record and the Vercel domain.

Nothing else — middleware, `AppLink` and the app launcher all read from that
array.

## Verifying after deploy

```bash
# should return 200 and render the Docs list
curl -sI https://docs.cybersage.uk | head -1

# should return the Sheets route, not a 404
curl -sI https://docs.cybersage.uk/sheets | head -1

# the hub must still serve everything
curl -sI https://nexus.cybersage.uk/docs | head -1
```

Then, logged in on `nexus.cybersage.uk`, open `docs.cybersage.uk` in the same
browser: you should already be authenticated. If you land on the login page,
`COOKIE_DOMAIN` is not set or was set after the cookie was issued — sign out and
back in once.
