/**
 * Jitsi host resolution — one source of truth.
 *
 * This existed in five places reading TWO different environment variables:
 * `NEXT_PUBLIC_JITSI_DOMAIN` (client: CallStage, /meet/[roomId]) and
 * `JITSI_DOMAIN` (server: the join route, the middleware CSP). Setting only one
 * produced a split brain that is miserable to debug — the join API hands back a
 * self-hosted URL while the iframe embeds meet.jit.si, or the embed is right and
 * the CSP blocks the frame because it only allow-listed the public host.
 *
 * Both names are still honoured so existing deployments keep working, but the
 * value is resolved once, here.
 *
 * IMPORTANT for self-hosting: `NEXT_PUBLIC_JITSI_DOMAIN` is the one that must be
 * set. Next.js inlines NEXT_PUBLIC_* into the client bundle at BUILD time, so
 * the browser can never read a server-only `JITSI_DOMAIN`. Setting only the
 * server variable leaves every embedded call still pointing at meet.jit.si —
 * which is exactly the "I self-host, why am I on the Jitsi domain?" symptom.
 * Set it at build time, not just at runtime.
 */

/** Public Jitsi, used when nothing is configured. */
export const JITSI_FALLBACK_DOMAIN = "meet.jit.si";

/**
 * Hostname only, no scheme — e.g. "meet.cybersage.uk".
 *
 * Written as two literal `process.env.X` reads rather than a computed lookup
 * because Next.js's build-time substitution only matches the literal form.
 */
export const JITSI_DOMAIN: string =
  process.env.NEXT_PUBLIC_JITSI_DOMAIN ||
  process.env.JITSI_DOMAIN ||
  JITSI_FALLBACK_DOMAIN;

/** True when running against the public server rather than your own. */
export const isPublicJitsi = JITSI_DOMAIN === JITSI_FALLBACK_DOMAIN;

/** Origin form, for CSP directives and absolute links. */
export function jitsiOrigin(): string {
  return `https://${JITSI_DOMAIN}`;
}

/** Absolute URL for a room. */
export function jitsiRoomUrl(roomName: string): string {
  return `${jitsiOrigin()}/${encodeURIComponent(roomName)}`;
}

/**
 * Hosts a CSP must allow for meetings to render.
 *
 * Always includes the public host: a deployment can be mid-migration, and a
 * blocked frame is a blank screen with only a console error to explain it.
 */
export function jitsiCspHosts(): string[] {
  const hosts = new Set<string>([`https://${JITSI_FALLBACK_DOMAIN}`]);
  if (!isPublicJitsi) hosts.add(jitsiOrigin());
  return [...hosts];
}

/**
 * Warn once, server-side, when the server variable is set but the public one
 * isn't — the silent-misconfiguration case that sends users to meet.jit.si
 * despite a self-hosted instance being configured.
 */
if (
  typeof window === "undefined" &&
  process.env.JITSI_DOMAIN &&
  !process.env.NEXT_PUBLIC_JITSI_DOMAIN
) {
  console.warn(
    `[jitsi] JITSI_DOMAIN is set to "${process.env.JITSI_DOMAIN}" but ` +
      `NEXT_PUBLIC_JITSI_DOMAIN is not. The browser cannot read server-only ` +
      `env vars, so embedded calls will still use ${JITSI_FALLBACK_DOMAIN}. ` +
      `Set NEXT_PUBLIC_JITSI_DOMAIN at build time.`,
  );
}
