import { createHmac, timingSafeEqual, randomBytes } from "crypto";

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env var is missing or too short (min 32 chars)");
  }
  return Buffer.from(secret, "utf8");
}

/**
 * Signs a string payload with HMAC-SHA256.
 * Output format: base64url(payload).base64url(hmac)
 */
export function signPayload(payload: string): string {
  const secret = getSecret();
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies a signed payload. Returns the original string on success, null on failure.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyPayload(signed: string): string | null {
  try {
    const dot = signed.lastIndexOf(".");
    if (dot === -1) return null;

    const payloadB64 = signed.slice(0, dot);
    const receivedSig = signed.slice(dot + 1);

    const secret = getSecret();
    const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");

    const receivedBuf = Buffer.from(receivedSig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");

    // Length difference is itself not a secret — reject immediately and safely
    if (receivedBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(receivedBuf, expectedBuf)) return null;

    return Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}
