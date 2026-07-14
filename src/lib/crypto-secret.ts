import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// ─────────────────────────────────────────────────────────────────────────
// Symmetric encryption for secrets we must store but never expose again in
// plaintext through the API (IMAP app passwords for the migration wizard).
// Uses AES-256-GCM with a key derived from SESSION_SECRET via scrypt, so no
// new env var is required. Format: "<ivHex>:<authTagHex>:<cipherHex>".
// ─────────────────────────────────────────────────────────────────────────

const ALGO = "aes-256-gcm";
// Fixed salt is fine here — the secret we're protecting (SESSION_SECRET) is
// already high entropy and unique per-deployment; this isn't a password hash.
const SALT = "nexus-import-secret-v1";

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (32+ chars) to encrypt import credentials.");
  }
  return scryptSync(secret, SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivHex, authTagHex, cipherHex] = payload.split(":");
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error("Malformed encrypted secret payload.");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
