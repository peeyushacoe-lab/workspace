/**
 * Is this stored URL actually loadable by a browser?
 *
 * `avatarUrl` and `storageUrl` hold whatever the uploader wrote at the time.
 * When `R2_PUBLIC_URL` is unset, some of those rows contain a **bare object
 * key** — `cmqwr7xxo000004jrmnbxfcqm` with no scheme and no leading slash.
 * Dropped into an `<img src>`, the browser resolves it relative to the current
 * page, so `nexus.cybersage.uk/inbox` asks for
 * `nexus.cybersage.uk/cmqwr7xxo000004jrmnbxfcqm` and gets a 404. CLAUDE.md
 * already warns about this for attachments (always use the
 * `/api/attachments/[id]` proxy); avatars were never given the same treatment.
 *
 * Returning `null` for an unusable value is deliberate: every call site
 * already has an initials fallback, and showing initials is strictly better
 * than a broken image plus a 404 in the console on every page load.
 */
export function usableMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Same-origin absolute path — always fine.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  // Inline data (generated avatars) and protocol-relative CDN URLs.
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? trimmed : null;
  } catch {
    // Not a URL at all — a bare storage key. This is the 404 case.
    return null;
  }
}
