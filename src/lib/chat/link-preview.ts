import { redis } from "@/lib/redis";

/**
 * Open Graph unfurling for links pasted into Connect.
 *
 * The whole feature is one big SSRF invitation and is written accordingly: the
 * server fetches an arbitrary URL that an unprivileged user chose. Without the
 * guards below, "paste a link in chat" becomes "make the Vercel function issue
 * a GET to anywhere", including cloud metadata endpoints (169.254.169.254),
 * anything on the VPC, and `http://localhost:*` — which on this app includes
 * Meilisearch and, in some deployments, Redis.
 *
 * So: public HTTP(S) only, no redirects to private space, hard timeout, hard
 * response cap, and never any credentials. The preview is decoration; failing
 * closed costs nothing.
 */

export type LinkPreview = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

/** Fetch budget. A page that hasn't answered in 4s isn't worth a preview card. */
const FETCH_TIMEOUT_MS = 4_000;

/** Stop reading after this much HTML — OG tags live in <head>, near the top. */
const MAX_BYTES = 256 * 1024;

/** Previews are immutable enough for a day, and this is the SSRF rate limiter too. */
const CACHE_TTL_SECONDS = 60 * 60 * 24;

/**
 * Hostnames and IP literals that must never be fetched.
 *
 * Checked against the resolved *URL*, and then re-checked after each redirect
 * hop — a public hostname 302-ing to `http://169.254.169.254/` is the standard
 * way this gets exploited, and checking only the first URL catches none of it.
 */
function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) {
    return true;
  }

  // IPv6 loopback / link-local / unique-local.
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;          // this-network, private, loopback
    if (a === 169 && b === 254) return true;                     // link-local — cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;            // private
    if (a === 192 && b === 168) return true;                     // private
    if (a === 100 && b >= 64 && b <= 127) return true;           // carrier-grade NAT
    if (a >= 224) return true;                                   // multicast / reserved
  }

  return false;
}

/** Parse and vet a candidate URL. Returns null for anything not safely fetchable. */
function safeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Blocks file:, data:, gopher:, ftp: and friends.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isForbiddenHost(url.hostname)) return null;
  // Credentials in the URL would be forwarded to whatever we fetch.
  if (url.username || url.password) return null;
  return url;
}

/** First URL in a message body, if any. */
export function firstUrl(content: string): string | null {
  const match = content.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0] : null;
}

const META_RE = /<meta\s+[^>]*>/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

/** Decode the handful of entities that actually show up in OG tags. */
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

/**
 * Pull OG/Twitter tags out of HTML with regex rather than a DOM parser.
 *
 * Deliberate: this input is hostile by definition and a full parser is a much
 * larger attack surface (and dependency) than the four fields we want. Nothing
 * extracted here is ever rendered as HTML — see the escaping note below.
 */
function parseMeta(html: string, url: URL): LinkPreview {
  const preview: LinkPreview = { url: url.toString() };

  for (const tag of html.match(META_RE) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (!content) continue;

    switch (key) {
      case "og:title":
      case "twitter:title":
        preview.title ??= decodeEntities(content);
        break;
      case "og:description":
      case "twitter:description":
      case "description":
        preview.description ??= decodeEntities(content);
        break;
      case "og:image":
      case "og:image:secure_url":
      case "twitter:image":
        preview.image ??= decodeEntities(content);
        break;
      case "og:site_name":
        preview.siteName ??= decodeEntities(content);
        break;
    }
  }

  if (!preview.title) {
    const t = html.match(TITLE_RE);
    if (t) preview.title = decodeEntities(t[1]);
  }
  preview.siteName ??= url.hostname.replace(/^www\./, "");

  // The image is loaded by the browser via <img src>, so it gets the same
  // treatment as the page URL — otherwise og:image could point at an internal
  // host and use each viewer's browser as the probe instead of the server.
  if (preview.image) {
    const abs = (() => {
      try { return new URL(preview.image!, url).toString(); } catch { return null; }
    })();
    const vetted = abs ? safeUrl(abs) : null;
    preview.image = vetted ? vetted.toString() : undefined;
  }

  // Trim to something a card can hold. Values are rendered as text nodes by
  // React, which escapes them — no dangerouslySetInnerHTML anywhere near this.
  if (preview.title) preview.title = preview.title.slice(0, 160);
  if (preview.description) preview.description = preview.description.slice(0, 300);

  return preview;
}

/**
 * Fetch and parse a preview, or null.
 *
 * Redirects are followed manually, one hop at a time, so each new location can
 * be re-vetted. `fetch`'s own `redirect: "follow"` would happily land on a
 * private address after a public first hop.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  const start = safeUrl(rawUrl);
  if (!start) return null;

  const cacheKey = `linkpreview:${start.toString()}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached === "null" ? null : (JSON.parse(cached) as LinkPreview);
  } catch {
    // Cache miss by way of a dead Redis is fine; just costs a fetch.
  }

  let current = start;
  let html: string | null = null;

  for (let hop = 0; hop < 3; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Identify honestly, and ask for HTML only.
          "User-Agent": "NexusBot/1.0 (+https://nexus.cybersage.uk; link preview)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      clearTimeout(timer);
      return cacheAndReturn(cacheKey, null);
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return cacheAndReturn(cacheKey, null);
      const next = safeUrl(new URL(location, current).toString());
      // A redirect into private space is the exploit, not an error to follow.
      if (!next) return cacheAndReturn(cacheKey, null);
      current = next;
      continue;
    }

    if (!res.ok) return cacheAndReturn(cacheKey, null);
    if (!(res.headers.get("content-type") ?? "").includes("html")) {
      return cacheAndReturn(cacheKey, null);
    }

    html = await readCapped(res);
    break;
  }

  if (!html) return cacheAndReturn(cacheKey, null);

  const preview = parseMeta(html, current);
  // A card with no title is just a link with extra padding.
  return cacheAndReturn(cacheKey, preview.title ? preview : null);
}

/** Read at most MAX_BYTES of the body, so a multi-GB response can't exhaust memory. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder("utf-8", { fatal: false }).decode(
    chunks.reduce((acc, c) => {
      const out = new Uint8Array(acc.length + c.length);
      out.set(acc);
      out.set(c, acc.length);
      return out;
    }, new Uint8Array()),
  );
}

/**
 * Cache the outcome, including failures.
 *
 * Negative caching matters here: without it, a message containing a link to a
 * dead host re-triggers a 4-second server-side fetch for every person who
 * scrolls past it, forever.
 */
async function cacheAndReturn(key: string, preview: LinkPreview | null): Promise<LinkPreview | null> {
  await redis
    .set(key, preview ? JSON.stringify(preview) : "null", "EX", CACHE_TTL_SECONDS)
    .catch(() => {});
  return preview;
}
